/**
 * Céu lunar (§14.4, ART-08, ART-11): estrelas e a Terra escura, sem luzes de cidades.
 * A Terra fica perto do Sol no céu, então quase toda a face visível está na noite:
 * só um crescente fino e o halo azul da atmosfera.
 *
 * ART-11 (D-93, Sol fixo e distante): Sol, Terra e os demais corpos celestes do cenário têm uma
 * direção fixa no mundo, definida uma vez (no referencial leste/cima/sul do polo norte) e nunca
 * recalculada; só a posição deles no céu (perto do ponto focal, por serem "infinitamente"
 * distantes) e a orientação da cúpula (`uCima`) acompanham a câmera.
 */
import {
  AdditiveBlending,
  BackSide,
  CylinderGeometry,
  DoubleSide,
  Quaternion,
  BufferAttribute,
  CanvasTexture,
  Color,
  BufferGeometry,
  Group,
  Mesh,
  Points,
  PointsMaterial,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { norteEm, type Vec3 } from '../sim/map/esfera';
import { type Ambientacao, ambientacaoDe } from './ambientacao';

/** GLSL-like smoothstep, para o fator dia/noite calculado no lado JS (D-95). */
function smoothstep(borda0: number, borda1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - borda0) / (borda1 - borda0)));
  return t * t * (3 - 2 * t);
}

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

/**
 * D-93: ponto fixo (equador) só para fixar Sol/Terra/Saturno etc. no mundo uma única vez — o
 * referencial leste/cima/sul é definido aqui e nunca mais recalculado, então esses corpos não
 * se movem quando a câmera percorre ou gira ao redor do planeta (ao contrário do ponto focal,
 * que segue a câmera e por isso serve à cúpula do céu e à posição de tela desses corpos).
 */
const FOCO_FIXO: Vec3 = [1, 0, 0];
const NORTE_FIXO = norteEm(FOCO_FIXO);

/** Direção (mundo), fixa para a partida inteira, de uma direção local (D-93). */
function direcaoFixaNoMundo(local: Vector3): Vector3 {
  return paraOMundo(local, FOCO_FIXO, NORTE_FIXO);
}

const DISTANCIA_CEU = 4000;

