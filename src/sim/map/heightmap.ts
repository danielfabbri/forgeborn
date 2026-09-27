/**
 * Heightmap de 16 bits do planeta (CEN-13, CEN-14): uma grade de vértices em cada uma das 6
 * faces da cubo-esfera, com ~1 m entre vértices, alturas radiais em centímetros acima da esfera
 * de raio `raio_m`. O valor guardado é (h + ALTURA_BASE_M) × 100, então h vai de −100 m a +555 m.
 *
 * O vértice (face, i, j), com i, j ∈ [0, resolucao], fica na direção
 * direcaoDaFace(face, tanDaDivisao(i, res), tanDaDivisao(j, res)). Vértices nas arestas do cubo
 * existem em mais de uma face, com a mesma direção e o mesmo valor.
 */
import {
  arco,
  celulaRotacionada,
  direcaoDaFace,
  faceDaDirecao,
  fracaoDaFace,
  normalizar,
  produtoVetorial,
  tangente,
  tanDaDivisao,
  type Vec3,
} from './esfera';
import type { Lago } from './lagos';

export const ALTURA_BASE_M = 100;

export interface Heightmap {
  raio_m: number;
  /** Divisões por aresta de face; há resolucao + 1 vértices por aresta. */
  resolucao: number;
  /** 6 × (resolucao + 1)² alturas codificadas. */
  alturas: Uint16Array;
  /** CEN-04: lagos de metano (só em Titã). */
  lagos?: Lago[];
}

export function codificarAltura(h: number): number {
  return Math.min(65535, Math.max(0, Math.round((h + ALTURA_BASE_M) * 100)));
}

export function verticesPorFace(mapa: Heightmap): number {
  return (mapa.resolucao + 1) * (mapa.resolucao + 1);
}

export function indiceDoVertice(res: number, face: number, i: number, j: number): number {
  return face * (res + 1) * (res + 1) + j * (res + 1) + i;
}

export function direcaoDoVertice(res: number, face: number, i: number, j: number): Vec3 {
  return direcaoDaFace(face, tanDaDivisao(i, res), tanDaDivisao(j, res));
}

/** Vértice correspondente pela rotação de simetria σ (exato, como celulaRotacionada). */
export function verticeRotacionado(res: number, indice: number, sigma: Vec3): number {
  // Um vértice é uma "célula" de uma grade (res + 1) × (res + 1) simétrica em torno do centro.
  return celulaRotacionada(res + 1, indice, sigma);
}

/** Altura (m) do vértice (face, i, j). */
export function alturaDoVertice(mapa: Heightmap, face: number, i: number, j: number): number {
  return mapa.alturas[indiceDoVertice(mapa.resolucao, face, i, j)]! / 100 - ALTURA_BASE_M;
}

/** Altura (m) na direção d, por interpolação bilinear na face. */
export function alturaEm(mapa: Heightmap, d: Vec3): number {
  const res = mapa.resolucao;
  const { face, a, b } = faceDaDirecao(d);
  const fi = Math.min(Math.max(fracaoDaFace(a) * res, 0), res);
  const fj = Math.min(Math.max(fracaoDaFace(b) * res, 0), res);
  const i = Math.min(Math.floor(fi), res - 1);
  const j = Math.min(Math.floor(fj), res - 1);
  const u = fi - i;
  const v = fj - j;
  const base = face * (res + 1) * (res + 1);
  const linha = res + 1;
  const h00 = mapa.alturas[base + j * linha + i]!;
  const h10 = mapa.alturas[base + j * linha + i + 1]!;
  const h01 = mapa.alturas[base + (j + 1) * linha + i]!;
  const h11 = mapa.alturas[base + (j + 1) * linha + i + 1]!;
  const cod = (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v;
  return cod / 100 - ALTURA_BASE_M;
}

/** Ponto 3D do terreno na direção d, somada uma folga radial opcional. */
export function pontoDoTerreno(mapa: Heightmap, d: Vec3, folga = 0): Vec3 {
  const r = mapa.raio_m + alturaEm(mapa, d) + folga;
  return [d[0] * r, d[1] * r, d[2] * r];
}

/**
 * Inclinação (graus) na direção d em relação à vertical local (MOV-01), por diferenças centrais
 * de `passo_m` metros em duas direções tangentes.
 */
export function inclinacaoEm(mapa: Heightmap, d: Vec3, passo_m = 0.5): number {
  const e1 = tangente(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])!;
  const e2 = normalizar(produtoVetorial(d, e1));
  const angulo = passo_m / mapa.raio_m;
  const desloca = (e: Vec3, s: number): Vec3 =>
    normalizar([d[0] + e[0] * s * angulo, d[1] + e[1] * s * angulo, d[2] + e[2] * s * angulo]);
  const dx = (alturaEm(mapa, desloca(e1, 1)) - alturaEm(mapa, desloca(e1, -1))) / (2 * passo_m);
  const dy = (alturaEm(mapa, desloca(e2, 1)) - alturaEm(mapa, desloca(e2, -1))) / (2 * passo_m);
  return (Math.atan(Math.hypot(dx, dy)) * 180) / Math.PI;
}

/** Distância (m) pelo arco sobre a esfera de raio `raio_m` (CEN-14). */
export function distanciaNaSuperficie(mapa: { raio_m: number }, a: Vec3, b: Vec3): number {
  return mapa.raio_m * arco(a, b);
}
