import { describe, expect, it } from 'vitest';
import { dados, getComponent, param, restoreSim, type Sim, type SimEvent } from '../../src/sim';
import { emTransito, estoque, raioDaJazida } from '../../src/sim/economia';
import { arco, normalizar, type Vec3 } from '../../src/sim/map/esfera';
import { comandosDoJogo, sistemasDoJogo } from '../../src/sim/units';
import { statsMovel } from '../../src/sim/units/stats';
import { alvo, criar, mundoLiso, ordenar, partida, RAIO, semear } from './mundo-teste';

const coleta = (sim: Sim, id: number) => getComponent(sim.state, id, 'coleta')!;
const jazida = (sim: Sim, id: number) => getComponent(sim.state, id, 'jazida');
const direcao = (sim: Sim, id: number): Vec3 => {
  const p = getComponent(sim.state, id, 'position')!;
  return normalizar([p.x, p.y, p.z]);
};
const distancia = (sim: Sim, a: number, b: number) => RAIO * arco(direcao(sim, a), direcao(sim, b));
/** Folga entre o casco do hover e a borda da jazida. */
const folga = (sim: Sim, hover: number, j: number) =>
  distancia(sim, hover, j) -
  getComponent(sim.state, j, 'obstacle')!.raio -
  statsMovel('hover_explorer').raio_m;

function rodarAte(sim: Sim, condicao: () => boolean, limite_s: number, eventos?: SimEvent[]) {
  for (let t = 0; t < limite_s * sim.tickHz; t++) {
    if (condicao()) return true;
    const ev = sim.step();
    eventos?.push(...ev);
  }
  return condicao();
}

describe('T-030 — ECO-04 a ECO-06, D-27: jazidas', () => {
  it('ECO-04/ECO-06: só slots_por_jazida hovers mineram; o excedente vai a outra do mesmo tipo', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [a, b] = semear(sim, [
      { recurso: 'fe', quantidade: 1000, x: 30, z: 0 },
      { recurso: 'fe', quantidade: 1000, x: 30, z: 25 },
    ]);
    const hovers = criar(
      sim,
      Array.from({ length: 4 }, (_, k) => ({
        unidade: 'hover_explorer' as const,
        x: 18,
        z: -6 + k * 3,
      })),
    );
    ordenar(sim, 'coletar', { ids: hovers, jazida: a });
    sim.step();
    expect(jazida(sim, a!)!.vagas).toEqual(hovers.slice(0, param('slots_por_jazida')));
    expect(coleta(sim, hovers[3]!).jazida).toBe(b);
  });

  it('ECO-06: sem outra jazida por perto, o excedente espera na fila e entra quando vaga', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [a] = semear(sim, [{ recurso: 'fe', quantidade: 1000, x: 30, z: 0 }]);
    const hovers = criar(
      sim,
      Array.from({ length: 4 }, (_, k) => ({
        unidade: 'hover_explorer' as const,
        x: 18,
        z: -6 + k * 3,
      })),
    );
    ordenar(sim, 'coletar', { ids: hovers, jazida: a });
    sim.step();
    const quarto = hovers[3]!;
    expect(coleta(sim, quarto).estado).toBe('esperando');
    expect(jazida(sim, a!)!.fila).toEqual([quarto]);
    // Quando um dos três sai para entregar, o da fila ocupa a vaga.
    expect(rodarAte(sim, () => coleta(sim, quarto).estado === 'minerando', 40)).toBe(true);
    expect(jazida(sim, a!)!.fila).toEqual([]);
  });

  it('ECO-05/D-27: o raio de colisão acompanha a quantidade; a navegação só muda com as células', () => {
    expect(raioDaJazida(100, 100)).toBe(param('raio_jazida_max_m'));
    expect(raioDaJazida(50, 100)).toBeCloseTo(
      (param('raio_jazida_max_m') + param('raio_jazida_min_m')) / 2,
      12,
    );
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [a] = semear(sim, [{ recurso: 'fe', quantidade: 60, x: 30, z: 0 }]);
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 18, z: 0 }]);
    ordenar(sim, 'coletar', { ids: [h], jazida: a });
    const versaoInicial = sim.state.versaoObstaculos;
    let ticksMinerando = 0;
    for (let t = 0; t < 40 * sim.tickHz; t++) {
      sim.step();
      const j = jazida(sim, a!);
      if (!j) break;
      if (coleta(sim, h!).estado === 'minerando') ticksMinerando++;
      expect(getComponent(sim.state, a!, 'obstacle')!.raio).toBeCloseTo(
        raioDaJazida(j.quantidade, j.inicial),
        12,
      );
    }
    const mudancas = sim.state.versaoObstaculos - versaoInicial;
    expect(ticksMinerando).toBeGreaterThan(100);
    expect(mudancas).toBeLessThan(ticksMinerando / 10);
  });

  it('ECO-05: em 0 a jazida some e dispara AL-07 para quem minerava nela', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [a] = semear(sim, [{ recurso: 'cu', quantidade: 5, x: 30, z: 0 }]);
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 18, z: 0 }]);
    ordenar(sim, 'coletar', { ids: [h], jazida: a });
    const eventos: SimEvent[] = [];
    expect(rodarAte(sim, () => jazida(sim, a!) === undefined, 30, eventos)).toBe(true);
    expect(eventos.filter((e) => e.tipo === 'alerta')).toEqual([
      expect.objectContaining({
        dados: expect.objectContaining({ id: 'AL-07', nacao: 'bra', recurso: 'cu', jazida: a }),
      }),
    ]);
    // A carga que sobrou vai para o depósito.
    expect(rodarAte(sim, () => Math.abs(estoque(sim.state, 'bra').cu - 5) < 1e-9, 20)).toBe(true);
  });

  it('MOV-04: unidades não atravessam a jazida', () => {
    const sim = partida(mundoLiso());
    const [a] = semear(sim, [{ recurso: 'ti', quantidade: 800, x: 0, z: 30 }]);
    const [u] = criar(sim, [{ unidade: 'hover_ex1', x: -25, z: 30 }]);
    ordenar(sim, 'mover', { ids: [u], ...alvo(25, 30) });
    const minimo = param('raio_jazida_max_m') + statsMovel('hover_ex1').raio_m;
    let menor = Infinity;
    for (let t = 0; t < 30 * sim.tickHz; t++) {
      sim.step();
      menor = Math.min(menor, distancia(sim, u!, a!));
    }
    expect(menor).toBeGreaterThanOrEqual(minimo - 0.01);
  });
});

