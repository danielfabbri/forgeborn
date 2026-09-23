/**
 * Heightmap de 16 bits (CEN-13): 1 texel = 1 m, alturas em centímetros.
 * O mapa é centrado na origem: a amostra (i, j) fica em x = i − lado/2, z = j − lado/2.
 * O valor guardado é (y + ALTURA_BASE_M) × 100, então y vai de −100 m a +555 m.
 */
export const ALTURA_BASE_M = 100;

export interface Heightmap {
  lado_m: number;
  /** Amostras por lado: lado_m + 1. */
  resolucao: number;
  alturas: Uint16Array;
}

export function codificarAltura(y: number): number {
  return Math.min(65535, Math.max(0, Math.round((y + ALTURA_BASE_M) * 100)));
}

/** Altura (m) da amostra (i, j), com os índices presos ao mapa. */
export function alturaAmostra(mapa: Heightmap, i: number, j: number): number {
  const n = mapa.resolucao - 1;
  const ic = i < 0 ? 0 : i > n ? n : i;
  const jc = j < 0 ? 0 : j > n ? n : j;
  return mapa.alturas[jc * mapa.resolucao + ic]! / 100 - ALTURA_BASE_M;
}

/** Altura (m) no ponto do mundo (x, z), por interpolação bilinear. */
export function alturaEm(mapa: Heightmap, x: number, z: number): number {
  const meio = mapa.lado_m / 2;
  const fx = Math.min(Math.max(x + meio, 0), mapa.lado_m);
  const fz = Math.min(Math.max(z + meio, 0), mapa.lado_m);
  const i = Math.min(Math.floor(fx), mapa.lado_m - 1);
  const j = Math.min(Math.floor(fz), mapa.lado_m - 1);
  const u = fx - i;
  const v = fz - j;
  const h00 = alturaAmostra(mapa, i, j);
  const h10 = alturaAmostra(mapa, i + 1, j);
  const h01 = alturaAmostra(mapa, i, j + 1);
  const h11 = alturaAmostra(mapa, i + 1, j + 1);
  return (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v;
}

/** Inclinação (graus) na amostra (i, j), por diferenças centrais. */
export function inclinacaoAmostra(mapa: Heightmap, i: number, j: number): number {
  const dx = (alturaAmostra(mapa, i + 1, j) - alturaAmostra(mapa, i - 1, j)) / 2;
  const dz = (alturaAmostra(mapa, i, j + 1) - alturaAmostra(mapa, i, j - 1)) / 2;
  return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
}
