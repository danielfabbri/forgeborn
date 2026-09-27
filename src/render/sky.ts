/**
 * Céu lunar (§14.4, ART-08, ART-11): estrelas e a Terra escura, sem luzes de cidades.
 * A Terra fica perto do Sol no céu, então quase toda a face visível está na noite:
 * só um crescente fino e o halo azul da atmosfera.
 *
 * ART-11 (sem noite): Sol e Terra são definidos no referencial local do ponto focal (norte,
 * leste e vertical), então acompanham a câmera ao redor do planeta.
 */
import {
  BackSide,
  CylinderGeometry,
  Quaternion,
  BufferAttribute,
  Color,
  BufferGeometry,
  Group,
  Mesh,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Vec3 } from '../sim/map/esfera';
import { type Ambientacao, ambientacaoDe } from './ambientacao';

function direcao(elevacaoGraus: number, azimuteGraus: number): Vector3 {
  const el = (elevacaoGraus * Math.PI) / 180;
  const az = (azimuteGraus * Math.PI) / 180;
  return new Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
}

/**
 * Direções no referencial local (x = leste, y = cima, z = sul), como no mapa plano:
 * Sol baixo no horizonte (luz rasante, sombras longas) e a Terra perto dele (fase escura).
 */
export const DIRECAO_SOL = direcao(24, -35);
export const DIRECAO_TERRA = direcao(13, 12);

/** Leva uma direção do referencial local do foco (leste, cima, sul) para o mundo. */
export function paraOMundo(local: Vector3, foco: Vec3, norte: Vec3): Vector3 {
  const cima = new Vector3(...foco);
  const n = new Vector3(...norte);
  const leste = n.clone().cross(cima).normalize();
  return leste
    .multiplyScalar(local.x)
    .addScaledVector(cima, local.y)
    .addScaledVector(n, -local.z)
    .normalize();
}

const DISTANCIA_CEU = 4000;

