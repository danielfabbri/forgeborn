import { describe, expect, it } from 'vitest';
import { param } from '../../src/sim';
import { hashNumeros } from '../../src/sim/core/hash';
import {
  arco,
  avancar,
  celulasPorAresta,
  girar,
  normalizar,
  rotacoesDeSimetria,
  type Vec3,
} from '../../src/sim/map/esfera';
import {
  alturaEm,
  direcaoDoVertice,
  inclinacaoEm,
  indiceDoVertice,
  verticeRotacionado,
} from '../../src/sim/map/heightmap';
import {
  alturaCratera,
  type Cratera,
  GERADOR_LUA,
  gerarMapaLunar,
  type MapaLunar,
  rumoSemRampa,
  type Simetria,
} from '../../src/sim/map/lunar';
import { RAIOS_DE_TESTE } from './mundo-teste';

const MAPA_M4 = gerarMapaLunar(7, RAIOS_DE_TESTE.m, 4);
const MAPA_P2 = gerarMapaLunar(7, RAIOS_DE_TESTE.p, 2);
const LIMITE_HOVER = param('inclinacao_max_hover_graus');
const graus = (rad: number) => (rad * 180) / Math.PI;

/** Ponto a `metros` de c no rumo `rumo` (tangente em c). */
function em(mapa: MapaLunar, c: Vec3, rumo: Vec3, metros: number): Vec3 {
  return avancar(c, rumo, metros / mapa.raio_m).p;
}

/** Maior inclinação (graus) ao longo do arco de a até b, pela altura a cada 0,5 m. */
function inclinacaoMaxima(mapa: MapaLunar, altura: (p: Vec3) => number, a: Vec3, b: Vec3): number {
  const comprimento = mapa.raio_m * arco(a, b);
  const passos = Math.ceil(comprimento / 0.5);
  const eixo = normalizar([
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]);
  let maior = 0;
  let anterior = altura(a);
  for (let p = 1; p <= passos; p++) {
    const q = normalizar(girar(a, eixo, (arco(a, b) * p) / passos));
    const atual = altura(q);
    maior = Math.max(maior, graus(Math.atan(Math.abs(atual - anterior) / (comprimento / passos))));
    anterior = atual;
  }
  return maior;
}

describe('CEN-13: heightmap de 16 bits nas 6 faces', () => {
  it('~1 m entre vértices: 6 × (res + 1)² amostras num Uint16Array', () => {
    const raio = RAIOS_DE_TESTE.m;
    expect(MAPA_M4.raio_m).toBe(raio);
    expect(MAPA_M4.resolucao).toBe(celulasPorAresta(raio, 1));
    expect(MAPA_M4.alturas).toBeInstanceOf(Uint16Array);
    expect(MAPA_M4.alturas).toHaveLength(6 * (MAPA_M4.resolucao + 1) ** 2);
  });

  it('CEN-09: sem borda — os vértices das arestas do cubo têm a mesma altura em todas as faces', () => {
    const res = MAPA_M4.resolucao;
    const porDirecao = new Map<string, number>();
    for (let face = 0; face < 6; face++) {
      for (let k = 0; k <= res; k++) {
        for (const [i, j] of [
          [k, 0],
          [k, res],
          [0, k],
          [res, k],
        ] as Array<[number, number]>) {
          const d = direcaoDoVertice(res, face, i, j);
          const chave = d.map((v) => v.toFixed(12)).join(',');
          const valor = MAPA_M4.alturas[indiceDoVertice(res, face, i, j)]!;
          const outro = porDirecao.get(chave);
          if (outro !== undefined) expect(valor).toBe(outro);
          else porDirecao.set(chave, valor);
        }
      }
    }
  });
});

describe('CEN-06: determinismo e simetria', () => {
  it('mesma seed ⇒ mesmo hash; outra seed ⇒ outro hash', () => {
    expect(hashNumeros(gerarMapaLunar(7, RAIOS_DE_TESTE.p, 2).alturas)).toBe(
      hashNumeros(MAPA_P2.alturas),
    );
    expect(hashNumeros(gerarMapaLunar(8, RAIOS_DE_TESTE.p, 2).alturas)).not.toBe(
      hashNumeros(MAPA_P2.alturas),
    );
  });

  it.each([
    [4, MAPA_M4],
    [2, MAPA_P2],
  ] as Array<[Simetria, MapaLunar]>)(
    'N = %i: altura em p e em g·p iguais (± 1 cm) para cada rotação g do grupo',
    (n, mapa) => {
      let maiorDiferenca = 0;
      for (const sigma of rotacoesDeSimetria(n)) {
        for (let v = 0; v < mapa.alturas.length; v++) {
          const w = verticeRotacionado(mapa.resolucao, v, sigma);
          maiorDiferenca = Math.max(maiorDiferenca, Math.abs(mapa.alturas[v]! - mapa.alturas[w]!));
        }
      }
      expect(maiorDiferenca).toBeLessThanOrEqual(1);
    },
  );
});

