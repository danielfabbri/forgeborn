import { describe, expect, it } from 'vitest';
import { getComponent, param, type Sim } from '../../src/sim';
import type { SystemContext } from '../../src/sim/core/pipeline';
import { aplicarRotacao, arco, rotacoesDeSimetria } from '../../src/sim/map/esfera';
import { celulaDe, derivarGrades, ehConstruivel, ehPassavel } from '../../src/sim/map/grids';
import { GERADOR_LUA } from '../../src/sim/map/lunar';
import type { Mundo } from '../../src/sim/map/mundo';
import type { Pedra } from '../../src/sim/map/pedras';
import { gerarMapaValido } from '../../src/sim/map/validacao';
import { validarPosicionamento } from '../../src/sim/producao';
import { direcaoDe } from '../../src/sim/units/superficie';
import { alvo, criar, mundoLiso, ordenar, partida, ponto } from './mundo-teste';

/** O mundo liso com uma pedra de 3 m centrada em (0, 20). */
function mundoComPedra(): Mundo {
  const liso = mundoLiso();
  const pedras: Pedra[] = [{ d: ponto(0, 20), raio: 3 }];
  const mapa = { ...liso.mapa, pedras };
  return { mapa, grades: derivarGrades(mapa) };
}
const contexto = (sim: Sim, mundo: Mundo): SystemContext => ({
  state: sim.state,
  tick: sim.state.tick,
  dt: 1 / sim.tickHz,
  commands: [],
  mundo,
  emit: () => {},
});

describe('T-171 — CEN-17, D-86: pedras neutras', () => {
  it(
    'CEN-17: densidade e raios do SPEC, simétricas, fora dos platôs e longe das jazidas',
    { timeout: 240_000 },
    () => {
      for (const [zonas, seed, cenario] of [
        [2, 3, 'terra_lab'],
        [4, 1, 'lua'],
      ] as const) {
        const pronto = gerarMapaValido(seed, zonas, cenario);
        const mapa = pronto.mapa;
        const pedras = mapa.pedras ?? [];
        const R = mapa.raio_m;
        const esperadas =
          Math.round((param('pedras_por_10k_m2') * 4 * Math.PI * R * R) / 10000 / zonas) * zonas;
        expect(pedras.length % zonas).toBe(0);
        expect(pedras.length).toBeGreaterThanOrEqual(0.8 * esperadas);
        expect(pedras.length).toBeLessThanOrEqual(esperadas);
        const grupo = rotacoesDeSimetria(zonas);
        for (const s of pedras) {
          expect(s.raio).toBeGreaterThanOrEqual(param('pedra_raio_min_m'));
          expect(s.raio).toBeLessThanOrEqual(param('pedra_raio_max_m'));
          // CEN-06: cada pedra tem as réplicas da simetria.
          for (const sigma of grupo) {
            const q = aplicarRotacao(sigma, s.d);
            expect(pedras.some((o) => R * arco(o.d, q) < 1e-6 && o.raio === s.raio)).toBe(true);
          }
          // Fora dos platôs (CEN-08).
          for (const z of mapa.zonasDePouso) {
            expect(R * arco(z.d, s.d)).toBeGreaterThan(GERADOR_LUA.raioPlato + s.raio);
          }
          for (const j of pronto.jazidas.jazidas) {
            expect(R * arco(j.d, s.d)).toBeGreaterThanOrEqual(
              s.raio + param('distancia_min_jazida_m'),
            );
          }
        }
      }
    },
  );

  it('CEN-17/PRD-10: a pedra bloqueia navegação e construção (motivo pedra)', () => {
    const mundo = mundoComPedra();
    const d = ponto(0, 20);
    const { navegacao, construcao } = mundo.grades;
    expect(ehPassavel(navegacao, celulaDe(navegacao, d))).toBe(false);
    expect(ehConstruivel(construcao, celulaDe(construcao, d))).toBe(false);
    expect(ehPassavel(navegacao, celulaDe(navegacao, ponto(0, 30)))).toBe(true);
    const sim = partida(mundo);
    const ctx = contexto(sim, mundo);
    expect(validarPosicionamento(ctx, 'storage', ponto(0, 20))).toBe('pedra');
    expect(validarPosicionamento(ctx, 'storage', ponto(0, -30))).toBeNull();
  });

  it('MOV-04: o hover contorna a pedra; o drone passa por cima', () => {
    const mundo = mundoComPedra();
    const sim = partida(mundo);
    const [hover, drone] = criar(sim, [
      { unidade: 'hover_explorer', x: 0, z: 10 },
      { unidade: 'drone_laser', x: 2, z: 10 },
    ]);
    ordenar(sim, 'mover', { ids: [hover], ...alvo(0, 30) });
    ordenar(sim, 'mover', { ids: [drone], ...alvo(0, 30) });
    const R = mundo.mapa.raio_m;
    let dentro = false;
    let droneSobre = false;
    for (let t = 0; t < 20 * sim.tickHz; t++) {
      sim.step();
      const dh = direcaoDe(getComponent(sim.state, hover!, 'position')!);
      if (R * arco(dh, ponto(0, 20)) < 3) dentro = true;
      const dd = direcaoDe(getComponent(sim.state, drone!, 'position')!);
      if (R * arco(dd, ponto(0, 20)) < 3) droneSobre = true;
    }
    expect(dentro).toBe(false);
    expect(droneSobre).toBe(true);
    const fim = direcaoDe(getComponent(sim.state, hover!, 'position')!);
    expect(R * arco(fim, ponto(0, 30))).toBeLessThan(3);
  });
});