export function estrelas(): Points {
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

/** A Terra depois do Silêncio: oceano sem luzes de cidades (FLX-02 também a usa). */
export function terra(raio = 170): Mesh<SphereGeometry, ShaderMaterial> {
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
  const malha = new Mesh(new SphereGeometry(raio, 64, 32), material);
  malha.position.copy(DIRECAO_TERRA).multiplyScalar(DISTANCIA_CEU * 0.9);
  return malha;
}

export interface Ceu {
  objeto: Group;
  /** CEN-03: força da tempestade de poeira (0 a 1) no céu. */
  clima(forca: number): void;
  /** Direção (mundo) para o Sol no ponto focal atual. */
  sol: Vector3;
  /** Direção (mundo) para a Terra no ponto focal atual. */
  terra: Vector3;
  /**
   * ART-11: reposiciona Sol e Terra para o ponto focal (direção) e o norte dele. `olho` (a
   * posição da câmera) assenta o fundo da Terra na borda do planeta vista dali (§14.5).
   */
  atualizar(foco: Vec3, norte: Vec3, pontoFocal: Vector3, olho?: Vector3): void;
}

/**
 * §14.5/§14.6: cúpula de céu diurno, do horizonte claro ao alto (segue o ponto focal); com
 * `sol`, o disco do Sol e o halo em volta. `uPoeira`/`uForca`: a tempestade (CEN-03) fecha o céu.
 */
function cupula(
  ceu: Color,
  horizonte: Color,
  sol: Ambientacao['solNoCeu'],
  poeira: Color | null,
): Mesh<SphereGeometry, ShaderMaterial> {
  return new Mesh(
    new SphereGeometry(DISTANCIA_CEU * 0.95, 32, 16),
    new ShaderMaterial({
      uniforms: {
        uCeu: { value: ceu },
        uHorizonte: { value: horizonte },
        uCima: { value: new Vector3(0, 1, 0) },
        uSol: { value: new Vector3(0, 1, 0) },
        uTemSol: { value: sol ? 1 : 0 },
        uCorSol: { value: sol?.cor.clone() ?? new Color(1, 1, 1) },
        uHalo: { value: sol?.halo.clone() ?? new Color(1, 1, 1) },
        uPoeira: { value: poeira?.clone() ?? new Color(0, 0, 0) },
        uForca: { value: 0 },
      },
      vertexShader: `varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `uniform vec3 uCeu; uniform vec3 uHorizonte; uniform vec3 uCima;
        uniform vec3 uSol; uniform float uTemSol; uniform vec3 uCorSol; uniform vec3 uHalo;
        uniform vec3 uPoeira; uniform float uForca; varying vec3 vDir;
        void main() {
          vec3 dir = normalize(vDir);
          float h = clamp(dot(dir, uCima), 0.0, 1.0);
          vec3 cor = mix(uHorizonte, uCeu, pow(h, 0.45));
          if (uTemSol > 0.5) {
            float c = max(dot(dir, normalize(uSol)), 0.0);
            // Halo azulado largo e o disco pequeno e claro.
            cor = mix(cor, uHalo, pow(c, 40.0) * 0.75 * (1.0 - uForca));
            cor = mix(cor, uCorSol, smoothstep(0.9993, 0.9997, c) * (1.0 - 0.8 * uForca));
          }
          cor = mix(cor, uPoeira, uForca * 0.75);
          gl_FragColor = vec4(cor, 1.0);
        }`,
      side: BackSide,
      depthWrite: false,
    }),
  );
}

/**
 * §14.5: fundo da Terra: campos verdes em retalhos até o horizonte e duas cadeias de montanhas
 * (a distante azulada, com neve; a próxima verde). Cilindro em volta do ponto focal, atrás do
 * terreno (que o cobre onde existe), então o chão parece seguir além da borda do planeta.
 */
const RAIO_PANORAMA = 2500;
/** Faixa (rad) de campos visível entre a borda do planeta e os morros. */
const FAIXA_DE_CAMPOS = 0.06;
function panorama(horizonte: Color): Mesh<CylinderGeometry, ShaderMaterial> {
  const baixo = Math.tan((50 * Math.PI) / 180) * RAIO_PANORAMA;
  const alto = Math.tan((14 * Math.PI) / 180) * RAIO_PANORAMA;
  const geo = new CylinderGeometry(RAIO_PANORAMA, RAIO_PANORAMA, alto + baixo, 256, 1, true);
  geo.translate(0, (alto - baixo) / 2, 0);
  const malha = new Mesh(
    geo,
    new ShaderMaterial({
      uniforms: { uHorizonte: { value: horizonte }, uBaixar: { value: 0 } },
      vertexShader: `varying vec3 vLocal;
        void main() {
          vLocal = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `uniform vec3 uHorizonte; uniform float uBaixar; varying vec3 vLocal;
        float cadeia(float az, float s) {
          return 0.5 + 0.28 * sin(az * 3.0 + s) + 0.14 * sin(az * 7.0 + s * 2.3)
            + 0.07 * sin(az * 17.0 + s * 5.1) + 0.035 * sin(az * 41.0 + s * 1.7);
        }
        void main() {
          float el = atan(vLocal.y, length(vLocal.xz)) + uBaixar;
          float az = atan(vLocal.z, vLocal.x);
          float longe = 0.03 + 0.085 * cadeia(az, 1.3);
          float perto = 0.012 + 0.04 * cadeia(az, 4.1);
          vec3 cor;
          if (el > longe) discard;
          if (el > perto) {
            // Montanhas distantes, azuladas pela distância, com neve no alto.
            float t = (el - perto) / max(longe - perto, 0.001);
            cor = mix(vec3(0.30, 0.38, 0.47), vec3(0.42, 0.50, 0.60), t);
            float neve = smoothstep(longe - 0.018, longe - 0.004, el) * step(0.075, longe);
            cor = mix(cor, vec3(0.92, 0.94, 0.97), neve);
            cor = mix(cor, uHorizonte, 0.35);
          } else if (el > 0.0) {
            // Morros próximos, verdes escuros.
            cor = mix(vec3(0.16, 0.27, 0.12), vec3(0.24, 0.36, 0.18), el / max(perto, 0.001));
            cor = mix(cor, uHorizonte, 0.25);
          } else {
            // Campos até o horizonte: variação suave de tons, mais enevoada perto do horizonte.
            float v = 0.5 + 0.25 * sin(az * 23.0 + el * 61.0) * sin(az * 9.0 - el * 37.0)
              + 0.15 * sin(az * 57.0 + el * 13.0);
            cor = mix(vec3(0.30, 0.44, 0.22), vec3(0.40, 0.52, 0.27), v);
            cor = mix(cor, uHorizonte, smoothstep(-0.3, 0.0, el) * 0.6);
          }
          gl_FragColor = vec4(cor, 1.0);
        }`,
      side: BackSide,
      depthWrite: false,
    }),
  );
  malha.renderOrder = -1;
  malha.frustumCulled = false;
  return malha;
}

export function criarCeu(ambientacao: Ambientacao = ambientacaoDe('lua')): Ceu {
  const objeto = new Group();
  objeto.name = 'ceu';
  const astro = ambientacao.terraNoCeu ? terra() : null;
  if (ambientacao.estrelas) objeto.add(estrelas());
  if (astro) objeto.add(astro);
  const domo =
    ambientacao.ceu && ambientacao.horizonte
      ? cupula(
          ambientacao.ceu,
          ambientacao.horizonte,
          ambientacao.solNoCeu,
          ambientacao.tempestade?.cor ?? null,
        )
      : null;
  if (domo) objeto.add(domo);
  const fundo =
    ambientacao.panorama && ambientacao.horizonte ? panorama(ambientacao.horizonte) : null;
  if (fundo) objeto.add(fundo);
  const girar = new Quaternion();
  const acima = new Vector3(0, 1, 0);
  const cimaLocal = new Vector3();
  const ceu: Ceu = {
    objeto,
    sol: ambientacao.sol.clone(),
    terra: DIRECAO_TERRA.clone(),
    clima(forca) {
      if (domo) domo.material.uniforms.uForca!.value = forca;
    },
    atualizar(foco, norte, pontoFocal, olho) {
      ceu.sol.copy(paraOMundo(ambientacao.sol, foco, norte));
      ceu.terra.copy(paraOMundo(DIRECAO_TERRA, foco, norte));
      if (astro) {
        astro.position.copy(pontoFocal).addScaledVector(ceu.terra, DISTANCIA_CEU * 0.9);
        astro.material.uniforms.uSol!.value.copy(ceu.sol);
      }
      if (domo) {
        domo.position.copy(pontoFocal);
        domo.material.uniforms.uCima!.value.set(...foco);
        domo.material.uniforms.uSol!.value.copy(ceu.sol);
        domo.renderOrder = -2;
        domo.frustumCulled = false;
      }
      if (fundo) {
        // O fundo fica em volta do olho, com o horizonte dele logo acima da borda do planeta
        // (o planeta pequeno se curva antes): os campos e as montanhas continuam o chão.
        const centro = olho ?? pontoFocal;
        cimaLocal.copy(centro).normalize();
        fundo.quaternion.copy(girar.setFromUnitVectors(acima, cimaLocal));
        fundo.position.copy(centro);
        const razao = Math.min(1, pontoFocal.length() / Math.max(centro.length(), 1e-6));
        fundo.material.uniforms.uBaixar!.value = olho ? Math.acos(razao) - FAIXA_DE_CAMPOS : 0;
      }
    },
  };
  return ceu;
}
