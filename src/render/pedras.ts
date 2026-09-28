/**
 * CEN-17 (D-86): as pedras neutras, rochas baixas e irregulares assentadas no chão, na cor do
 * terreno do cenário e sob a névoa de guerra do jogador (VIS-01). Só apresentação.
 */
import {
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { Vec3 } from '../sim/map/esfera';
import type { Pedra } from '../sim/map/pedras';
import { GLSL_NEVOA, type NevoaRender } from './nevoa';

/** Pseudoaleatório fixo por índice (0 a 1), para a forma e o giro de cada pedra. */
function hash(k: number): number {
  const s = Math.sin(k * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Uma rocha de raio 1: icosaedro com os vértices deslocados, achatado em cima. */
function geometriaDaRocha(): IcosahedronGeometry {
  const geo = new IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position!;
  const v = new Vector3();
  for (let k = 0; k < pos.count; k++) {
    v.fromBufferAttribute(pos, k);
    // Vértices repetidos na mesma posição recebem o mesmo deslocamento (sem rachas).
    const chave = Math.round(v.x * 97) * 7 + Math.round(v.y * 97) * 13 + Math.round(v.z * 97) * 19;
    v.multiplyScalar(0.8 + 0.35 * hash(chave));
    pos.setXYZ(k, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export function criarPedras(
  pedras: readonly Pedra[],
  raio: number,
  alturaEm: (d: Vec3) => number,
  tinta: readonly [number, number, number],
  grama: boolean,
  nevoa: NevoaRender | null,
  escuroBrilho: number,
): InstancedMesh | null {
  if (pedras.length === 0) return null;
  // Na Terra (grama) a rocha é cinza; nos outros corpos, puxa a cor do chão.
  const cor = grama
    ? new Color(0.46, 0.45, 0.43)
    : new Color(0.5 * tinta[0], 0.48 * tinta[1], 0.46 * tinta[2]);
  const material = new MeshStandardMaterial({ color: cor, roughness: 0.95, flatShading: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNevoa = { value: nevoa?.textura ?? null };
    shader.uniforms.uNevoaN = { value: nevoa?.n ?? 1 };
    shader.uniforms.uNevoaAtiva = { value: nevoa ? 1 : 0 };
    shader.uniforms.uEscuroBrilho = { value: escuroBrilho };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPosPedra;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvPosPedra = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vPosPedra;\n${GLSL_NEVOA}`)
      .replace(
        '#include <opaque_fragment>',
        '#include <opaque_fragment>\ngl_FragColor.rgb = aplicarNevoa(gl_FragColor.rgb, vPosPedra);',
      );
  };
  const malha = new InstancedMesh(geometriaDaRocha(), material, pedras.length);
  const m = new Matrix4();
  const q = new Quaternion();
  const giro = new Quaternion();
  const cima = new Vector3();
  const escala = new Vector3();
  const pos = new Vector3();
  const Y = new Vector3(0, 1, 0);
  pedras.forEach((p, k) => {
    cima.set(p.d[0], p.d[1], p.d[2]).normalize();
    q.setFromUnitVectors(Y, cima);
    giro.setFromAxisAngle(Y, hash(k + 0.5) * Math.PI * 2);
    q.multiply(giro);
    const altura = p.raio * (0.55 + 0.35 * hash(k + 0.25));
    escala.set(p.raio, altura, p.raio * (0.8 + 0.2 * hash(k + 0.75)));
    // Assentada: um quarto da altura fica enterrado.
    const r = raio + alturaEm(p.d) - 0.25 * altura;
    pos.copy(cima).multiplyScalar(r);
    m.compose(pos, q, escala);
    malha.setMatrixAt(k, m);
  });
  malha.instanceMatrix.needsUpdate = true;
  malha.name = 'pedras';
  malha.castShadow = true;
  malha.receiveShadow = true;
  malha.frustumCulled = false;
  return malha;
}
