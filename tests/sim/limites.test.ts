import { describe, expect, it } from 'vitest';
import { entitiesWith, param, type SimEvent } from '../../src/sim';
import { criar, partida } from './mundo-teste';

function alertas(eventos: SimEvent[]) {
  return eventos.filter((e) => e.tipo === 'alerta').map((e) => e.dados);
}

describe('REG-16 a REG-19: limites da nação', () => {
  it('REG-16/REG-19: o corpo além de limite_corpos é recusado com AL-11', () => {
    const sim = partida(undefined);
    const limite = param('limite_corpos');
    const eventos: SimEvent[] = [];
    sim.bus.on('alerta', (e) => eventos.push(e));
    criar(
      sim,
      Array.from({ length: limite + 1 }, (_, k) => ({
        unidade: 'hover_explorer' as const,
        x: k,
        z: 0,
      })),
    );
    expect(entitiesWith(sim.state, 'unit')).toHaveLength(limite);
    expect(alertas(eventos)).toEqual([{ id: 'AL-11', nacao: 'bra', limite: 'limite_corpos' }]);
  });

  it('REG-16: estruturas e minas não contam no limite de corpos; o limite é por nação', () => {
    const sim = partida(undefined);
    const limite = param('limite_corpos');
    criar(sim, [
      { estrutura: 'ship', x: 0, z: 0 },
      { mina: true, x: 5, z: 5 },
    ]);
    criar(
      sim,
      Array.from({ length: limite }, (_, k) => ({
        unidade: 'hover_explorer' as const,
        x: k,
        z: 9,
      })),
    );
    criar(sim, [{ unidade: 'hover_explorer', x: 0, z: 20 }], 'usa');
    expect(entitiesWith(sim.state, 'unit')).toHaveLength(limite + 1);
  });

  it('REG-17: a Base de Lançamento além de limite_bases_lancamento é recusada com AL-11', () => {
    const sim = partida(undefined);
    const eventos: SimEvent[] = [];
    sim.bus.on('alerta', (e) => eventos.push(e));
    const limite = param('limite_bases_lancamento');
    criar(
      sim,
      Array.from({ length: limite + 1 }, (_, k) => ({
        estrutura: 'satellite_uplink' as const,
        x: k * 30,
        z: 0,
      })),
    );
    expect(entitiesWith(sim.state, 'structure')).toHaveLength(limite);
    expect(alertas(eventos)).toEqual([
      { id: 'AL-11', nacao: 'bra', limite: 'limite_bases_lancamento' },
    ]);
  });

  it('REG-18: a mina além de limite_minas_ativas é recusada com AL-11', () => {
    const sim = partida(undefined);
    const eventos: SimEvent[] = [];
    sim.bus.on('alerta', (e) => eventos.push(e));
    const limite = param('limite_minas_ativas');
    criar(
      sim,
      Array.from({ length: limite + 1 }, (_, k) => ({ mina: true as const, x: k, z: 0 })),
    );
    expect(entitiesWith(sim.state, 'mine')).toHaveLength(limite);
    expect(alertas(eventos)).toEqual([
      { id: 'AL-11', nacao: 'bra', limite: 'limite_minas_ativas' },
    ]);
  });
});
