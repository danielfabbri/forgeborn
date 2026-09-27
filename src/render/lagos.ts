/**
 * §14.7/CEN-04: os lagos de metano de Titã, escuros e espelhados: um disco na superfície de cada
 * lago, no nível da água, com o reflexo do céu mais forte no ângulo rasante (Fresnel) e a névoa
 * de guerra do jogador (VIS-01). Só apresentação.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { avancar, girar, norteEm } from '../sim/map/esfera';
import type { Lago } from '../sim/map/lagos';
import { GLSL_NEVOA, type NevoaRender } from './nevoa';

const ANEIS = 10;
const SETORES = 48;

export function criarLagos(
  lagos: readonly Lago[],
  raio: number,
  ceu: Color,
  nevoa: NevoaRender | null,
  escuroBrilho: number,
): Mesh | null {
  if (lagos.length === 0) return null;
  const posicoes: number[] = [];
  const indices: number[] = [];
  for (const l of lagos) {
    const base = posicoes.length / 3;
    const r = raio + l.nivel;
    posicoes.push(l.d[0] * r, l.d[1] * r, l.d[2] * r);
    const norte = norteEm(l.d);
    for (let a = 1; a <= ANEIS; a++) {
      for (let s = 0; s < SETORES; s++) {
        const rumo = girar(norte, l.d, (s / SETORES) * Math.PI * 2);
        const p = avancar(l.d, rumo, ((a / ANEIS) * l.raio) / raio).p;
        posicoes.push(p[0] * r, p[1] * r, p[2] * r);
      }
    }
    for (let s = 0; s < SETORES; s++) {
      indices.push(base, base + 1 + ((s + 1) % SETORES), base + 1 + s);
    }
    for (let a = 1; a < ANEIS; a++) {
      const i0 = base + 1 + (a - 1) * SETORES;
      const i1 = base + 1 + a * SETORES;
      for (let s = 0; s < SETORES; s++) {
        const s1 = (s + 1) % SETORES;
        indices.push(i0 + s, i0 + s1, i1 + s, i0 + s1, i1 + s1, i1 + s);
      }
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(posicoes), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  // As normais do disco apontam para fora do planeta (a vertical local).
  const normais = geo.attributes.normal!;
  const v = new Vector3();
  for (let k = 0; k < normais.count; k++) {
    v.fromBufferAttribute(geo.attributes.position!, k).normalize();
    normais.setXYZ(k, v.x, v.y, v.z);
  }
  const material = new MeshStandardMaterial({
    color: '#2b1a0e',
    roughness: 0.12,
    metalness: 0,
    side: DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCeuReflexo = { value: ceu.clone() };
    shader.uniforms.uNevoa = { value: nevoa?.textura ?? null };
    shader.uniforms.uNevoaN = { value: nevoa?.n ?? 1 };
    shader.uniforms.uNevoaAtiva = { value: nevoa ? 1 : 0 };
    shader.uniforms.uEscuroBrilho = { value: escuroBrilho };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPosLago;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvPosLago = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform vec3 uCeuReflexo;\nvarying vec3 vPosLago;\n${GLSL_NEVOA}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
// Espelho: o céu refletido domina no ângulo rasante.
vec3 olhar = normalize(cameraPosition - vPosLago);
float fresnel = 0.32 + 0.6 * pow(1.0 - max(dot(normalize(vPosLago), olhar), 0.0), 3.0);
// Ondulação leve e fixa: o reflexo quebra em faixas, como um líquido parado mas vivo.
float onda = sin(dot(vPosLago, vec3(0.9, 0.3, 0.7)) * 0.31 + sin(dot(vPosLago, vec3(-0.4, 0.8, 0.2)) * 0.13) * 2.0)
  + 0.5 * sin(dot(vPosLago, vec3(0.2, -0.6, 0.8)) * 0.57);
fresnel *= 0.9 + 0.08 * onda;
gl_FragColor.rgb = mix(gl_FragColor.rgb, uCeuReflexo * 1.1, clamp(fresnel, 0.0, 1.0));
gl_FragColor.rgb = aplicarNevoa(gl_FragColor.rgb, vPosLago);`,
      );
  };
  const malha = new Mesh(geo, material);
  malha.name = 'lagos';
  malha.receiveShadow = true;
  malha.frustumCulled = false;
  return malha;
}
