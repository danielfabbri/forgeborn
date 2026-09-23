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