describe('T-031 — ECO-09 a ECO-12: ciclo de coleta', () => {
  it('ECO-09/D-27: minera à taxa do recurso, só a até distancia_mineracao_m da borda', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [a] = semear(sim, [{ recurso: 'cu', quantidade: 1000, x: 30, z: 0 }]);
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 18, z: 0 }]);
    ordenar(sim, 'coletar', { ids: [h], jazida: a });
    expect(rodarAte(sim, () => coleta(sim, h!).estado === 'minerando', 20)).toBe(true);
    const taxa = dados.recursos.find((r) => r.id === 'cu')!.taxa_mineracao_u_s;
    let anterior = coleta(sim, h!).carga;
    for (let t = 0; t < 5 * sim.tickHz; t++) {
      sim.step();
      expect(folga(sim, h!, a!)).toBeLessThanOrEqual(param('distancia_mineracao_m') + 1e-9);
      expect(coleta(sim, h!).carga - anterior).toBeCloseTo(taxa / sim.tickHz, 9);
      anterior = coleta(sim, h!).carga;
    }
  });

  it('ECO-10: entrega no ponto mais próximo pelo caminho (não em linha reta)', () => {
    // Armazém a 25 m da jazida em linha reta, atrás de um paredão; a Nave, a ~29 m pelo caminho.
    const mundo = mundoLiso((x, z) => x >= 15 && x <= 65 && z >= 10 && z <= 14);
    const sim = partida(mundo);
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [armazem] = criar(sim, [{ estrutura: 'storage', x: 40, z: 25 }]);
    const [a] = semear(sim, [{ recurso: 'fe', quantidade: 1000, x: 40, z: 0 }]);
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 30, z: -4 }]);
    ordenar(sim, 'coletar', { ids: [h], jazida: a });
    expect(rodarAte(sim, () => coleta(sim, h!).estado === 'indo_entregar', 30)).toBe(true);
    expect(coleta(sim, h!).entrega).toBe(nave);
    expect(coleta(sim, h!).entrega).not.toBe(armazem);
  });

  it('ECO-11/ECO-14/ECO-15: descarrega em tempo_descarga_hover_s; só então vira estoque', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [a] = semear(sim, [{ recurso: 'fe', quantidade: 1000, x: 30, z: 0 }]);
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 18, z: 0 }]);
    ordenar(sim, 'coletar', { ids: [h], jazida: a });
    expect(rodarAte(sim, () => coleta(sim, h!).estado === 'descarregando', 40)).toBe(true);
    // Em trânsito até descarregar; o estoque ainda não tem o Fe.
    expect(estoque(sim.state, 'bra').fe).toBe(0);
    expect(emTransito(sim.state, 'bra').fe).toBe(param('carga_hover_u'));
    const ticks = Math.round(param('tempo_descarga_hover_s') * sim.tickHz);
    sim.run(ticks - 2);
    expect(estoque(sim.state, 'bra').fe).toBe(0);
    sim.run(2);
    expect(estoque(sim.state, 'bra').fe).toBe(param('carga_hover_u'));
    expect(emTransito(sim.state, 'bra').fe).toBe(0);
  });

  it('ECO-12: depois de descarregar, volta à mesma jazida', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [a] = semear(sim, [
      { recurso: 'fe', quantidade: 1000, x: 30, z: 0 },
      { recurso: 'fe', quantidade: 1000, x: 20, z: -20 },
    ]);
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 18, z: 0 }]);
    ordenar(sim, 'coletar', { ids: [h], jazida: a });
    expect(rodarAte(sim, () => estoque(sim.state, 'bra').fe > 0, 40)).toBe(true);
    sim.step();
    expect(coleta(sim, h!).jazida).toBe(a);
    expect(rodarAte(sim, () => coleta(sim, h!).estado === 'minerando', 20)).toBe(true);
    expect(coleta(sim, h!).jazida).toBe(a);
  });

  it('uma ordem manual de movimento interrompe a coleta e mantém a carga', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [a] = semear(sim, [{ recurso: 'fe', quantidade: 1000, x: 30, z: 0 }]);
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 18, z: 0 }]);
    ordenar(sim, 'coletar', { ids: [h], jazida: a });
    expect(rodarAte(sim, () => coleta(sim, h!).carga > 3, 30)).toBe(true);
    const carga = coleta(sim, h!).carga;
    ordenar(sim, 'mover', { ids: [h], ...alvo(0, -30) });
    sim.step();
    expect(coleta(sim, h!).estado).toBe('ocioso');
    expect(coleta(sim, h!).carga).toBeCloseTo(carga, 9);
    expect(jazida(sim, a!)!.vagas).not.toContain(h);
  });
});

