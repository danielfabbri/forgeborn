/**
 * Texturas procedurais do regolito (detalhe de albedo e mapa de normais), repetíveis sem emenda.
 * Placeholder de qualidade média até a arte final (T-124).
 */
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  type Texture,
  UnsignedByteType,
} from 'three';

export const TAM = 256;

export function hash(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ruído de valor periódico (período `periodo` células). */
export function ruidoPeriodico(x: number, z: number, periodo: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const m = (a: number) => ((a % periodo) + periodo) % periodo;
  const a = hash(m(x0), m(z0), seed);
  const b = hash(m(x0 + 1), m(z0), seed);
  const c = hash(m(x0), m(z0 + 1), seed);
  const d = hash(m(x0 + 1), m(z0 + 1), seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Relevo fino (0..1): fBm periódico + microcrateras. */
function relevoFino(): Float32Array {
  const altura = new Float32Array(TAM * TAM);
  for (let j = 0; j < TAM; j++) {
    for (let i = 0; i < TAM; i++) {
      let soma = 0;
      let amp = 0.5;
      for (let o = 0; o < 5; o++) {
        const periodo = 8 << o;
        soma += amp * ruidoPeriodico((i / TAM) * periodo, (j / TAM) * periodo, periodo, 11 + o);
        amp *= 0.5;
      }
      altura[j * TAM + i] = soma;
    }
  }
  // Microcrateras (bacia + borda), desenhadas com repetição nas bordas da textura.
  for (let k = 0; k < 36; k++) {
    const cx = hash(k, 1, 7) * TAM;
    const cz = hash(k, 2, 7) * TAM;
    const r = 2 + hash(k, 3, 7) ** 2 * 14;
    for (let dz = -Math.ceil(r * 1.6); dz <= Math.ceil(r * 1.6); dz++) {
      for (let dx = -Math.ceil(r * 1.6); dx <= Math.ceil(r * 1.6); dx++) {
        const d = Math.hypot(dx, dz) / r;
        if (d > 1.6) continue;
        const perfil =
          d < 1 ? -0.25 * (1 - d * d) + 0.12 * d ** 6 : 0.12 * Math.exp(-(((d - 1) / 0.25) ** 2));
        const i = (((Math.round(cx) + dx) % TAM) + TAM) % TAM;
        const j = (((Math.round(cz) + dz) % TAM) + TAM) % TAM;
        altura[j * TAM + i]! += 0.6 * perfil * Math.min(1, r / 8);
      }
    }
  }
  return altura;
}

function textura(dados: Uint8Array, cor: boolean): Texture {
  const tex = new DataTexture(dados, TAM, TAM, RGBAFormat, UnsignedByteType);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = cor ? SRGBColorSpace : NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export interface TexturasRegolito {
  detalhe: Texture;
  normais: Texture;
}

/**
 * Empacota um campo de altura (0..1-ish, periódico em `TAM`) nas texturas de albedo e normais.
 * Compartilhado pelo regolito (`criarTexturasRegolito`) e pelas placas de Vênus (`placas.ts`).
 */
export function empacotarTexturas(
  altura: Float32Array,
  tomBase = 0.72,
  tomGanho = 0.4,
): TexturasRegolito {
  const at = (i: number, j: number) =>
    altura[(((j % TAM) + TAM) % TAM) * TAM + (((i % TAM) + TAM) % TAM)]!;
  const detalhe = new Uint8Array(TAM * TAM * 4);
  const normais = new Uint8Array(TAM * TAM * 4);
  for (let j = 0; j < TAM; j++) {
    for (let i = 0; i < TAM; i++) {
      const o = (j * TAM + i) * 4;
      // Albedo de detalhe em torno de 0,9 (o terreno compensa na cor por vértice).
      const tom = Math.min(255, Math.max(0, Math.round((tomBase + tomGanho * at(i, j)) * 230)));
      detalhe[o] = tom;
      detalhe[o + 1] = tom;
      detalhe[o + 2] = tom;
      detalhe[o + 3] = 255;
      const dx = (at(i + 1, j) - at(i - 1, j)) * 6;
      const dz = (at(i, j + 1) - at(i, j - 1)) * 6;
      const len = Math.hypot(dx, 1, dz);
      normais[o] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      normais[o + 1] = Math.round(((-dz / len) * 0.5 + 0.5) * 255);
      normais[o + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      normais[o + 3] = 255;
    }
  }
  return { detalhe: textura(detalhe, true), normais: textura(normais, false) };
}

export function criarTexturasRegolito(): TexturasRegolito {
  return empacotarTexturas(relevoFino());
}
