/**
 * §14.7/CEN-04: os mares de metano de Titã, escuros e espelhados, com o reflexo do céu mais forte no
 * ângulo rasante (Fresnel) e a névoa de guerra do jogador (VIS-01). Só apresentação.
 */
import { Color, FrontSide, Mesh, MeshStandardMaterial, SphereGeometry } from 'three';
import { GLSL_NEVOA, type NevoaRender } from './nevoa';

/** Segmentos da esfera do líquido (a flecha entre segmentos fica em centímetros). */
const SEGMENTOS = 384;

/**
 * CEN-04 (D-90): o líquido é uma esfera no nível do mar; o relevo acima dele é terra, e o contorno
 * dos mares, lagos e ilhas sai do próprio terreno (teste de profundidade).
 */
export function criarMar(
  nivel: number,
  raio: number,
  ceu: Color,
  nevoa: NevoaRender | null,
  escuroBrilho: number,
): Mesh {
  const geo = new SphereGeometry(raio + nivel, SEGMENTOS, SEGMENTOS / 2);
  const material = new MeshStandardMaterial({
    color: '#2a180b',
    roughness: 0.12,
    metalness: 0,
    side: FrontSide,
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
float fresnel = 0.28 + 0.5 * pow(1.0 - max(dot(normalize(vPosLago), olhar), 0.0), 3.0);
// Ondulação leve e fixa: o reflexo quebra em faixas, como um líquido parado mas vivo.
float onda = sin(dot(vPosLago, vec3(0.9, 0.3, 0.7)) * 0.31 + sin(dot(vPosLago, vec3(-0.4, 0.8, 0.2)) * 0.13) * 2.0)
  + 0.5 * sin(dot(vPosLago, vec3(0.2, -0.6, 0.8)) * 0.57);
fresnel *= 0.9 + 0.08 * onda;
gl_FragColor.rgb = mix(gl_FragColor.rgb, uCeuReflexo * 0.85, clamp(fresnel, 0.0, 1.0));
gl_FragColor.rgb = aplicarNevoa(gl_FragColor.rgb, vPosLago);`,
      );
  };
  const malha = new Mesh(geo, material);
  malha.name = 'mar';
  malha.receiveShadow = true;
  malha.frustumCulled = false;
  return malha;
}
