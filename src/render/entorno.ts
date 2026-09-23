/**
 * Entorno visual além da borda do mapa: serras em baixa resolução, para a câmera nunca ver o
 * vazio. Não existe na simulação (a faixa da borda já é intransponível, CEN-09). A faixa interna
 * fica 3 m abaixo do terreno do mapa, escondida pelas serras da borda.
 */
import { BufferAttribute, BufferGeometry, Mesh, type Material } from 'three';
import { alturaEm, type Heightmap } from '../sim/map/heightmap';
import { fbm } from '../sim/map/noise';

const ALCANCE_M = 900;
const PASSO_M = 16;
const SOBREPOSICAO_M = 12;
const ESCALA_DETALHE_M = 32;

function suave(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function criarEntorno(mapa: Heightmap, material: Material): Mesh {
  const meio = mapa.lado_m / 2;
  const limite = meio + ALCANCE_M;
  const n = Math.ceil((2 * limite) / PASSO_M);
  const lado = n + 1;
  const pos = new Float32Array(lado * lado * 3);
  const cor = new Float32Array(lado * lado * 3);
  const uv = new Float32Array(lado * lado * 2);

  const altura = (x: number, z: number): number => {
    if (Math.abs(x) <= meio && Math.abs(z) <= meio) return alturaEm(mapa, x, z) - 3;
    const xc = Math.min(Math.max(x, -meio), meio);
    const zc = Math.min(Math.max(z, -meio), meio);
    const naBorda = alturaEm(mapa, xc, zc);
    const fora = Math.hypot(x - xc, z - zc);
    const serra =
      30 +
      28 * fbm(x, z, 77, 4, 1 / 220) +
      10 * fbm(x, z, 78, 3, 1 / 60) -
      Math.max(0, fora - 350) * 0.06;
    return naBorda + (serra - naBorda) * suave(0, 90, fora);
  };

  for (let j = 0; j < lado; j++) {
    for (let i = 0; i < lado; i++) {
      const v = j * lado + i;
      const x = -limite + i * PASSO_M;
      const z = -limite + j * PASSO_M;
      pos[v * 3] = x;
      pos[v * 3 + 1] = altura(x, z);
      pos[v * 3 + 2] = z;
      const a = (0.21 + 0.02 * fbm(x, z, 79, 2, 1 / 90)) / 0.9;
      cor.set([a, a * 0.992, a * 0.982], v * 3);
      uv.set([x / ESCALA_DETALHE_M, z / ESCALA_DETALHE_M], v * 2);
    }
  }

  const dentro = (x: number, z: number) =>
    Math.abs(x) < meio - SOBREPOSICAO_M && Math.abs(z) < meio - SOBREPOSICAO_M;
  const indices: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x0 = -limite + i * PASSO_M;
      const z0 = -limite + j * PASSO_M;
      const todosDentro =
        dentro(x0, z0) &&
        dentro(x0 + PASSO_M, z0) &&
        dentro(x0, z0 + PASSO_M) &&
        dentro(x0 + PASSO_M, z0 + PASSO_M);
      if (todosDentro) continue;
      const a = j * lado + i;
      const b = a + 1;
      const c = a + lado;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometria = new BufferGeometry();
  geometria.setAttribute('position', new BufferAttribute(pos, 3));
  geometria.setAttribute('color', new BufferAttribute(cor, 3));
  geometria.setAttribute('uv', new BufferAttribute(uv, 2));
  geometria.setIndex(indices);
  geometria.computeVertexNormals();
  const malha = new Mesh(geometria, material);
  malha.name = 'entorno';
  malha.receiveShadow = true;
  return malha;
}
