/**
 * RNG seedado da simulação (TEC-05): xoshiro128**, com estado semeado por splitmix32.
 * O estado é uma tupla de 4 inteiros sem sinal de 32 bits, serializável em JSON.
 */
export type RngState = [number, number, number, number];

function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

export function seedRng(seed: number): RngState {
  if (!Number.isSafeInteger(seed)) throw new Error(`Seed inválida: ${seed}`);
  const next = splitmix32(seed);
  const state: RngState = [next(), next(), next(), next()];
  if (state.every((word) => word === 0)) state[0] = 1;
  return state;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Próximo inteiro sem sinal de 32 bits. Avança o estado. */
export function nextU32(s: RngState): number {
  const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
  const t = (s[1] << 9) >>> 0;
  s[2] = (s[2] ^ s[0]) >>> 0;
  s[3] = (s[3] ^ s[1]) >>> 0;
  s[1] = (s[1] ^ s[2]) >>> 0;
  s[0] = (s[0] ^ s[3]) >>> 0;
  s[2] = (s[2] ^ t) >>> 0;
  s[3] = rotl(s[3], 11);
  return result;
}

/** Real em [0, 1). */
export function nextFloat(s: RngState): number {
  return nextU32(s) / 4294967296;
}

/** Inteiro em [min, max], limites inclusos. */
export function nextInt(s: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(s) * (max - min + 1));
}
