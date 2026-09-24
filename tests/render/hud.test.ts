import { describe, expect, it } from 'vitest';
import { getComponent, param } from '../../src/sim';
import {
  barrasDe,
  corDoHp,
  corpos,
  estadoDaUnidade,
  relogio,
  resumoDaJazida,
} from '../../src/game/hud';
import { resumoDaSelecao } from '../../src/game/painelSelecao';
import { statsMovel } from '../../src/sim/units/stats';
import { alvo, criar, mundoLiso, ordenar, partida, semear } from '../sim/mundo-teste';

describe('T-080 — UI-01: barra superior', () => {
  it('UI-01: relógio da partida em m:ss', () => {
    expect(relogio(0, 20)).toBe('0:00');
    expect(relogio(20 * 65, 20)).toBe('1:05');
    expect(relogio(20 * 600 + 19, 20)).toBe('10:00');
  });

  it('UI-01: corpos contam só as unidades móveis da nação, sobre limite_corpos', () => {
    const sim = partida(mundoLiso());
    criar(sim, [
      { estrutura: 'ship', x: 0, z: 0 },
      { unidade: 'hover_explorer', x: 20, z: 0 },
      { unidade: 'printer', x: 25, z: 0 },
    ]);
    criar(sim, [{ unidade: 'hover_ex1', x: 60, z: 0 }], 'usa');
    expect(corpos(sim.state, 'bra')).toEqual({ n: 2, limite: param('limite_corpos') });
  });
});

describe('T-081 — UI-03: painel de seleção', () => {
  it('UI-03: uma unidade mostra HP, EN, estado, carga e arma', () => {
    const sim = partida(mundoLiso());
    const [h, ex1] = criar(sim, [
      { unidade: 'hover_explorer', x: 20, z: 0 },
      { unidade: 'hover_ex1', x: 30, z: 0 },
    ]);
    const hover = resumoDaSelecao(sim.state, [h!]);
    expect(hover).toMatchObject({
      tipo: 'corpo',
      modelo: 'hover_explorer',
      hp: statsMovel('hover_explorer').hp,
      hpMax: statsMovel('hover_explorer').hp,
      en: { atual: statsMovel('hover_explorer').bateria_en },
      carga: { atual: 0, max: param('carga_hover_u') },
      arma: null,
    });
    const militar = resumoDaSelecao(sim.state, [ex1!]);
    expect(militar).toMatchObject({
      tipo: 'corpo',
      carga: null,
      arma: { alcance: expect.any(Number) },
    });
  });

  it('UI-03: várias unidades se agrupam por tipo com as mini-barras de HP', () => {
    const sim = partida(mundoLiso());
    const ids = criar(sim, [
      { unidade: 'hover_ex1', x: 20, z: 0 },
      { unidade: 'hover_ex1', x: 22, z: 0 },
      { unidade: 'hover_opq', x: 24, z: 0 },
    ]);
    getComponent(sim.state, ids[1]!, 'vida')!.hp /= 2;
    const resumo = resumoDaSelecao(sim.state, ids);
    expect(resumo).toEqual({
      tipo: 'grupo',
      grupos: [
        { modelo: 'hover_ex1', ids: [ids[0], ids[1]], hp: [1, 0.5] },
        { modelo: 'hover_opq', ids: [ids[2]], hp: [1] },
      ],
    });
  });

  it('UI-03: o estado acompanha o que a unidade faz', () => {
    const sim = partida(mundoLiso());
    const [u] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    expect(estadoDaUnidade(sim.state, u!)).toBe('estado.ocioso');
    ordenar(sim, 'mover', { ids: [u], ...alvo(0, 40) });
    sim.step();
    expect(estadoDaUnidade(sim.state, u!)).toBe('estado.movendo');
    getComponent(sim.state, u!, 'bateria')!.en = 0;
    expect(estadoDaUnidade(sim.state, u!)).toBe('estado.reserva');
  });
});

describe('T-085 — UI-07: barras sobre as unidades', () => {
  it('UI-07: no automático, só selecionadas, danificadas ou com bateria Baixa; "sempre" mostra todas', () => {
    const sim = partida(mundoLiso());
    const [a, b, c] = criar(sim, [
      { unidade: 'hover_ex1', x: 0, z: 0 },
      { unidade: 'hover_ex1', x: 5, z: 0 },
      { unidade: 'hover_ex1', x: 10, z: 0 },
    ]);
    getComponent(sim.state, b!, 'vida')!.hp -= 10;
    const bat = getComponent(sim.state, c!, 'bateria')!;
    bat.en = (bat.max * param('limiar_bateria_baixa_pct')) / 100;
    expect(barrasDe(sim.state, a!, false, false)).toBeNull();
    expect(barrasDe(sim.state, a!, true, false)).toEqual({ hp: 1, en: 1 });
    expect(barrasDe(sim.state, b!, false, false)?.hp).toBeLessThan(1);
    expect(barrasDe(sim.state, c!, false, false)?.en).toBeCloseTo(
      param('limiar_bateria_baixa_pct') / 100,
      9,
    );
    expect(barrasDe(sim.state, a!, false, true)).toEqual({ hp: 1, en: 1 });
  });

  it('UI-07: estruturas só têm a barra de HP', () => {
    const sim = partida(mundoLiso());
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    expect(barrasDe(sim.state, nave!, true, false)).toEqual({ hp: 1, en: null });
  });

  it('UI-07: HP verde cheio, amarelo na metade, vermelho vazio', () => {
    const [rv, gv] = corDoHp(1);
    expect(gv).toBeGreaterThan(rv);
    const [ra, ga, ba] = corDoHp(0.5);
    expect(ra).toBeGreaterThan(0.9);
    expect(ga).toBeGreaterThan(0.7);
    expect(ba).toBeLessThan(0.3);
    const [rz, gz] = corDoHp(0);
    expect(rz).toBe(1);
    expect(gz).toBeLessThan(0.4);
  });
});

describe('T-088 — UI-13: informação de jazidas', () => {
  it('UI-13: recurso, restante sobre inicial e hovers designados', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [j] = semear(sim, [{ recurso: 'li', quantidade: 600, x: 30, z: 0 }]);
    const hovers = criar(sim, [
      { unidade: 'hover_explorer', x: 20, z: 5 },
      { unidade: 'hover_explorer', x: 20, z: -5 },
    ]);
    ordenar(sim, 'coletar', { ids: hovers, jazida: j });
    sim.step();
    expect(resumoDaJazida(sim.state, j!)).toEqual({
      recurso: 'li',
      quantidade: 600,
      inicial: 600,
      hovers: 2,
    });
    expect(resumoDaSelecao(sim.state, [j!])).toEqual({
      tipo: 'jazida',
      recurso: 'li',
      quantidade: 600,
      inicial: 600,
      hovers: 2,
    });
  });
});
