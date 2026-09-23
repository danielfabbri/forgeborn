import { describe, expect, it } from 'vitest';
import { param } from '../../src/sim';
import { hashNumeros } from '../../src/sim/core/hash';
import { alturaEm, inclinacaoAmostra } from '../../src/sim/map/heightmap';
import {
  alturaCratera,
  type Cratera,
  GERADOR_LUA,
  gerarMapaLunar,
  type MapaLunar,
  type Simetria,
} from '../../src/sim/map/lunar';

const MAPA_M4 = gerarMapaLunar(7, 'm', 4);
const MAPA_P2 = gerarMapaLunar(7, 'p', 2);
const LIMITE_HOVER = param('inclinacao_max_hover_graus');
const graus = (rad: number) => (rad * 180) / Math.PI;

/** Maior inclinação (graus) ao longo de uma linha, medida pela altura a cada 0,5 m. */
function inclinacaoMaxima(
  altura: (x: number, z: number) => number,
  [ax, az]: [number, number],
  [bx, bz]: [number, number],
): number {
  const comprimento = Math.hypot(bx - ax, bz - az);
  const passos = Math.ceil(comprimento / 0.5);
  let maior = 0;
  let anterior = altura(ax, az);
  for (let p = 1; p <= passos; p++) {
    const t = p / passos;
    const atual = altura(ax + (bx - ax) * t, az + (bz - az) * t);
    maior = Math.max(maior, graus(Math.atan(Math.abs(atual - anterior) / (comprimento / passos))));
    anterior = atual;
  }
  return maior;
}

describe('CEN-13: heightmap de 16 bits', () => {
  it('1 texel = 1 m: (lado + 1)² amostras num Uint16Array', () => {
    expect(MAPA_M4.alturas).toBeInstanceOf(Uint16Array);
    expect(MAPA_M4.lado_m).toBe(512);
    expect(MAPA_M4.alturas).toHaveLength(513 * 513);
    expect(MAPA_P2.alturas).toHaveLength(385 * 385);
  });
});

describe('CEN-06: determinismo e simetria', () => {
  it('mesma seed ⇒ mesmo hash; outra seed ⇒ outro hash', () => {
    expect(hashNumeros(gerarMapaLunar(7, 'p', 2).alturas)).toBe(hashNumeros(MAPA_P2.alturas));
    expect(hashNumeros(gerarMapaLunar(8, 'p', 2).alturas)).not.toBe(hashNumeros(MAPA_P2.alturas));
  });

  it.each([
    [4, MAPA_M4],
    [2, MAPA_P2],
  ] as Array<[Simetria, MapaLunar]>)('simetria rotacional de ordem %i (± 1 cm)', (n, mapa) => {
    const { lado_m: lado, resolucao: res, alturas } = mapa;
    let maiorDiferenca = 0;
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const [ri, rj] = n === 4 ? [lado - j, i] : [lado - i, lado - j];
        const diferenca = Math.abs(alturas[j * res + i]! - alturas[rj * res + ri]!);
        maiorDiferenca = Math.max(maiorDiferenca, diferenca);
      }
    }
    expect(maiorDiferenca).toBeLessThanOrEqual(1);
  });
});

describe('CEN-07: zonas de pouso', () => {
  it.each([
    [4, MAPA_M4],
    [2, MAPA_P2],
  ] as Array<[Simetria, MapaLunar]>)(
    'N = %i: a 36%% do lado a partir do centro, igualmente espaçadas a partir de 45°',
    (n, mapa) => {
      expect(mapa.zonasDePouso).toHaveLength(n);
      mapa.zonasDePouso.forEach((zona, k) => {
        expect(Math.hypot(zona.x, zona.z)).toBeCloseTo(0.36 * mapa.lado_m, 6);
        const esperado = Math.PI / 4 + (k * 2 * Math.PI) / n;
        const diferenca = Math.atan2(zona.z, zona.x) - esperado;
        expect(Math.cos(diferenca)).toBeCloseTo(1, 9);
      });
    },
  );
});

