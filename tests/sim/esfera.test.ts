import { describe, expect, it } from 'vitest';
import {
  arco,
  avancar,
  celulaDaDirecao,
  celulaRotacionada,
  celulasPorAresta,
  centroDaCelula,
  cuboEsfera,
  LADOS_DA_DIAGONAL,
  norteEm,
  normalizar,
  produtoEscalar,
  rotacoesDeSimetria,
  aplicarRotacao,
  type Vec3,
} from '../../src/sim/map/esfera';

const N = 24;
const g = cuboEsfera(N);

/** Direções pseudoaleatórias (determinísticas) espalhadas pela esfera. */
function direcoes(quantas: number): Vec3[] {
  const saida: Vec3[] = [];
  for (let k = 0; k < quantas; k++) {
    const z = 1 - (2 * (k + 0.5)) / quantas;
    const r = Math.sqrt(1 - z * z);
    const phi = k * 2.399963229728653;
    saida.push([r * Math.cos(phi), z, r * Math.sin(phi)]);
  }
  return saida;
}

/** Canto (i, j) da grade da face, com i, j ∈ [0, N]. */
function cantoDaCelula(face: number, i: number, j: number): Vec3 {
  const t = (k: number) => (k <= 0 ? -1 : k >= N ? 1 : Math.tan(((k - N / 2) * (Math.PI / 2)) / N));
  const v: Vec3 = [0, 0, 0];
  const k = face >> 1;
  v[k] = face & 1 ? -1 : 1;
  v[(k + 1) % 3] = t(i);
  v[(k + 2) % 3] = t(j);
  return normalizar(v);
}

/** Área (esferorradianos) do quadrilátero esférico de vértices unitários, por triângulos. */
function areaTriangulo(a: Vec3, b: Vec3, c: Vec3): number {
  const numerador = Math.abs(
    produtoEscalar(a, [
      b[1] * c[2] - b[2] * c[1],
      b[2] * c[0] - b[0] * c[2],
      b[0] * c[1] - b[1] * c[0],
    ]),
  );
  const denominador = 1 + produtoEscalar(a, b) + produtoEscalar(b, c) + produtoEscalar(c, a);
  return 2 * Math.atan2(numerador, denominador);
}