describe('CEN-07: zonas de pouso', () => {
  it('N = 2: antípodas', () => {
    const [a, b] = MAPA_P2.zonasDePouso;
    expect(arco(a!.d, b!.d)).toBeCloseTo(Math.PI, 12);
  });

  it('N = 4: vértices de um tetraedro regular (todas à mesma distância)', () => {
    const zonas = MAPA_M4.zonasDePouso;
    expect(zonas).toHaveLength(4);
    for (let a = 0; a < 4; a++) {
      for (let b = a + 1; b < 4; b++) {
        expect(arco(zonas[a]!.d, zonas[b]!.d)).toBeCloseTo(Math.acos(-1 / 3), 12);
      }
    }
  });

  it('ECO-08: pontos médios equidistantes das duas zonas vizinhas', () => {
    for (const mapa of [MAPA_M4, MAPA_P2]) {
      for (const m of [...mapa.contestados, ...mapa.centrais]) {
        const [a, b] = m.zonasDePouso.map((k) => mapa.zonasDePouso[k]!.d);
        expect(arco(m.d, a!)).toBeCloseTo(arco(m.d, b!), 12);
      }
    }
  });
});

describe('CEN-08: platôs de pouso', () => {
  it('são planos (< 5° da vertical local) num raio de 50 m', () => {
    for (const mapa of [MAPA_M4, MAPA_P2]) {
      for (const zona of mapa.zonasDePouso) {
        let maior = inclinacaoEm(mapa, zona.d);
        for (let r = 5; r <= 50; r += 5) {
          for (let a = 0; a < 360; a += 15) {
            const rumo = normalizar(girar(zona.rampas[0]!, zona.d, (a * Math.PI) / 180));
            maior = Math.max(maior, inclinacaoEm(mapa, em(mapa, zona.d, rumo, r)));
          }
        }
        expect(maior).toBeLessThan(5);
        expect(alturaEm(mapa, zona.d)).toBeCloseTo(GERADOR_LUA.alturaPlato, 1);
      }
    }
  });

  it('têm 2 ou 3 rampas transponíveis de ≥ 12 m de largura; atrás delas, penhasco', () => {
    const mapa = MAPA_M4;
    const altura = (p: Vec3) => alturaEm(mapa, p);
    const topo = GERADOR_LUA.raioPlato;
    const fim = GERADOR_LUA.raioPlato + GERADOR_LUA.folgaTopo + GERADOR_LUA.comprimentoRampa + 4;
    expect(GERADOR_LUA.larguraRampa).toBeGreaterThanOrEqual(12);
    for (const zona of mapa.zonasDePouso) {
      expect(zona.rampas.length).toBeGreaterThanOrEqual(2);
      expect(zona.rampas.length).toBeLessThanOrEqual(3);
      for (const u of zona.rampas) {
        const lado = normalizar([
          zona.d[1] * u[2] - zona.d[2] * u[1],
          zona.d[2] * u[0] - zona.d[0] * u[2],
          zona.d[0] * u[1] - zona.d[1] * u[0],
        ]);
        for (const lateral of [-6, 0, 6]) {
          const base = lateral === 0 ? zona.d : em(mapa, zona.d, lado, lateral);
          const rumo = normalizar(girar(u, zona.d, 0));
          const inicio = em(mapa, base, rumo, topo);
          const final = em(mapa, base, rumo, fim);
          expect(inclinacaoMaxima(mapa, altura, inicio, final)).toBeLessThan(LIMITE_HOVER);
        }
      }
      const fundo = rumoSemRampa(zona);
      const penhasco = inclinacaoMaxima(
        mapa,
        altura,
        em(mapa, zona.d, fundo, topo),
        em(mapa, zona.d, fundo, topo + 12),
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
    const raioPlaneta = 1000;
    const cratera: Cratera = {
      d: [0, 1, 0],
      ref: [1, 0, 0],
      raio: 30,
      profundidade: 6,
      borda: 4.2,
      brechas: [0],
      fase1: 0,
      fase2: 0,
    };
    const falso = { raio_m: raioPlaneta } as MapaLunar;
    const altura = (p: Vec3) => alturaCratera(cratera, p, raioPlaneta);
    const atravessar = (angulo: number) => {
      const rumo = normalizar(girar([1, 0, 0], [0, 1, 0], -angulo));
      return inclinacaoMaxima(
        falso,
        altura,
        em(falso, cratera.d, rumo, 5),
        em(falso, cratera.d, rumo, 60),
      );
    };
    expect(atravessar(Math.PI)).toBeGreaterThan(LIMITE_HOVER);
    expect(atravessar(Math.PI / 2)).toBeGreaterThan(LIMITE_HOVER);
    expect(atravessar(0)).toBeLessThan(LIMITE_HOVER);
  });
});