describe('CEN-08: platôs de pouso', () => {
  it('são planos (< 5°) num raio de 50 m', () => {
    for (const mapa of [MAPA_M4, MAPA_P2]) {
      const meio = mapa.lado_m / 2;
      for (const zona of mapa.zonasDePouso) {
        let maior = 0;
        for (let j = Math.ceil(zona.z + meio - 50); j <= zona.z + meio + 50; j++) {
          for (let i = Math.ceil(zona.x + meio - 50); i <= zona.x + meio + 50; i++) {
            if (Math.hypot(i - meio - zona.x, j - meio - zona.z) > 50) continue;
            maior = Math.max(maior, inclinacaoAmostra(mapa, i, j));
          }
        }
        expect(maior).toBeLessThan(5);
      }
    }
  });

  it('têm 2 ou 3 rampas transponíveis de ≥ 12 m de largura; fora delas, penhasco', () => {
    const altura = (x: number, z: number) => alturaEm(MAPA_M4, x, z);
    const topo = GERADOR_LUA.raioPlato;
    const fim = GERADOR_LUA.raioPlato + GERADOR_LUA.folgaTopo + GERADOR_LUA.comprimentoRampa + 4;
    expect(GERADOR_LUA.larguraRampa).toBeGreaterThanOrEqual(12);
    for (const zona of MAPA_M4.zonasDePouso) {
      expect(zona.rampas.length).toBeGreaterThanOrEqual(2);
      expect(zona.rampas.length).toBeLessThanOrEqual(3);
      for (const angulo of zona.rampas) {
        const [ux, uz] = [Math.cos(angulo), Math.sin(angulo)];
        for (const lateral of [-6, 0, 6]) {
          const inicio: [number, number] = [
            zona.x + ux * topo - uz * lateral,
            zona.z + uz * topo + ux * lateral,
          ];
          const final: [number, number] = [
            zona.x + ux * fim - uz * lateral,
            zona.z + uz * fim + ux * lateral,
          ];
          expect(inclinacaoMaxima(altura, inicio, final)).toBeLessThan(LIMITE_HOVER);
        }
      }
      // Para fora do mapa (lado oposto às rampas) só há penhasco.
      const fora = Math.atan2(zona.z, zona.x);
      const [fx, fz] = [Math.cos(fora), Math.sin(fora)];
      const penhasco = inclinacaoMaxima(
        altura,
        [zona.x + fx * topo, zona.z + fz * topo],
        [zona.x + fx * (topo + 12), zona.z + fz * (topo + 12)],
      );
      expect(penhasco).toBeGreaterThan(LIMITE_HOVER);
    }
  });
});

describe('CEN-09: relevo', () => {
  it('crateras têm raio de 10 a 60 m e borda de até 8 m, replicadas pela simetria', () => {
    expect(MAPA_M4.crateras.length).toBeGreaterThan(0);
    expect(MAPA_M4.crateras.length % 4).toBe(0);
    for (const cratera of MAPA_M4.crateras) {
      expect(cratera.raio).toBeGreaterThanOrEqual(10);
      expect(cratera.raio).toBeLessThanOrEqual(60);
      expect(cratera.borda).toBeLessThanOrEqual(8);
    }
  });

  it('a borda da cratera passa de 30°, exceto na brecha', () => {
    const cratera: Cratera = {
      x: 0,
      z: 0,
      raio: 30,
      profundidade: 6,
      borda: 4.2,
      brechas: [0],
      fase1: 0,
      fase2: 0,
    };
    const altura = (x: number, z: number) => alturaCratera(cratera, x, z);
    const atravessar = (angulo: number) =>
      inclinacaoMaxima(
        altura,
        [Math.cos(angulo) * 5, Math.sin(angulo) * 5],
        [Math.cos(angulo) * 60, Math.sin(angulo) * 60],
      );
    expect(atravessar(Math.PI)).toBeGreaterThan(LIMITE_HOVER);
    expect(atravessar(Math.PI / 2)).toBeGreaterThan(LIMITE_HOVER);
    expect(atravessar(0)).toBeLessThan(LIMITE_HOVER);
  });

  it('a faixa de 16 m da borda do mapa é serra', () => {
    const { resolucao: res } = MAPA_M4;
    for (let k = 0; k < res; k++) {
      for (const [i, j] of [
        [k, 0],
        [0, k],
        [k, res - 1],
        [res - 1, k],
      ] as Array<[number, number]>) {
        expect(alturaEm(MAPA_M4, i - 256, j - 256)).toBeGreaterThan(12);
      }
    }
  });
});
