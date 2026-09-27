import { describe, expect, it } from 'vitest';
import { dados, getComponent, param, type Sim } from '../../src/sim';
import type { SystemContext } from '../../src/sim/core/pipeline';
import { arco } from '../../src/sim/map/esfera';
import type { Lago } from '../../src/sim/map/lagos';
import type { Mundo } from '../../src/sim/map/mundo';
import { gerarMapaValido } from '../../src/sim/map/validacao';
import { validarPosicionamento } from '../../src/sim/producao';
import { direcaoDe } from '../../src/sim/units/superficie';
import { alvo, criar, mundoLiso, ordenar, partida, ponto } from './mundo-teste';

/** O mundo liso com um lago de 10 m centrado em (0, 30). */
function mundoComLago(): Mundo {
  const liso = mundoLiso();
  const lagos: Lago[] = [{ d: ponto(0, 30), raio: 10, nivel: 0 }];
  return { mapa: { ...liso.mapa, lagos }, grades: liso.grades };
}
const contexto = (sim: Sim, mundo: Mundo): SystemContext => ({
  state: sim.state,
  tick: sim.state.tick,
  dt: 1 / sim.tickHz,
  commands: [],
  mundo,
  emit: () => {},
});

describe('T-155 — CEN-04, D-78: lagos de metano (Titã)', () => {
  it('CEN-04: lagos por setor de simetria, raios na faixa, longe das zonas e sem jazidas', () => {
    for (const [tamanho, zonas, seed] of [
      ['p', 2, 3],
      ['m', 4, 17],
      ['g', 4, 9],
    ] as const) {
      const pronto = gerarMapaValido(seed, tamanho, zonas, 'tita');
      const lagos = pronto.mapa.lagos ?? [];
      const R = pronto.mapa.raio_m;
      expect(lagos).toHaveLength(param(`lagos_por_setor_${tamanho}`) * zonas);
      for (const l of lagos) {
        expect(l.raio).toBeGreaterThanOrEqual(param('lago_raio_min_m'));
        expect(l.raio).toBeLessThanOrEqual(param('lago_raio_max_m'));
        for (const z of pronto.mapa.zonasDePouso) {
          expect(R * arco(z.d, l.d) - l.raio).toBeGreaterThanOrEqual(param('lago_folga_zona_m'));
        }
        for (const j of pronto.jazidas.jazidas) expect(R * arco(j.d, l.d)).toBeGreaterThan(l.raio);
      }
      // Simetria (CEN-06): cada raio aparece um número de vezes múltiplo das zonas.
      const porRaio = new Map<string, number>();
      for (const l of lagos)
        porRaio.set(l.raio.toFixed(6), (porRaio.get(l.raio.toFixed(6)) ?? 0) + 1);
      for (const n of porRaio.values()) expect(n % zonas).toBe(0);
    }
  });

  it('CEN-04: cenários sem o evento não têm lagos', () => {
    expect(gerarMapaValido(13, 'm', 4, 'marte').mapa.lagos).toEqual([]);
  });

  it('CEN-04/PRD-10: estrutura e muro não são posicionados sobre um lago (motivo lago)', () => {
    const mundo = mundoComLago();
    const sim = partida(mundo, ['bra', 'usa'], 'tita');
    const ctx = contexto(sim, mundo);
    expect(validarPosicionamento(ctx, 'storage', ponto(0, 30))).toBe('lago');
    expect(validarPosicionamento(ctx, 'wall', ponto(0, 33))).toBe('lago');
    expect(validarPosicionamento(ctx, 'storage', ponto(0, -30))).toBeNull();
  });

  it('CEN-04: mina não é plantada num lago; hovers atravessam o lago', () => {
    const mundo = mundoComLago();
    const sim = partida(mundo, ['bra', 'usa'], 'tita');
    const [m, hover] = criar(sim, [
      { unidade: 'hover_minelayer', x: 0, z: 0 },
      { unidade: 'hover_ex1', x: 5, z: 0 },
    ]);
    ordenar(sim, 'plantar_mina', { ids: [m], ...alvo(0, 30) });
    ordenar(sim, 'mover', { ids: [hover], ...alvo(5, 50) });
    for (let t = 0; t < 20 * sim.tickHz; t++) sim.step();
    expect(getComponent(sim.state, m!, 'lancaMinas')!.plantios).toEqual([]);
    expect(sim.state.entities.some((id) => getComponent(sim.state, id, 'mine'))).toBe(false);
    // O hover cruza o lago e chega ao outro lado.
    const d = direcaoDe(getComponent(sim.state, hover!, 'position')!);
    expect(mundo.mapa.raio_m * arco(d, ponto(5, 50))).toBeLessThan(3);
  });
});

describe('T-155 — CEN-02: mult_en_drone', () => {
  it('CEN-02: em Titã o drone gasta mult_en_drone × a energia para pairar', () => {
    const gasto = (cenario: 'lua' | 'tita') => {
      const sim = partida(mundoLiso(), ['bra', 'usa'], cenario);
      const [drone] = criar(sim, [{ unidade: 'drone_laser', x: 0, z: 0 }]);
      const antes = getComponent(sim.state, drone!, 'bateria')!.en;
      for (let t = 0; t < 5 * sim.tickHz; t++) sim.step();
      return antes - getComponent(sim.state, drone!, 'bateria')!.en;
    };
    const mult = dados.cenarios.find((c) => c.id === 'tita')!.mult_en_drone;
    expect(mult).not.toBe(1);
    expect(gasto('tita')).toBeCloseTo(gasto('lua') * mult, 5);
  });
});
