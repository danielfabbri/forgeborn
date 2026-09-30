import { describe, expect, it } from 'vitest';
import { createSim, dados, getComponent, param, type Sim, type SimEvent } from '../../src/sim';
import {
  chuvaAtiva,
  sistemaChuvaAcida,
  type EstadoDaChuva,
} from '../../src/sim/cenario/chuvaAcida';
import { multSolarDoEvento, multVisao } from '../../src/sim/cenario/tempestade';
import { geracaoDaRede } from '../../src/sim/energia';
import { estadoEm, VISIVEL } from '../../src/sim/visao/nevoa';
import { criar, mundoLiso, partida, ponto } from './mundo-teste';

function rodarAte(sim: Sim, tick: number, eventos?: SimEvent[]) {
  while (sim.state.tick < tick) {
    const novos = sim.step();
    eventos?.push(...novos);
  }
}
/** Só o sistema da chuva ácida, para percorrer minutos de partida rápido. */
const soChuva = (cenario: 'venus' | 'lua' = 'venus') =>
  createSim(1, ['bra', 'usa'], { cenario, systems: { energia: sistemaChuvaAcida } });
/** Começa uma chuva ácida agora (para os efeitos, sem esperar o sorteio). */
function comecarJa(sim: Sim) {
  const dur = param('venus_chuva_duracao_s') * sim.tickHz;
  sim.state.chuva = { inicio: sim.state.tick, fim: sim.state.tick + dur, avisada: true };
}

describe('T-200 — CEN-18, D-97: chuva ácida em Vênus', () => {
  it('CEN-18: começa entre os intervalos, dura venus_chuva_duracao_s e o AL-24 sai antes', () => {
    const sim = soChuva();
    const hz = sim.tickHz;
    const eventos: SimEvent[] = [];
    sim.step();
    const c = sim.state.chuva as EstadoDaChuva;
    const min = param('venus_chuva_intervalo_min_s') * hz;
    const max = param('venus_chuva_intervalo_max_s') * hz;
    expect(c.inicio).toBeGreaterThanOrEqual(min);
    expect(c.inicio).toBeLessThanOrEqual(max);
    expect(c.fim - c.inicio).toBe(param('venus_chuva_duracao_s') * hz);
    const aviso = c.inicio - param('venus_chuva_aviso_s') * hz;
    rodarAte(sim, aviso, eventos);
    expect(eventos.some((e) => e.tipo === 'alerta')).toBe(false);
    rodarAte(sim, aviso + 1, eventos);
    expect(eventos.filter((e) => e.tipo === 'alerta').map((e) => e.dados)).toEqual([
      { id: 'AL-24', nacao: 'bra' },
      { id: 'AL-24', nacao: 'usa' },
    ]);
    expect(chuvaAtiva(sim.state)).toBe(false);
    rodarAte(sim, c.inicio + 1, eventos);
    expect(chuvaAtiva(sim.state)).toBe(true);
    expect(
      eventos.some((e) => e.tipo === 'chuva_acida' && (e.dados as { ativa: boolean }).ativa),
    ).toBe(true);
    rodarAte(sim, c.fim + 1, eventos);
    expect(chuvaAtiva(sim.state)).toBe(false);
    // A próxima é sorteada a partir do fim desta.
    const proxima = sim.state.chuva as EstadoDaChuva;
    expect(proxima.inicio - c.fim).toBeGreaterThanOrEqual(min);
    expect(proxima.inicio - c.fim).toBeLessThanOrEqual(max);
  });

  it('CEN-18: a mesma seed dá as mesmas chuvas', () => {
    const a = soChuva();
    const b = soChuva();
    a.step();
    b.step();
    expect(a.state.chuva).toEqual(b.state.chuva);
  });

  it('CEN-18: durante a chuva a visão e a geração solar caem pelos multiplicadores', () => {
    const sim = partida(mundoLiso(), ['bra', 'usa'], 'venus');
    criar(sim, [{ estrutura: 'solar_plant', x: 0, z: 0 }]);
    const antes = geracaoDaRede(sim.state, 'bra');
    expect(antes).toBeGreaterThan(0);
    // Vênus já tem `mult_visao` 0,9 de base (CEN-02, fora da chuva).
    const base = dados.cenarios.find((c) => c.id === 'venus')!.mult_visao;
    expect(multVisao(sim.state)).toBeCloseTo(base);
    comecarJa(sim);
    expect(multVisao(sim.state)).toBeCloseTo(base * param('venus_chuva_mult_visao'));
    expect(multSolarDoEvento(sim.state)).toBeCloseTo(param('venus_chuva_mult_solar'));
    expect(geracaoDaRede(sim.state, 'bra')).toBeCloseTo(antes * param('venus_chuva_mult_solar'));
  });

  it('CEN-18: a névoa encolhe na chuva (um ponto perto do limite da visão some)', () => {
    const sim = partida(mundoLiso(), ['bra', 'usa'], 'venus');
    criar(sim, [{ unidade: 'hover_scout', x: 0, z: 0 }]);
    rodarAte(sim, sim.state.tick + 8);
    const ctx = { state: sim.state, mundo: mundoLiso() } as never;
    const visao = dados.moveis.find((m) => m.id === 'hover_scout')!.visao_m;
    const base = dados.cenarios.find((c) => c.id === 'venus')!.mult_visao;
    const alvo = ponto(0, (visao * base * (1 + param('venus_chuva_mult_visao'))) / 2);
    expect(estadoEm(ctx, 'bra', alvo)).toBe(VISIVEL);
    comecarJa(sim);
    rodarAte(sim, sim.state.tick + 8);
    expect(estadoEm(ctx, 'bra', alvo)).not.toBe(VISIVEL);
  });

  it('CEN-18: dano contínuo leve a unidades e estruturas, de qualquer nação, sem bônus nem mínimo', () => {
    const sim = partida(mundoLiso(), ['bra', 'usa'], 'venus', false);
    const [hover] = criar(sim, [{ unidade: 'hover_explorer', x: 0, z: 0 }]);
    const [muro] = criar(sim, [{ estrutura: 'wall', x: 30, z: 0, nacao: 'usa' }]);
    const hpHoverAntes = getComponent(sim.state, hover!, 'vida')!.hp;
    const hpMuroAntes = getComponent(sim.state, muro!, 'vida')!.hp;
    comecarJa(sim);
    rodarAte(sim, sim.state.tick + sim.tickHz); // 1 s de chuva ativa.
    const dano = param('venus_chuva_dano_hp_s');
    expect(getComponent(sim.state, hover!, 'vida')!.hp).toBeCloseTo(hpHoverAntes - dano, 1);
    expect(getComponent(sim.state, muro!, 'vida')!.hp).toBeCloseTo(hpMuroAntes - dano, 1);
  });

  it('CEN-18: cenários sem o evento não têm chuva ácida (nem consomem a seed)', () => {
    const sim = soChuva('lua');
    const rng = JSON.stringify(sim.state.rng);
    sim.step();
    expect(sim.state.chuva).toBeUndefined();
    expect(JSON.stringify(sim.state.rng)).toBe(rng);
  });
});
