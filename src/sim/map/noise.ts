/** Ruído de gradiente 2D determinístico (sem tabelas; o hash vem das coordenadas e da seed). */

export function hashInteiro(ix: number, iz: number, seed: number): number {
  let h =
    (Math.imul(ix | 0, 0x27d4eb2d) ^
      Math.imul(iz | 0, 0x165667b1) ^
      Math.imul(seed | 0, 0x9e3779b1)) >>>
    0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

const D = Math.SQRT1_2;
const GX = [1, -1, 0, 0, D, -D, D, -D];
const GZ = [0, 0, 1, -1, D, D, -D, -D];

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function gradiente(ix: number, iz: number, seed: number, dx: number, dz: number): number {
  const h = hashInteiro(ix, iz, seed) & 7;
  return GX[h]! * dx + GZ[h]! * dz;
}

/** Ruído de gradiente em aproximadamente [-0,7; 0,7]. */
export function ruidoGradiente(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const n00 = gradiente(x0, z0, seed, fx, fz);
  const n10 = gradiente(x0 + 1, z0, seed, fx - 1, fz);
  const n01 = gradiente(x0, z0 + 1, seed, fx, fz - 1);
  const n11 = gradiente(x0 + 1, z0 + 1, seed, fx - 1, fz - 1);
  const u = fade(fx);
  const v = fade(fz);
  const a = n00 + u * (n10 - n00);
  const b = n01 + u * (n11 - n01);
  return a + v * (b - a);
}

/** Soma fractal de oitavas (amplitude cai à metade, frequência dobra). Normalizado pela soma das amplitudes. */
export function fbm(
  x: number,
  z: number,
  seed: number,
  oitavas: number,
  frequencia: number,
): number {
  let soma = 0;
  let amplitude = 1;
  let norma = 0;
  let f = frequencia;
  for (let o = 0; o < oitavas; o++) {
    soma += amplitude * ruidoGradiente(x * f, z * f, seed + o * 1013);
    norma += amplitude;
    amplitude *= 0.5;
    f *= 2;
  }
  return soma / norma;
}

// ---------------------------------------------------------------------------------------------
// Ruído 3D, para a superfície do planeta (CEN-14): amostrado em pontos da esfera, em metros.

/** Gradiente de uma das 12 arestas do cubo (Perlin melhorado), escolhido pelo hash do vértice. */
function grad3(
  ix: number,
  iy: number,
  iz: number,
  seed: number,
  dx: number,
  dy: number,
  dz: number,
): number {
  let h =
    (Math.imul(ix, 0x27d4eb2d) ^
      Math.imul(iy, 0x165667b1) ^
      Math.imul(iz, 0x1b873593) ^
      Math.imul(seed, 0x9e3779b1)) >>>
    0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = ((h ^ (h >>> 16)) >>> 0) % 12;
  switch (h) {
    case 0:
      return dx + dy;
    case 1:
      return -dx + dy;
    case 2:
      return dx - dy;
    case 3:
      return -dx - dy;
    case 4:
      return dx + dz;
    case 5:
      return -dx + dz;
    case 6:
      return dx - dz;
    case 7:
      return -dx - dz;
    case 8:
      return dy + dz;
    case 9:
      return -dy + dz;
    case 10:
      return dy - dz;
    default:
      return -dy - dz;
  }
}

/** Ruído de gradiente 3D em aproximadamente [−1, 1]. */
export function ruidoGradiente3(x: number, y: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fy = y - y0;
  const fz = z - z0;
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const z1 = z0 + 1;
  const u = fade(fx);
  const v = fade(fy);
  const w = fade(fz);
  const n000 = grad3(x0, y0, z0, seed, fx, fy, fz);
  const n100 = grad3(x1, y0, z0, seed, fx - 1, fy, fz);
  const n010 = grad3(x0, y1, z0, seed, fx, fy - 1, fz);
  const n110 = grad3(x1, y1, z0, seed, fx - 1, fy - 1, fz);
  const n001 = grad3(x0, y0, z1, seed, fx, fy, fz - 1);
  const n101 = grad3(x1, y0, z1, seed, fx - 1, fy, fz - 1);
  const n011 = grad3(x0, y1, z1, seed, fx, fy - 1, fz - 1);
  const n111 = grad3(x1, y1, z1, seed, fx - 1, fy - 1, fz - 1);
  const x00 = n000 + u * (n100 - n000);
  const x10 = n010 + u * (n110 - n010);
  const x01 = n001 + u * (n101 - n001);
  const x11 = n011 + u * (n111 - n011);
  const y0v = x00 + v * (x10 - x00);
  const y1v = x01 + v * (x11 - x01);
  return y0v + w * (y1v - y0v);
}

/** fbm 3D, normalizado pela soma das amplitudes. */
export function fbm3(
  x: number,
  y: number,
  z: number,
  seed: number,
  oitavas: number,
  frequencia: number,
): number {
  let soma = 0;
  let amplitude = 1;
  let norma = 0;
  let f = frequencia;
  for (let o = 0; o < oitavas; o++) {
    soma += amplitude * ruidoGradiente3(x * f, y * f, z * f, seed + o * 1013);
    norma += amplitude;
    amplitude *= 0.5;
    f *= 2;
  }
  return soma / norma;
}
