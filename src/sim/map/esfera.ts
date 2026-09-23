/**
 * Geometria do planeta (CEN-14, CEN-15): vetores, arcos de grande círculo e a cubo-esfera
 * equiangular que divide a superfície em 6 faces com a mesma grade.
 *
 * Direções são vetores unitários a partir do centro. A face (k, s) tem normal s·eₖ e eixos
 * a = e₍ₖ₊₁₎, b = e₍ₖ₊₂₎ (índices mod 3); o ponto da face com parâmetros (A, B) = (tan α, tan β)
 * é normalizar(s·eₖ + A·a + B·b), com α, β ∈ [−π/4, π/4]. Índice de célula:
 * face · n² + j · n + i, com face = 2k + (s < 0 ? 1 : 0).
 *
 * As rotações de simetria do mapa (CEN-06) são trocas de sinal de dois eixos; como a grade é
 * simétrica em torno do centro de cada face, elas levam célula em célula exatamente.
 */

export type Vec3 = [number, number, number];

export const TAU = Math.PI * 2;
const QUARTO = Math.PI / 4;

export function soma(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function diferenca(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function escalar(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export function produtoEscalar(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function produtoVetorial(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function comprimento(a: Vec3): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

export function normalizar(a: Vec3): Vec3 {
  const c = comprimento(a);
  return c === 0 ? [0, 1, 0] : [a[0] / c, a[1] / c, a[2] / c];
}

/** Ângulo (rad) entre duas direções, estável também para ângulos pequenos. */
export function arco(a: Vec3, b: Vec3): number {
  return Math.atan2(comprimento(produtoVetorial(a, b)), produtoEscalar(a, b));
}

/** Rotação de v em torno do eixo unitário por `angulo` (Rodrigues). */
export function girar(v: Vec3, eixo: Vec3, angulo: number): Vec3 {
  const c = Math.cos(angulo);
  const s = Math.sin(angulo);
  const k = produtoEscalar(eixo, v) * (1 - c);
  const x = produtoVetorial(eixo, v);
  return [
    v[0] * c + x[0] * s + eixo[0] * k,
    v[1] * c + x[1] * s + eixo[1] * k,
    v[2] * c + x[2] * s + eixo[2] * k,
  ];
}

/** Componente de v tangente à esfera em p, normalizada; null se v é (quase) radial. */
export function tangente(p: Vec3, v: Vec3): Vec3 | null {
  const t = diferenca(v, escalar(p, produtoEscalar(p, v)));
  const c = comprimento(t);
  return c < 1e-12 ? null : [t[0] / c, t[1] / c, t[2] / c];
}

/**
 * Anda `angulo` rad a partir de p no rumo tangente `rumo`, pelo grande círculo, e devolve o
 * ponto e o rumo transportado (paralelo ao caminho).
 */
export function avancar(p: Vec3, rumo: Vec3, angulo: number): { p: Vec3; rumo: Vec3 } {
  if (angulo === 0) return { p, rumo };
  const eixo = normalizar(produtoVetorial(p, rumo));
  return { p: normalizar(girar(p, eixo, angulo)), rumo: normalizar(girar(rumo, eixo, angulo)) };
}

/** Rumo tangente em p que leva a `alvo` pelo grande círculo; null se coincidem ou são antípodas. */
export function rumoPara(p: Vec3, alvo: Vec3): Vec3 | null {
  return tangente(p, alvo);
}

/** Ponto a `fracao` do caminho de a até b pelo grande círculo. */
export function interpolarArco(a: Vec3, b: Vec3, fracao: number): Vec3 {
  const angulo = arco(a, b);
  if (angulo < 1e-12) return a;
  const eixo = normalizar(produtoVetorial(a, b));
  if (comprimento(produtoVetorial(a, b)) < 1e-12) return a;
  return normalizar(girar(a, eixo, angulo * fracao));
}

export const POLO_NORTE: Vec3 = [0, 1, 0];

/**
 * CEN-15: norte local em p (tangente, rumo ao polo +y). A menos de `raioPolo` rad do eixo,
 * usa `anterior` (o norte de onde o observador veio), ou +z como último recurso.
 */
export function norteEm(p: Vec3, anterior: Vec3 | null = null, raioPolo = 0): Vec3 {
  const distanciaDoEixo = Math.hypot(p[0], p[2]);
  if (distanciaDoEixo > Math.max(raioPolo, 1e-9)) {
    const t = tangente(p, POLO_NORTE);
    if (t) return t;
  }
  return (anterior && tangente(p, anterior)) ?? tangente(p, [0, 0, p[1] >= 0 ? -1 : 1])!;
}

// ---------------------------------------------------------------------------------------------
// Cubo-esfera

export interface CoordenadaDeFace {
  face: number;
  /** tan α e tan β, em [−1, 1]. */
  a: number;
  b: number;
}

export function faceDaDirecao(d: Vec3): CoordenadaDeFace {
  const ax = Math.abs(d[0]);
  const ay = Math.abs(d[1]);
  const az = Math.abs(d[2]);
  const k = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const s = d[k]! < 0 ? -1 : 1;
  const m = Math.abs(d[k]!);
  return { face: 2 * k + (s < 0 ? 1 : 0), a: d[(k + 1) % 3]! / m, b: d[(k + 2) % 3]! / m };
}

/** Direção unitária do ponto (A, B) = (tan α, tan β) da face. */
export function direcaoDaFace(face: number, a: number, b: number): Vec3 {
  const k = face >> 1;
  const s = face & 1 ? -1 : 1;
  const v: Vec3 = [0, 0, 0];
  v[k] = s;
  v[(k + 1) % 3] = a;
  v[(k + 2) % 3] = b;
  return normalizar(v);
}

/** Parâmetro contínuo em [0, 1] ao longo da face, a partir de tan α. */
export function fracaoDaFace(tangenteAngulo: number): number {
  return Math.atan(tangenteAngulo) / (2 * QUARTO) + 0.5;
}

/**
 * tan do ângulo da posição `k` numa divisão de `m` partes, com k medido a partir do centro
 * (k − m/2): simétrico exato em torno do centro e ±1 exatos nas bordas.
 */
export function tanDaDivisao(k: number, m: number): number {
  if (k <= 0) return -1;
  if (k >= m) return 1;
  let tabela = tabelasDeTan.get(m);
  if (!tabela) {
    tabela = new Float64Array(m + 1);
    for (let i = 0; i <= m; i++) {
      tabela[i] = i === 0 ? -1 : i === m ? 1 : Math.tan((i - m / 2) * ((2 * QUARTO) / m));
    }
    tabelasDeTan.set(m, tabela);
  }
  return Number.isInteger(k) ? tabela[k]! : Math.tan((k - m / 2) * ((2 * QUARTO) / m));
}

const tabelasDeTan = new Map<number, Float64Array>();

/** Rotações de simetria do mapa (CEN-06), como trocas de sinal (σx, σy, σz). */
export type Simetria = 2 | 4;

export function rotacoesDeSimetria(n: Simetria): Vec3[] {
  return n === 4
    ? [
        [1, 1, 1],
        [1, -1, -1],
        [-1, 1, -1],
        [-1, -1, 1],
      ]
    : [
        [1, 1, 1],
        [1, -1, -1],
      ];
}

export function aplicarRotacao(sigma: Vec3, v: Vec3): Vec3 {
  return [sigma[0] * v[0], sigma[1] * v[1], sigma[2] * v[2]];
}

export interface CuboEsfera {
  /** Células por aresta de face. */
  n: number;
  celulas: number;
  /** Ângulo nominal (rad) de uma célula: área média = ângulo². */
  anguloNominal: number;
  /** Centros unitários (x, y, z) de cada célula. */
  centros: Float64Array;
  /**
   * 8 vizinhas por célula, na ordem +i, −i, +j, −j, (+i+j), (+i−j), (−i+j), (−i−j); −1 quando
   * não existe (vértices do cubo).
   */
  vizinhos: Int32Array;
  /** Custo inteiro de cada passo: arco entre centros × 10 / ângulo nominal. */
  custos: Uint16Array;
}

export const PASSOS_I = [1, -1, 0, 0, 1, 1, -1, -1];
export const PASSOS_J = [0, 0, 1, -1, 1, -1, 1, -1];
/** Para cada diagonal (4..7), as duas vizinhas de lado que ela não pode cortar. */
export const LADOS_DA_DIAGONAL: ReadonlyArray<readonly [number, number]> = [
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
];

/** n para que a área média da célula seja `celula_m`² numa esfera de raio `raio_m`. */
export function celulasPorAresta(raio_m: number, celula_m: number): number {
  return Math.max(1, Math.round((raio_m * Math.sqrt((4 * Math.PI) / 6)) / celula_m));
}

export function indiceDaCelula(n: number, face: number, i: number, j: number): number {
  return face * n * n + j * n + i;
}

/** Célula que contém a direção d. */
export function celulaDaDirecao(n: number, d: Vec3): number {
  const { face, a, b } = faceDaDirecao(d);
  const i = Math.min(n - 1, Math.max(0, Math.floor(fracaoDaFace(a) * n)));
  const j = Math.min(n - 1, Math.max(0, Math.floor(fracaoDaFace(b) * n)));
  return indiceDaCelula(n, face, i, j);
}

/** Centro da célula, calculado (sem cache). */
export function centroCalculado(n: number, indice: number): Vec3 {
  const face = Math.floor(indice / (n * n));
  const resto = indice - face * n * n;
  const j = Math.floor(resto / n);
  const i = resto - j * n;
  return direcaoDaFace(face, tanDaDivisao(2 * i + 1, 2 * n), tanDaDivisao(2 * j + 1, 2 * n));
}

/** Célula correspondente pela rotação σ (exata). */
export function celulaRotacionada(n: number, indice: number, sigma: Vec3): number {
  const face = Math.floor(indice / (n * n));
  const resto = indice - face * n * n;
  const j = Math.floor(resto / n);
  const i = resto - j * n;
  const k = face >> 1;
  const s = face & 1 ? -1 : 1;
  const s2 = s * sigma[k]!;
  const i2 = sigma[(k + 1) % 3]! > 0 ? i : n - 1 - i;
  const j2 = sigma[(k + 2) % 3]! > 0 ? j : n - 1 - j;
  return indiceDaCelula(n, 2 * k + (s2 < 0 ? 1 : 0), i2, j2);
}

/**
 * Vizinha pela aresta do cubo: da célula (face, i, j), um passo em i (di = ±1, dj = 0) ou em j
 * (di = 0, dj = ±1) que sai da face. O ponto da aresta no meio do lado da célula tem
 * coordenadas exatas nas duas faces, então a correspondência é exata e simétrica.
 */
function vizinhaPelaAresta(n: number, face: number, i: number, j: number, di: number, dj: number) {
  const k = face >> 1;
  const s = face & 1 ? -1 : 1;
  const v: [number, number, number] = [0, 0, 0];
  v[k] = s;
  // Coordenada que sai da face vai a ±1; a outra fica no centro da célula.
  const a = di !== 0 ? di : tanDaDivisao(2 * i + 1, 2 * n);
  const b = dj !== 0 ? dj : tanDaDivisao(2 * j + 1, 2 * n);
  v[(k + 1) % 3] = a;
  v[(k + 2) % 3] = b;
  // Eixo da face vizinha: o que ficou com |v| = 1 além de k.
  const k2 = di !== 0 ? (k + 1) % 3 : (k + 2) % 3;
  const s2 = v[k2]! < 0 ? -1 : 1;
  const a2 = v[(k2 + 1) % 3]! / 1;
  const b2 = v[(k2 + 2) % 3]! / 1;
  const paraIndice = (t: number) =>
    t === 1 ? n - 1 : t === -1 ? 0 : Math.min(n - 1, Math.max(0, Math.floor(fracaoDaFace(t) * n)));
  return indiceDaCelula(n, 2 * k2 + (s2 < 0 ? 1 : 0), paraIndice(a2), paraIndice(b2));
}

function vizinhaDe(n: number, face: number, i: number, j: number, di: number, dj: number): number {
  const ni = i + di;
  const nj = j + dj;
  const foraI = ni < 0 || ni >= n;
  const foraJ = nj < 0 || nj >= n;
  if (!foraI && !foraJ) return indiceDaCelula(n, face, ni, nj);
  if (foraI && foraJ) return -1;
  // Um passo sai da face: anda primeiro na direção que fica dentro, depois cruza a aresta.
  if (foraI) return vizinhaPelaAresta(n, face, i, nj, di, 0);
  return vizinhaPelaAresta(n, face, ni, j, 0, dj);
}

const cache = new Map<number, CuboEsfera>();

export function cuboEsfera(n: number): CuboEsfera {
  const pronta = cache.get(n);
  if (pronta) return pronta;
  const celulas = 6 * n * n;
  const anguloNominal = Math.sqrt((4 * Math.PI) / celulas);
  const centros = new Float64Array(celulas * 3);
  for (let c = 0; c < celulas; c++) {
    const p = centroCalculado(n, c);
    centros[3 * c] = p[0];
    centros[3 * c + 1] = p[1];
    centros[3 * c + 2] = p[2];
  }
  const vizinhos = new Int32Array(celulas * 8);
  const custos = new Uint16Array(celulas * 8);
  for (let face = 0; face < 6; face++) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const c = indiceDaCelula(n, face, i, j);
        for (let d = 0; d < 8; d++) {
          const v = vizinhaDe(n, face, i, j, PASSOS_I[d]!, PASSOS_J[d]!);
          vizinhos[c * 8 + d] = v;
          if (v < 0) continue;
          const angulo = arco(
            [centros[3 * c]!, centros[3 * c + 1]!, centros[3 * c + 2]!],
            [centros[3 * v]!, centros[3 * v + 1]!, centros[3 * v + 2]!],
          );
          custos[c * 8 + d] = Math.max(1, Math.round((10 * angulo) / anguloNominal));
        }
      }
    }
  }
  const esfera: CuboEsfera = { n, celulas, anguloNominal, centros, vizinhos, custos };
  cache.set(n, esfera);
  return esfera;
}

export function centroDaCelula(g: CuboEsfera, indice: number): Vec3 {
  return [g.centros[3 * indice]!, g.centros[3 * indice + 1]!, g.centros[3 * indice + 2]!];
}
