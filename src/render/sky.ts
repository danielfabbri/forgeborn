/**
 * Céu lunar (§14.4, ART-08): estrelas e a Terra escura, sem luzes de cidades.
 * A Terra fica perto do Sol no céu, então quase toda a face visível está na noite:
 * só um crescente fino e o halo azul da atmosfera.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

function direcao(elevacaoGraus: number, azimuteGraus: number): Vector3 {
  const el = (elevacaoGraus * Math.PI) / 180;
  const az = (azimuteGraus * Math.PI) / 180;
  return new Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
}

/** Direção para o Sol: baixo no horizonte, luz rasante e sombras longas. */
export const DIRECAO_SOL = direcao(24, -35);
/** Direção para a Terra: perto do Sol no céu (fase escura). */
export const DIRECAO_TERRA = direcao(13, 12);

const DISTANCIA_CEU = 4000;

function estrelas(): Points {
  const quantidade = 5000;
  const posicoes = new Float32Array(quantidade * 3);
  const cores = new Float32Array(quantidade * 3);
  let s = 12345;
  const aleatorio = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let k = 0; k < quantidade; k++) {
    const z = aleatorio() * 2 - 1;
    const t = aleatorio() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    posicoes.set(
      [r * Math.cos(t) * DISTANCIA_CEU, z * DISTANCIA_CEU, r * Math.sin(t) * DISTANCIA_CEU],
      k * 3,
    );
    const brilho = 0.25 + aleatorio() ** 3 * 0.9;
    const tom = aleatorio();
    cores.set(
      [brilho * (tom < 0.15 ? 0.8 : 1), brilho * 0.95, brilho * (tom > 0.85 ? 0.8 : 1)],
      k * 3,
    );
  }
  const geometria = new BufferGeometry();
  geometria.setAttribute('position', new BufferAttribute(posicoes, 3));
  geometria.setAttribute('color', new BufferAttribute(cores, 3));
  const material = new PointsMaterial({
    size: 1.6,
    sizeAttenuation: false,
    vertexColors: true,
    toneMapped: false,
    depthWrite: false,
  });
  return new Points(geometria, material);
}

function terra(): Mesh {
  const material = new ShaderMaterial({
    uniforms: { uSol: { value: DIRECAO_SOL.clone() } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vVista;
      void main() {
        vec4 mundo = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vVista = normalize(cameraPosition - mundo.xyz);
        gl_Position = projectionMatrix * viewMatrix * mundo;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSol;
      varying vec3 vNormal;
      varying vec3 vVista;
      void main() {
        vec3 n = normalize(vNormal);
        float luz = dot(n, uSol);
        float dia = smoothstep(-0.02, 0.35, luz);
        float borda = pow(1.0 - max(dot(n, normalize(vVista)), 0.0), 3.0);
        vec3 noite = vec3(0.003, 0.005, 0.011);
        vec3 oceano = vec3(0.05, 0.13, 0.30);
        vec3 cor = mix(noite, oceano, dia);
        cor += vec3(0.30, 0.55, 1.0) * borda * (0.12 + 0.88 * smoothstep(-0.25, 0.25, luz));
        gl_FragColor = vec4(cor, 1.0);
      }
    `,
  });
  const malha = new Mesh(new SphereGeometry(170, 64, 32), material);
  malha.position.copy(DIRECAO_TERRA).multiplyScalar(DISTANCIA_CEU * 0.9);
  return malha;
}

export function criarCeu(): Group {
  const ceu = new Group();
  ceu.name = 'ceu';
  ceu.add(estrelas(), terra());
  return ceu;
}