export function estrelas(): Points<BufferGeometry, PointsMaterial> {
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

/**
 * D-94: uniformes e trecho de fragment shader comuns a todo corpo celeste fixo — a névoa de uma
 * atmosfera (só nos cenários com cúpula, ART-11) deixa o corpo um pouco menos nítido visto de
 * dentro dela do que na visão do espaço (CTL-16), que fica sempre nítida.
 */
function uniformesDeNevoa(): Record<string, { value: number | Color }> {
  return { uNevoa: { value: 0 }, uCorNevoa: { value: new Color(0, 0, 0) } };
}
const GLSL_NEVOA_ATMOSFERICA = `
  uniform float uNevoa;
  uniform vec3 uCorNevoa;
  vec3 comNevoa(vec3 cor) {
    float cinza = dot(cor, vec3(0.299, 0.587, 0.114));
    cor = mix(cor, vec3(cinza), uNevoa * 0.35);
    return mix(cor, uCorNevoa, uNevoa * 0.4);
  }
`;

/**
 * A Terra depois do Silêncio: oceano com continentes e nuvens (D-93), sem luzes de cidades
 * (FLX-02 também a usa). Continentes e nuvens são procedurais (ondas sobre longitude/latitude
 * da normal), no estilo das cadeias de montanha do panorama (§14.5) — sem textura externa.
 */
export function terra(raio = 170): Mesh<SphereGeometry, ShaderMaterial> {
  const material = new ShaderMaterial({
    uniforms: { uSol: { value: DIRECAO_SOL.clone() }, ...uniformesDeNevoa() },
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
      ${GLSL_NEVOA_ATMOSFERICA}
      void main() {
        vec3 n = normalize(vNormal);
        float luz = dot(n, uSol);
        float dia = smoothstep(-0.02, 0.35, luz);
        float borda = pow(1.0 - max(dot(n, normalize(vVista)), 0.0), 3.0);
        vec3 noite = vec3(0.003, 0.005, 0.011);
        vec3 oceano = vec3(0.05, 0.13, 0.30);
        float lon = atan(n.z, n.x);
        float lat = n.y;
        float mancha = 0.5 + 0.3 * sin(lon * 2.0 + lat * 3.0) + 0.2 * sin(lon * 5.0 - lat * 2.0)
          + 0.1 * sin(lon * 11.0 + lat * 7.0);
        float continente = smoothstep(0.55, 0.66, mancha);
        vec3 solo = mix(vec3(0.22, 0.33, 0.15), vec3(0.45, 0.36, 0.22), sin(lon * 7.0 + lat * 4.0) * 0.5 + 0.5);
        vec3 diurno = mix(oceano, solo, continente);
        float nuvem = smoothstep(0.58, 0.7, 0.5 + 0.3 * sin(lon * 5.0 - lat * 6.0 + 2.0)
          + 0.2 * sin(lon * 9.0 + lat * 2.0));
        diurno = mix(diurno, vec3(0.92, 0.94, 0.97), nuvem * 0.7);
        vec3 cor = mix(noite, diurno, dia);
        cor += vec3(0.30, 0.55, 1.0) * borda * (0.12 + 0.88 * smoothstep(-0.25, 0.25, luz));
        gl_FragColor = vec4(comNevoa(cor), 1.0);
      }
    `,
  });
  const malha = new Mesh(new SphereGeometry(raio, 64, 32), material);
  malha.position.copy(DIRECAO_TERRA).multiplyScalar(DISTANCIA_CEU * 0.9);
  return malha;
}

/**
 * §14.4/D-94: o Sol, visível como um disco distante e brilhante (não só uma direção de luz),
 * igual em todos os cenários — inclusive sem cúpula (Lua) e na visão do espaço (CTL-16), onde
 * antes sumia junto com o céu. `toneMapped: false` deixa a cor estourar para o bloom (ART-08).
 */
function sol(): Mesh<SphereGeometry, ShaderMaterial> {
  // Sem chunk de tone mapping (shader cru): o valor alto (>1) chega intacto ao bloom (ART-08),
  // que acontece antes do tone mapping final do composer.
  const material = new ShaderMaterial({
    uniforms: uniformesDeNevoa(),
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${GLSL_NEVOA_ATMOSFERICA}
      void main() {
        gl_FragColor = vec4(comNevoa(vec3(4.5, 4.2, 3.8)), 1.0);
      }
    `,
  });
  return new Mesh(new SphereGeometry(150, 16, 10), material);
}

/** §14.6/§14.7/D-94: bolinha de luz simples para uma lua distante, sem detalhe de relevo. */
function luaDistante(raio: number, cor: Color): Mesh<SphereGeometry, ShaderMaterial> {
  const material = new ShaderMaterial({
    uniforms: { uSol: { value: DIRECAO_SOL.clone() }, uCor: { value: cor }, ...uniformesDeNevoa() },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSol;
      uniform vec3 uCor;
      varying vec3 vNormal;
      ${GLSL_NEVOA_ATMOSFERICA}
      void main() {
        float luz = max(dot(normalize(vNormal), uSol), 0.0);
        gl_FragColor = vec4(comNevoa(uCor * (0.08 + 0.92 * luz)), 1.0);
      }
    `,
  });
  return new Mesh(new SphereGeometry(raio, 16, 10), material);
}

/** §14.9/D-103: textura simples da pedra do cinturão (silhueta irregular), feita só uma vez. */
let texturaRocha: CanvasTexture | null = null;
function textoDaRocha(): CanvasTexture {
  if (texturaRocha) return texturaRocha;
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 48;
  const g = c.getContext('2d')!;
  const cx = 24;
  const cy = 24;
  g.beginPath();
  const pontas = 10;
  for (let k = 0; k <= pontas; k++) {
    const a = (k / pontas) * Math.PI * 2;
    const r = 16 + 6 * Math.sin(a * 3.1 + 1.3) + 4 * Math.sin(a * 5.7);
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (k === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  const sombra = g.createRadialGradient(cx - 7, cy - 7, 2, cx, cy, 22);
  sombra.addColorStop(0, 'rgba(232,226,216,1)');
  sombra.addColorStop(0.6, 'rgba(164,152,138,1)');
  sombra.addColorStop(1, 'rgba(82,76,68,1)');
  g.fillStyle = sombra;
  g.fill();
  texturaRocha = new CanvasTexture(c);
  return texturaRocha;
}

/** §14.9/D-103: textura simples de um brilho distante (a "fogzinha" do cinturão). */
let texturaBrilho: CanvasTexture | null = null;
function textoDoBrilho(): CanvasTexture {
  if (texturaBrilho) return texturaBrilho;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d')!;
  const brilho = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  brilho.addColorStop(0, 'rgba(255,255,255,1)');
  brilho.addColorStop(0.3, 'rgba(255,248,230,0.9)');
  brilho.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = brilho;
  g.fillRect(0, 0, 32, 32);
  texturaBrilho = new CanvasTexture(c);
  return texturaBrilho;
}

/**
 * §14.9/D-103: pedra do cinturão — um sprite simples (sempre de frente pra câmera, sem
 * iluminação nem geometria 3D), bem mais barato que uma esfera com shader próprio.
 */
function rocha(raio: number, cor: Color): Sprite {
  const material = new SpriteMaterial({
    map: textoDaRocha(),
    color: cor,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const sprite = new Sprite(material);
  sprite.scale.set(raio * 2, raio * 2, 1);
  sprite.frustumCulled = false;
  return sprite;
}

/** §14.9/D-103: a "fogzinha" do cinturão — um ponto brilhante distante, aditivo. */
function brilhoDistante(raio: number, cor: Color): Sprite {
  const material = new SpriteMaterial({
    map: textoDoBrilho(),
    color: cor,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: AdditiveBlending,
  });
  const sprite = new Sprite(material);
  sprite.scale.set(raio, raio, 1);
  sprite.frustumCulled = false;
  return sprite;
}

/**
 * §14.7/D-93: Saturno visto de Titã — disco grande com faixas (como um gigante gasoso) e anéis
 * inclinados; licença de ambientação (a neblina real de Titã o esconderia, D-94 o deixa menos
 * nítido de dentro da atmosfera, mas não invisível).
 */
function saturno(direcaoFixaMundo: Vector3): Group {
  const grupo = new Group();
  const raio = 260;
  const corpo = new ShaderMaterial({
    uniforms: { uSol: { value: DIRECAO_SOL.clone() }, ...uniformesDeNevoa() },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSol;
      varying vec3 vNormal;
      ${GLSL_NEVOA_ATMOSFERICA}
      void main() {
        vec3 n = normalize(vNormal);
        float luz = dot(n, uSol);
        float dia = smoothstep(-0.05, 0.4, luz);
        float faixa = sin(n.y * 26.0) * 0.5 + 0.5;
        vec3 clara = vec3(0.92, 0.85, 0.68);
        vec3 escura = vec3(0.78, 0.66, 0.48);
        vec3 diurno = mix(escura, clara, faixa);
        vec3 noite = diurno * 0.05;
        gl_FragColor = vec4(comNevoa(mix(noite, diurno, dia)), 1.0);
      }
    `,
  });
  const esfera = new Mesh(new SphereGeometry(raio, 48, 24), corpo);
  grupo.add(esfera);
  const anel = new Mesh(
    new RingGeometry(raio * 1.35, raio * 2.3, 64, 1),
    new ShaderMaterial({
      uniforms: { uSol: { value: DIRECAO_SOL.clone() }, ...uniformesDeNevoa() },
      vertexShader: /* glsl */ `
        varying vec2 vLocal;
        varying vec3 vNormal;
        void main() {
          vLocal = position.xy;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSol;
        varying vec2 vLocal;
        varying vec3 vNormal;
        ${GLSL_NEVOA_ATMOSFERICA}
        void main() {
          float r = length(vLocal) / ${raio.toFixed(1)};
          float faixas = sin(r * 40.0) * 0.5 + 0.5;
          float vazio = smoothstep(1.55, 1.62, r) * (1.0 - smoothstep(1.66, 1.73, r));
          vec3 cor = mix(vec3(0.55, 0.48, 0.38), vec3(0.82, 0.76, 0.62), faixas);
          float luz = max(dot(normalize(vNormal), uSol), 0.0);
          float alfa = (0.75 - vazio * 0.6) * (0.35 + 0.65 * luz);
          gl_FragColor = vec4(comNevoa(cor), alfa);
        }
      `,
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
    }),
  );
  anel.rotation.x = Math.PI / 2 - 0.45;
  grupo.add(anel);
  grupo.position.copy(direcaoFixaMundo).multiplyScalar(DISTANCIA_CEU * 0.85);
  grupo.lookAt(0, 0, 0);
  return grupo;
}

export interface Ceu {
  objeto: Group;
  /** CEN-03: força da tempestade de poeira (0 a 1) no céu. */
  clima(forca: number): void;
  /** CTL-16 (D-83): 0 no chão, 1 no fim do zoom: o céu dá lugar ao espaço estrelado. */
  espaco(t: number): void;
  /** Direção (mundo) para o Sol — fixa pela partida inteira (D-93). */
  sol: Vector3;
  /** Direção (mundo) para a Terra — fixa pela partida inteira (D-93). */
  terra: Vector3;
  /**
   * ART-11 (D-93): reaproxima os corpos celestes fixos (Sol, Terra, Saturno...) do ponto focal
   * (por serem "infinitamente" distantes, só a posição de tela muda) e orienta a cúpula do céu
   * pelo "para cima" local dele. `olho` (a posição da câmera) assenta o fundo da Terra na borda
   * do planeta vista dali (§14.5).
   */
  atualizar(foco: Vec3, pontoFocal: Vector3, olho?: Vector3): void;
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
  noite: Ambientacao['noite'],
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
        uEspaco: { value: 0 },
        // D-95: céu noturno do lado sem Sol direto (só em cenários com atmosfera/cúpula).
        uTemNoite: { value: noite ? 1 : 0 },
        uCeuNoite: { value: noite?.ceu.clone() ?? new Color(0, 0, 0) },
        uHorizonteNoite: { value: noite?.horizonte.clone() ?? new Color(0, 0, 0) },
        uDia: { value: 1 },
      },
      vertexShader: `varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `uniform vec3 uCeu; uniform vec3 uHorizonte; uniform vec3 uCima;
        uniform vec3 uSol; uniform float uTemSol; uniform vec3 uCorSol; uniform vec3 uHalo;
        uniform vec3 uPoeira; uniform float uForca; uniform float uEspaco; varying vec3 vDir;
        uniform float uTemNoite; uniform vec3 uCeuNoite; uniform vec3 uHorizonteNoite;
        uniform float uDia;
        void main() {
          vec3 dir = normalize(vDir);
          float h = clamp(dot(dir, uCima), 0.0, 1.0);
          vec3 cor = mix(uHorizonte, uCeu, pow(h, 0.45));
          if (uTemNoite > 0.5) {
            // D-95: o lado do planeta sem Sol direto vê um céu noturno, não o mesmo céu de dia.
            vec3 corNoite = mix(uHorizonteNoite, uCeuNoite, pow(h, 0.45));
            cor = mix(corNoite, cor, uDia);
          }
          if (uTemSol > 0.5) {
            float c = max(dot(dir, normalize(uSol)), 0.0);
            // Halo azulado largo e o disco pequeno e claro; somem de noite (uDia).
            cor = mix(cor, uHalo, pow(c, 40.0) * 0.75 * (1.0 - uForca) * uDia);
            cor = mix(cor, uCorSol, smoothstep(0.9993, 0.9997, c) * (1.0 - 0.8 * uForca) * uDia);
          }
          cor = mix(cor, uPoeira, uForca * 0.75);
          // CTL-16 (D-83): na visão planetária o céu some e fica o espaço.
          gl_FragColor = vec4(cor, 1.0 - uEspaco);
        }`,
      side: BackSide,
      depthWrite: false,
      transparent: true,
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
  const corpoDoSol = sol();
  const astro = ambientacao.terraNoCeu ? terra() : null;
  const dirSaturnoFixa = ambientacao.direcaoSaturno
    ? direcaoFixaNoMundo(ambientacao.direcaoSaturno)
    : null;
  const corpoDeSaturno = dirSaturnoFixa ? saturno(dirSaturnoFixa) : null;
  const luas = ambientacao.luasNoCeu.map((l) => ({
    malha:
      l.tipo === 'rocha'
        ? rocha(l.raio, l.cor)
        : l.tipo === 'brilho'
          ? brilhoDistante(l.raio, l.cor)
          : luaDistante(l.raio, l.cor),
    direcaoFixa: direcaoFixaNoMundo(l.direcao),
    // D-101: o cinturão de asteroides de Ceres fica bem mais perto que o céu fixo de sempre.
    distancia: l.distancia ?? 0.92,
    // D-103: pedra/brilho são sprites simples, sem uniforms de sol/neblina (sem iluminação própria).
    sprite: l.tipo !== undefined,
  }));
  // D-94: dentro de uma atmosfera (cúpula), os corpos do céu ficam um pouco menos nítidos que
  // na visão do espaço (CTL-16); sem cúpula (Lua), sempre nítidos — não há neblina no vácuo.
  const nevoaAtiva = ambientacao.ceu !== null && ambientacao.horizonte !== null;
  const corNevoa = ambientacao.horizonte ?? new Color(0, 0, 0);
  const materiaisComNevoa: ShaderMaterial[] = [
    corpoDoSol.material,
    ...(astro ? [astro.material] : []),
    ...(corpoDeSaturno
      ? (corpoDeSaturno.children as Mesh<never, ShaderMaterial>[]).map((p) => p.material)
      : []),
    ...luas
      .filter((l): l is typeof l & { malha: Mesh<SphereGeometry, ShaderMaterial> } => !l.sprite)
      .map((l) => l.malha.material),
  ];
  for (const m of materiaisComNevoa) (m.uniforms.uCorNevoa!.value as Color).copy(corNevoa);
  // Com céu (atmosfera), as estrelas só aparecem ao afastar (CTL-16).
  const pontos = ambientacao.estrelas || ambientacao.ceu ? estrelas() : null;
  if (pontos) {
    if (!ambientacao.estrelas) {
      pontos.material.transparent = true;
      pontos.material.opacity = 0;
      pontos.visible = false;
    }
    objeto.add(pontos);
  }
  objeto.add(corpoDoSol);
  if (astro) objeto.add(astro);
  if (corpoDeSaturno) objeto.add(corpoDeSaturno);
  for (const lua of luas) objeto.add(lua.malha);
  const domo =
    ambientacao.ceu && ambientacao.horizonte
      ? cupula(
          ambientacao.ceu,
          ambientacao.horizonte,
          ambientacao.solNoCeu,
          ambientacao.tempestade?.cor ?? null,
          ambientacao.noite,
        )
      : null;
  if (domo) objeto.add(domo);
  const fundo =
    ambientacao.panorama && ambientacao.horizonte ? panorama(ambientacao.horizonte) : null;
  if (fundo) objeto.add(fundo);
  const girar = new Quaternion();
  const acima = new Vector3(0, 1, 0);
  const cimaLocal = new Vector3();
  const focoVec = new Vector3();
  let tAtual = 0;
  let diaAtual = 1;
  /**
   * D-95: as estrelas aparecem ao afastar (CTL-16, `t`) e, nos cenários cuja noite as mostra
   * (Marte), também do lado sem Sol direto (`diaAtual` baixo) — o que for maior vale. `espaco`
   * roda depois de `atualizar` a cada quadro (partida.ts), então é aqui que os dois se somam.
   */
  const atualizarEstrelas = (): void => {
    if (!pontos || ambientacao.estrelas) return;
    const visivel = Math.max(tAtual, ambientacao.noite?.estrelas ? 1 - diaAtual : 0);
    pontos.visible = visivel > 0.01;
    pontos.material.opacity = visivel;
  };
  // D-93: Sol, Terra e Saturno ficam numa única direção do mundo pela partida inteira (ART-11).
  const ceu: Ceu = {
    objeto,
    sol: direcaoFixaNoMundo(ambientacao.sol),
    terra: direcaoFixaNoMundo(DIRECAO_TERRA),
    clima(forca) {
      if (domo) domo.material.uniforms.uForca!.value = forca;
    },
    espaco(t) {
      tAtual = t;
      if (domo) domo.material.uniforms.uEspaco!.value = t;
      if (fundo) fundo.visible = t < 0.99;
      atualizarEstrelas();
      const nevoa = nevoaAtiva ? 1 - t : 0;
      for (const m of materiaisComNevoa) m.uniforms.uNevoa!.value = nevoa;
    },
    atualizar(foco, pontoFocal, olho) {
      // D-95: o lado do planeta sem Sol direto (dia < 0) vê o céu noturno do cenário.
      diaAtual = domo ? smoothstep(-0.15, 0.08, focoVec.set(...foco).dot(ceu.sol)) : 1;
      if (domo) domo.material.uniforms.uDia!.value = diaAtual;
      atualizarEstrelas();
      corpoDoSol.position.copy(pontoFocal).addScaledVector(ceu.sol, DISTANCIA_CEU * 0.8);
      if (astro) {
        astro.position.copy(pontoFocal).addScaledVector(ceu.terra, DISTANCIA_CEU * 0.9);
        astro.material.uniforms.uSol!.value.copy(ceu.sol);
      }
      if (corpoDeSaturno && dirSaturnoFixa) {
        corpoDeSaturno.position
          .copy(pontoFocal)
          .addScaledVector(dirSaturnoFixa, DISTANCIA_CEU * 0.85);
        corpoDeSaturno.lookAt(pontoFocal);
        for (const parte of corpoDeSaturno.children as Mesh<never, ShaderMaterial>[]) {
          parte.material.uniforms.uSol!.value.copy(ceu.sol);
        }
      }
      for (const lua of luas) {
        lua.malha.position
          .copy(pontoFocal)
          .addScaledVector(lua.direcaoFixa, DISTANCIA_CEU * lua.distancia);
        // D-103: pedra/brilho (sprite) não têm iluminação própria, então não levam uSol.
        if (!lua.sprite)
          (lua.malha as Mesh<SphereGeometry, ShaderMaterial>).material.uniforms.uSol!.value.copy(
            ceu.sol,
          );
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
