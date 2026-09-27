import { describe, expect, it } from 'vitest';
import { createSim, dados, param, type Sim, type SimEvent } from '../../src/sim';
import {
  multSolarDoEvento,
  multVisao,
  sistemaTempestade,
  tempestadeAtiva,
} from '../../src/sim/cenario/tempestade';
import { geracaoDaRede } from '../../src/sim/energia';
import { estadoEm, VISIVEL } from '../../src/sim/visao/nevoa';
import { criar, mundoLiso, partida, ponto } from './mundo-teste';

function rodarAte(sim: Sim, tick: number, eventos?: SimEvent[]) {
  while (sim.state.tick < tick) {
    const novos = sim.step();
    eventos?.push(...novos);
  }
}
/** Só o sistema da tempestade, para percorrer minutos de partida rápido. */
const soTempestade = (cenario: 'marte' | 'lua' = 'marte') =>
  createSim(1, ['bra', 'usa'], { cenario, systems: { energia: sistemaTempestade } });
/** Começa uma tempestade agora (para os efeitos, sem esperar o sorteio). */
function comecarJa(sim: Sim) {
  const dur = param('tempestade_duracao_s') * sim.tickHz;
  sim.state.tempestade = { inicio: sim.state.tick, fim: sim.state.tick + dur, avisada: true };
}

describe('T-150 — CEN-03, D-77: tempestade de poeira em Marte', () => {
  it('CEN-03: começa entre os intervalos, dura tempestade_duracao_s e o AL-15 sai antes', () => {
    const sim = soTempestade();
    const hz = sim.tickHz;
    const eventos: SimEvent[] = [];
    sim.step();
    const t = sim.state.tempestade!;
    const min = param('tempestade_intervalo_min_s') * hz;
    const max = param('tempestade_intervalo_max_s') * hz;
    expect(t.inicio).toBeGreaterThanOrEqual(min);
    expect(t.inicio).toBeLessThanOrEqual(max);
    expect(t.fim - t.inicio).toBe(param('tempestade_duracao_s') * hz);
    const aviso = t.inicio - param('tempestade_aviso_s') * hz;
    rodarAte(sim, aviso, eventos);
    expect(eventos.some((e) => e.tipo === 'alerta')).toBe(false);
    rodarAte(sim, aviso + 1, eventos);
    expect(eventos.filter((e) => e.tipo === 'alerta').map((e) => e.dados)).toEqual([
      { id: 'AL-15', nacao: 'bra' },
      { id: 'AL-15', nacao: 'usa' },
    ]);
    expect(tempestadeAtiva(sim.state)).toBe(false);
    rodarAte(sim, t.inicio + 1, eventos);
    expect(tempestadeAtiva(sim.state)).toBe(true);
    expect(
      eventos.some((e) => e.tipo === 'tempestade' && (e.dados as { ativa: boolean }).ativa),
    ).toBe(true);
    rodarAte(sim, t.fim + 1, eventos);
    expect(tempestadeAtiva(sim.state)).toBe(false);
    // A próxima é sorteada a partir do fim desta.
    const proxima = sim.state.tempestade!;
    expect(proxima.inicio - t.fim).toBeGreaterThanOrEqual(min);
    expect(proxima.inicio - t.fim).toBeLessThanOrEqual(max);
  });

  it('CEN-03: a mesma seed dá as mesmas tempestades', () => {
    const a = soTempestade();
    const b = soTempestade();
    a.step();
    b.step();
    expect(a.state.tempestade).toEqual(b.state.tempestade);
  });

  it('CEN-03: durante a tempestade a visão e a geração solar caem pelos multiplicadores', () => {
    const sim = partida(mundoLiso(), ['bra', 'usa'], 'marte');
    criar(sim, [{ estrutura: 'solar_plant', x: 0, z: 0 }]);
    const antes = geracaoDaRede(sim.state, 'bra');
    expect(antes).toBeGreaterThan(0);
    expect(multVisao(sim.state)).toBe(1);
    comecarJa(sim);
    expect(multVisao(sim.state)).toBeCloseTo(param('tempestade_mult_visao'));
    expect(multSolarDoEvento(sim.state)).toBeCloseTo(param('tempestade_mult_solar'));
    expect(geracaoDaRede(sim.state, 'bra')).toBeCloseTo(antes * param('tempestade_mult_solar'));
  });

  it('CEN-03: a névoa encolhe na tempestade (um ponto perto do limite da visão some)', () => {
    const sim = partida(mundoLiso(), ['bra', 'usa'], 'marte');
    criar(sim, [{ unidade: 'hover_scout', x: 0, z: 0 }]);
    rodarAte(sim, sim.state.tick + 8);
    const ctx = { state: sim.state, mundo: mundoLiso() } as never;
    const visao = dados.moveis.find((m) => m.id === 'hover_scout')!.visao_m;
    // Entre a visão reduzida e a normal: visível no tempo bom, fora na tempestade.
    const alvo = ponto(0, (visao * (1 + param('tempestade_mult_visao'))) / 2);
    expect(estadoEm(ctx, 'bra', alvo)).toBe(VISIVEL);
    comecarJa(sim);
    rodarAte(sim, sim.state.tick + 8);
    expect(estadoEm(ctx, 'bra', alvo)).not.toBe(VISIVEL);
  });

  it('CEN-03: cenários sem o evento não têm tempestade (nem consomem a seed)', () => {
    const sim = soTempestade('lua');
    const rng = JSON.stringify(sim.state.rng);
    sim.step();
    expect(sim.state.tempestade).toBeUndefined();
    expect(JSON.stringify(sim.state.rng)).toBe(rng);
  });
});