describe('T-032 — ECO-14 a ECO-17: estoque', () => {
  it('ECO-17: Nave e Armazém formam uma rede: o estoque é um só', () => {
    const sim = partida(mundoLiso());
    criar(sim, [
      { estrutura: 'ship', x: 0, z: 0 },
      { estrutura: 'storage', x: 70, z: 0 },
    ]);
    const [perto, longe] = semear(sim, [
      { recurso: 'si', quantidade: 1000, x: 0, z: 25 },
      { recurso: 'si', quantidade: 1000, x: 70, z: 20 },
    ]);
    const [h1, h2] = criar(sim, [
      { unidade: 'hover_explorer', x: 5, z: 15 },
      { unidade: 'hover_explorer', x: 65, z: 12 },
    ]);
    ordenar(sim, 'coletar', { ids: [h1], jazida: perto });
    ordenar(sim, 'coletar', { ids: [h2], jazida: longe });
    expect(rodarAte(sim, () => estoque(sim.state, 'bra').si >= 20, 60)).toBe(true);
    expect(estoque(sim.state, 'bra').si).toBe(20);
    expect(estoque(sim.state, 'usa').si).toBe(0);
  });

  it('TEC-08: snapshot no meio do ciclo restaura o mesmo resultado', () => {
    const mundo = mundoLiso();
    const a = partida(mundo);
    criar(a, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [j] = semear(a, [{ recurso: 'fe', quantidade: 200, x: 30, z: 0 }]);
    const hovers = criar(
      a,
      Array.from({ length: 5 }, (_, k) => ({
        unidade: 'hover_explorer' as const,
        x: 15,
        z: -6 + k * 3,
      })),
    );
    ordenar(a, 'coletar', { ids: hovers, jazida: j });
    a.run(300);
    const b = restoreSim(a.snapshot(), {
      mundo,
      systems: sistemasDoJogo,
      commandHandlers: comandosDoJogo,
    });
    a.run(600);
    b.run(600);
    expect(b.hash()).toBe(a.hash());
    expect(estoque(b.state, 'bra')).toEqual(estoque(a.state, 'bra'));
  });
});