describe('T-016 — CEN-14: cubo-esfera', () => {
  it('CEN-14: ida e volta ponto → célula → centro: o ponto está dentro da própria célula', () => {
    for (const d of direcoes(4000)) {
      const c = celulaDaDirecao(N, d);
      const centro = centroDaCelula(g, c);
      // meia diagonal real da célula: maior distância do centro a um canto
      const face = Math.floor(c / (N * N));
      const i = c % N;
      const j = Math.floor((c - face * N * N) / N);
      const meiaDiagonal = Math.max(
        ...[
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ].map(([di, dj]) => arco(centro, cantoDaCelula(face, i + di!, j + dj!))),
      );
      expect(arco(d, centro)).toBeLessThanOrEqual(meiaDiagonal + 1e-9);
      expect(celulaDaDirecao(N, centro)).toBe(c);
    }
  });

  it('CEN-14: a vizinhança é simétrica e só os vértices do cubo têm 7 vizinhas', () => {
    let comSete = 0;
    for (let c = 0; c < g.celulas; c++) {
      let quantas = 0;
      for (let d = 0; d < 8; d++) {
        const v = g.vizinhos[c * 8 + d]!;
        if (v < 0) continue;
        quantas++;
        expect(v).not.toBe(c);
        const volta = Array.from({ length: 8 }, (_, e) => g.vizinhos[v * 8 + e]);
        expect(volta).toContain(c);
        // vizinha fica a no máximo ~1,8 célula nominal (diagonais que cruzam arestas)
        expect(arco(centroDaCelula(g, c), centroDaCelula(g, v))).toBeLessThan(
          1.8 * g.anguloNominal,
        );
      }
      expect([7, 8]).toContain(quantas);
      if (quantas === 7) comSete++;
    }
    expect(comSete).toBe(24); // 8 vértices × 3 células
  });

  it('CEN-14: diagonais têm as duas vizinhas de lado (regra de não cortar quina)', () => {
    for (let c = 0; c < g.celulas; c++) {
      for (let d = 4; d < 8; d++) {
        if (g.vizinhos[c * 8 + d]! < 0) continue;
        const [l1, l2] = LADOS_DA_DIAGONAL[d - 4]!;
        expect(g.vizinhos[c * 8 + l1]).toBeGreaterThanOrEqual(0);
        expect(g.vizinhos[c * 8 + l2]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('CEN-14: a soma das áreas das células é 4π (± 0,1%)', () => {
    let total = 0;
    const m = 2 * N;
    for (let face = 0; face < 6; face++) {
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const canto = (di: number, dj: number): Vec3 => {
            const t = (k: number) => Math.tan(((k - N) * (Math.PI / 2)) / m);
            const a = t(2 * (i + di));
            const b = t(2 * (j + dj));
            const v: Vec3 = [0, 0, 0];
            const k = face >> 1;
            v[k] = face & 1 ? -1 : 1;
            v[(k + 1) % 3] = a;
            v[(k + 2) % 3] = b;
            return normalizar(v);
          };
          const [p00, p10, p11, p01] = [canto(0, 0), canto(1, 0), canto(1, 1), canto(0, 1)];
          total += areaTriangulo(p00, p10, p11) + areaTriangulo(p00, p11, p01);
        }
      }
    }
    expect(Math.abs(total - 4 * Math.PI) / (4 * Math.PI)).toBeLessThan(0.001);
  });

  it('CEN-06: as rotações de simetria levam célula em célula e preservam a vizinhança', () => {
    for (const n of [2, 4] as const) {
      for (const sigma of rotacoesDeSimetria(n)) {
        for (let c = 0; c < g.celulas; c += 7) {
          const r = celulaRotacionada(N, c, sigma);
          const esperado = aplicarRotacao(sigma, centroDaCelula(g, c));
          expect(arco(centroDaCelula(g, r), esperado)).toBeLessThan(1e-12);
          const vizinhas = new Set(
            Array.from({ length: 8 }, (_, d) => g.vizinhos[c * 8 + d]!)
              .filter((v) => v >= 0)
              .map((v) => celulaRotacionada(N, v, sigma)),
          );
          const vizinhasDoRotacionado = new Set(
            Array.from({ length: 8 }, (_, d) => g.vizinhos[r * 8 + d]!).filter((v) => v >= 0),
          );
          expect(vizinhasDoRotacionado).toEqual(vizinhas);
        }
      }
    }
  });

  it('CEN-14: células por aresta dão área média do tamanho nominal', () => {
    const n = celulasPorAresta(144, 2);
    const areaMedia = (4 * Math.PI * 144 * 144) / (6 * n * n);
    expect(Math.sqrt(areaMedia)).toBeCloseTo(2, 1);
  });
});

describe('T-016 — CEN-14/CEN-15: arcos, passos e norte', () => {
  it('andar 2π pelo equador volta ao ponto de partida', () => {
    let estado = { p: [1, 0, 0] as Vec3, rumo: [0, 0, 1] as Vec3 };
    for (let k = 0; k < 1000; k++) estado = avancar(estado.p, estado.rumo, (2 * Math.PI) / 1000);
    expect(arco(estado.p, [1, 0, 0])).toBeLessThan(1e-9);
    expect(arco(estado.rumo, [0, 0, 1])).toBeLessThan(1e-9);
  });

  it('o rumo transportado continua tangente e unitário', () => {
    let estado = { p: normalizar([0.3, 0.8, -0.5]), rumo: [0, 0, 0] as Vec3 };
    estado.rumo = norteEm(estado.p);
    for (let k = 0; k < 500; k++) {
      estado = avancar(estado.p, estado.rumo, 0.01);
      expect(Math.abs(produtoEscalar(estado.p, estado.rumo))).toBeLessThan(1e-9);
    }
  });

  it('CEN-15: o norte aponta para o polo +y; no polo usa o de onde se veio', () => {
    const p = normalizar([1, 0.2, 0]);
    const norte = norteEm(p);
    expect(norte[1]).toBeGreaterThan(0.9);
    expect(Math.abs(produtoEscalar(norte, p))).toBeLessThan(1e-12);
    const noPolo = norteEm([0, 1, 0], [1, 0, 0]);
    expect(noPolo).toEqual([1, 0, 0]);
  });
});
