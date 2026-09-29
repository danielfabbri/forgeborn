/**
 * CTL-16 (D-83): a atmosfera vista de fora, na visão planetária: uma esfera em volta do corpo, na
 * cor do horizonte, com a borda mais densa, que chega a `atmosfera_opacidade_pct`% no fim do zoom.
 */
import { type Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

/** Espessura aparente da atmosfera em relação ao raio (apresentação). */
const ESPESSURA = 0.06;

export class AtmosferaDeFora {
  readonly objeto: Mesh<SphereGeometry, ShaderMaterial>;

  constructor(raio: number, cor: Color, opacidadeMax: number) {
    const material = new ShaderMaterial({
      uniforms: {
        uCor: { value: cor.clone() },
        uOpacidade: { value: 0 },
        uMax: { value: opacidadeMax },
        uSol: { value: new Vector3(0, 1, 0) },
      },
      vertexShader: `varying vec3 vNormal; varying vec3 vVista;
        void main() {
          vec4 mundo = modelMatrix * vec4(position, 1.0);
          vNormal = normalize(mat3(modelMatrix) * normal);
          vVista = normalize(cameraPosition - mundo.xyz);
          gl_Position = projectionMatrix * viewMatrix * mundo;
        }`,
      fragmentShader: `uniform vec3 uCor; uniform float uOpacidade; uniform float uMax;
        uniform vec3 uSol; varying vec3 vNormal; varying vec3 vVista;
        void main() {
          vec3 n = normalize(vNormal);
          // Mais densa na borda (o caminho pelo ar é maior), até a opacidade máxima no centro.
          float borda = 1.0 - max(dot(n, normalize(vVista)), 0.0);
          float a = uOpacidade * mix(uMax, 1.0, pow(borda, 3.0));
          // Lado do dia e lado da noite, com o crepúsculo suave entre eles.
          float luz = smoothstep(-0.35, 0.6, dot(n, normalize(uSol)));
          vec3 cor = uCor * (0.12 + 0.95 * luz) * (1.0 + borda * 0.5);
          gl_FragColor = vec4(cor, a);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.objeto = new Mesh(new SphereGeometry(raio * (1 + ESPESSURA), 96, 48), material);
    this.objeto.renderOrder = 20;
    this.objeto.frustumCulled = false;
    this.objeto.visible = false;
  }

  /** `t`: 0 no chão (invisível), 1 no fim do zoom; `sol`: direção (mundo) para o Sol. */
  atualizar(t: number, sol: Vector3): void {
    this.objeto.visible = t > 0.01;
    this.objeto.material.uniforms.uOpacidade!.value = t;
    this.objeto.material.uniforms.uSol!.value.copy(sol);
  }
}
