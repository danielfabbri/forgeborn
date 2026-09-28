import { describe, expect, it } from 'vitest';
import { dados, getComponent, param, type Sim } from '../../src/sim';
import type { SystemContext } from '../../src/sim/core/pipeline';
import { aplicarRotacao, arco, rotacoesDeSimetria } from '../../src/sim/map/esfera';
import { derivarGrades } from '../../src/sim/map/grids';
import { alturaEm } from '../../src/sim/map/heightmap';
import { emLiquido } from '../../src/sim/map/lagos';
import type { Mundo } from '../../src/sim/map/mundo';
import { gerarMapaValido, validarMapa } from '../../src/sim/map/validacao';
import { validarPosicionamento } from '../../src/sim/producao';
import { direcaoDe } from '../../src/sim/units/superficie';
import { alvo, criar, mundoLiso, ordenar, partida, ponto } from './mundo-teste';

/**
 * Mundo liso com mar: a terra (20 m) fica em z < 20 e z > 60 no hemisfério da base; a faixa entre
 * elas e o outro hemisfério (0 m) ficam abaixo do nível do líquido (10 m).
 */
function mundoComMar(): Mundo {
  const base = mundoLiso((_x, z) => z < 20 || z > 60);
  const mapa = { ...base.mapa, mar: { nivel: 10 } };
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

describe('T-180 — CEN-04, CEN-11, MOV-01, D-90: mares de Titã', () => {
  it(
    'CEN-04: líquido em mar_cobertura_pct da superfície, simétrico, com ilhas e terra firme nas zonas',
    { timeout: 180_000 },
    () => {
      const pronto = gerarMapaValido(17, 4, 'tita');
      const { mapa, grades, jazidas } = pronto;
      const nav = grades.navegacao;
      const liquido = nav.liquido!;
      const coberta = liquido.reduce((s, v) => s + v, 0) / liquido.length;
      expect(Math.abs(coberta - param('mar_cobertura_pct') / 100)).toBeLessThan(0.03);
      // Simetria (CEN-06): o nível do terreno é o mesmo nas réplicas.
      const R = mapa.raio_m;
      for (let k = 0; k < 200; k++) {
        const p = ponto(((k * 37) % 300) - 150, ((k * 53) % 300) - 150, R);
        for (const sigma of rotacoesDeSimetria(4)) {
          expect(emLiquido(mapa, aplicarRotacao(sigma, p))).toBe(emLiquido(mapa, p));
        }
      }
      // Terra firme a mar_folga_zona_m das zonas de pouso.
      for (const zona of mapa.zonasDePouso) {
        expect(emLiquido(mapa, zona.d, param('mar_folga_zona_m') - 5)).toBe(false);
      }
      // Ilhas: há terra cercada de líquido fora do continente das zonas de pouso.
      const terra = new Uint8Array(liquido.length);
      for (let c = 0; c < liquido.length; c++) terra[c] = liquido[c] === 1 ? 0 : 1;
      const vizinhos = nav.esfera.vizinhos;
      const marcado = new Uint8Array(liquido.length);
      let componentes = 0;
      for (let c = 0; c < terra.length; c++) {
        if (terra[c] !== 1 || marcado[c] === 1) continue;
        componentes++;
        const fila = [c];
        marcado[c] = 1;
        for (let k = 0; k < fila.length; k++) {
          for (let d = 0; d < 4; d++) {
            const v = vizinhos[fila[k]! * 8 + d]!;
            if (v >= 0 && terra[v] === 1 && marcado[v] === 0) {
              marcado[v] = 1;
              fila.push(v);
            }
          }
        }
      }
      expect(componentes).toBeGreaterThan(1);
      // Nada no líquido: jazidas e pedras.
      for (const j of jazidas.jazidas) expect(emLiquido(mapa, j.d)).toBe(false);
      for (const s of mapa.pedras ?? []) expect(emLiquido(mapa, s.d)).toBe(false);
      expect(validarMapa(mapa, grades, jazidas)).toEqual([]);
    },
  );

  it('CEN-04: cenários sem líquido não têm mar', () => {
    expect(gerarMapaValido(13, 4, 'marte').mapa.mar).toBeUndefined();
  });

  it('CEN-04/PRD-10: estrutura e muro não são posicionados sobre o líquido (motivo lago)', () => {
    const mundo = mundoComMar();
    const sim = partida(mundo, ['bra', 'usa'], 'tita');
    const ctx = contexto(sim, mundo);
    expect(validarPosicionamento(ctx, 'storage', ponto(0, 40))).toBe('lago');
    expect(validarPosicionamento(ctx, 'wall', ponto(0, 38))).toBe('lago');
    expect(validarPosicionamento(ctx, 'storage', ponto(0, -10))).toBeNull();
  });

  it('CEN-04/MOV-01: mina não vai ao líquido; hovers param na borda, sem entrar', () => {
    const mundo = mundoComMar();
    const sim = partida(mundo, ['bra', 'usa'], 'tita');
    const [m, hover] = criar(sim, [
      { unidade: 'hover_minelayer', x: 0, z: 0 },
      { unidade: 'hover_ex1', x: 5, z: 0 },
    ]);
    ordenar(sim, 'plantar_mina', { ids: [m], ...alvo(0, 40) });
    ordenar(sim, 'mover', { ids: [hover], ...alvo(5, 40) });
    let entrou = false;
    for (let t = 0; t < 20 * sim.tickHz; t++) {
      sim.step();
      const d = direcaoDe(getComponent(sim.state, hover!, 'position')!);
      if (alturaEm(mundo.mapa, d) < mundo.mapa.mar!.nivel) entrou = true;
    }
    expect(getComponent(sim.state, m!, 'lancaMinas')!.plantios).toEqual([]);
    expect(entrou).toBe(false);
    // Parou na borda: mais perto do mar do que da partida.
    const d = direcaoDe(getComponent(sim.state, hover!, 'position')!);
    expect(mundo.mapa.raio_m * arco(d, ponto(5, 20))).toBeLessThan(6);
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
