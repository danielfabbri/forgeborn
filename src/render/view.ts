/**
 * Cena da partida: renderer, câmera, luzes, sombras em cascata do sol e pós-processamento
 * (ART-08, TEC-19): tone mapping ACES, bloom, SSAO a partir do preset Alto e grão de filme sutil.
 */
import type { Ambientacao } from './ambientacao';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DepthTexture,
  DirectionalLight,
  HalfFloatType,
  type Material,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { DIRECAO_SOL, DIRECAO_TERRA } from './sky';

/** FOV vertical da câmera RTS (graus). */
export const FOV_RTS = 50;

/**
 * Apresentação (ART-08): cascatas de sombra, até onde elas vão (m), intensidade do sol e do
 * bloom (só o que brilha, emissivos e feixes) e a força do grão.
 */
const CASCATAS = 2;
const ALCANCE_SOMBRA_M = 260;
const INTENSIDADE_SOL = 3.4;
const BLOOM = { forca: 0.55, raio: 0.35, limiar: 0.82 };
const GRAO = 0.035;

/** TEC-19: o que cada preset liga, além de resolução e sombras. */
export interface Graficos {
  escala: number;
  sombra: number;
  /** SSAO (GTAO) a partir do preset Alto (ART-08). */
  ssao?: boolean;
}

export interface View {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  /**
   * ART-11: aponta o Sol (e as cascatas de sombra) e a luz da Terra pelas direções (mundo) do
   * céu local do ponto focal.
   */
  focarSombras(alvo: Vector3, sol: Vector3, terra: Vector3): void;
  /** §18.2: fundo, luz ambiente, luz secundária e intensidade do Sol do cenário. */
  ambientar(a: Ambientacao): void;
  /** TEC-19: escala de resolução, sombras e SSAO do preset gráfico; vale na hora. */
  aplicarGraficos(escala: number, sombra: number, ssao?: boolean): void;
  render(): void;
  dispose(): void;
}

/**
 * SSAO (GTAO) com as normais reconstruídas da profundidade do passe principal: sem o passe
 * extra de normais, que redesenharia a cena inteira.
 */
class GTAOComProfundidade extends GTAOPass {
  constructor(scene: Scene, camera: PerspectiveCamera, largura: number, altura: number) {
    super(scene, camera, largura, altura);
    this.setGBuffer(new DepthTexture(1, 1));
  }

  override render(
    renderer: WebGLRenderer,
    escrita: WebGLRenderTarget,
    leitura: WebGLRenderTarget,
    dt: number,
    mascara: boolean,
  ): void {
    // O composer alterna os alvos: a profundidade é a do alvo que o passe principal acabou de pintar.
    const profundidade = leitura.depthTexture;
    this.gtaoMaterial.uniforms.tDepth!.value = profundidade;
    this.pdMaterial.uniforms.tDepth!.value = profundidade;
    super.render(renderer, escrita, leitura, dt, mascara);
  }
}

/** Grão de filme sutil, animado (ART-08), sobre a imagem final. */
const ShaderDeGrao = {
  uniforms: { tDiffuse: { value: null }, uTempo: { value: 0 }, uForca: { value: GRAO } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTempo;
    uniform float uForca;
    varying vec2 vUv;
    float ruido(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 cor = texture2D(tDiffuse, vUv);
      float n = ruido(vUv * 1000.0 + uTempo) - 0.5;
      gl_FragColor = vec4(cor.rgb + n * uForca, cor.a);
    }
  `,
};

export function createView(
  container: HTMLElement,
  graficos: Graficos = { escala: 1.5, sombra: 2048 },
): View {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, graficos.escala));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = graficos.sombra > 0;
  renderer.shadowMap.type = PCFShadowMap;
  // As chamadas de desenho somam todos os passes do quadro (a medida de TEC-16).
  renderer.info.autoReset = false;
  container.appendChild(renderer.domElement);
  // Se o navegador derrubar o contexto (driver, falta de memória), pede que ele volte:
  // sem o preventDefault o canvas fica preto ou branco para sempre.
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.warn('WebGL: contexto perdido; aguardando restauração.');
  });

  const scene = new Scene();
  scene.background = new Color(0x000000);

  // Sem atmosfera: sombras quase pretas, com um leve preenchimento azulado da luz da Terra.
  const ambiente = new AmbientLight(0x8899aa, 0.12);
  scene.add(ambiente);
  const luzDaTerra = new DirectionalLight(0x7090ff, 0.35);
  scene.add(luzDaTerra, luzDaTerra.target);

  const camera = new PerspectiveCamera(FOV_RTS, 1, 0.5, 6000);
  camera.position.set(0, 160, 170);
  camera.lookAt(0, 0, 0);

  // ART-08: sombras em cascata do sol, que seguem a câmera.
  const csm = new CSM({
    camera,
    parent: scene,
    cascades: CASCATAS,
    maxFar: ALCANCE_SOMBRA_M,
    mode: 'practical',
    shadowMapSize: Math.max(graficos.sombra, 256),
    shadowBias: -0.0004,
    lightIntensity: INTENSIDADE_SOL,
    lightDirection: DIRECAO_SOL.clone().negate(),
    lightMargin: 120,
  });
  for (const luz of csm.lights) {
    luz.color.set(0xfff8f0);
    luz.shadow.normalBias = 0.6;
    luz.castShadow = graficos.sombra > 0;
  }
  const preparados = new WeakSet<Material>();
  /** Liga os materiais novos às cascatas, mantendo os ajustes de shader que eles já têm. */
  const prepararMateriais = (): void => {
    scene.traverse((o: Object3D) => {
      const material = (o as { material?: Material | Material[] }).material;
      for (const m of Array.isArray(material) ? material : material ? [material] : []) {
        if (preparados.has(m) || !('lights' in m) || !(m as { lights?: boolean }).lights) continue;
        preparados.add(m);
        const anterior = m.onBeforeCompile;
        csm.setupMaterial(m);
        const dasCascatas = m.onBeforeCompile;
        m.onBeforeCompile = (shader, r) => {
          anterior.call(m, shader, r);
          dasCascatas.call(m, shader, r);
        };
        m.needsUpdate = true;
      }
    });
  };

  const focarSombras = (alvo: Vector3, dirSol: Vector3, dirTerra: Vector3): void => {
    csm.lightDirection.copy(dirSol).negate();
    luzDaTerra.target.position.copy(alvo);
    luzDaTerra.position.copy(alvo).addScaledVector(dirTerra, 600);
    luzDaTerra.target.updateMatrixWorld();
  };
  focarSombras(new Vector3(0, 0, 0), DIRECAO_SOL, DIRECAO_TERRA);

  // Pós-processamento (ART-08). O alvo guarda a profundidade do passe principal, que o SSAO
  // reaproveita (sem desenhar a cena de novo, TEC-16).
  const alvo = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    depthTexture: new DepthTexture(1, 1),
  });
  const composer = new EffectComposer(renderer, alvo);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOComProfundidade(scene, camera, 1, 1);
  gtao.enabled = graficos.ssao === true;
  composer.addPass(gtao);
  const bloom = new UnrealBloomPass(new Vector2(1, 1), BLOOM.forca, BLOOM.raio, BLOOM.limiar);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grao = new ShaderPass(ShaderDeGrao);
  composer.addPass(grao);

  const resize = (): void => {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    csm.updateFrustums();
  };
  window.addEventListener('resize', resize);
  resize();

  const aplicarGraficos = (escala: number, sombra: number, ssao = false): void => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, escala));
    resize();
    gtao.enabled = ssao;
    const ligadas = sombra > 0;
    for (const luz of csm.lights) {
      luz.castShadow = ligadas;
      if (ligadas && sombra !== luz.shadow.mapSize.x) {
        luz.shadow.map?.dispose();
        luz.shadow.map = null;
        luz.shadow.mapSize.set(sombra, sombra);
      }
    }
    if (ligadas !== renderer.shadowMap.enabled) {
      renderer.shadowMap.enabled = ligadas;
      // Ligar ou desligar as sombras muda os shaders: os materiais recompilam.
      scene.traverse((o) => {
        const material = (o as { material?: Material | Material[] }).material;
        for (const m of Array.isArray(material) ? material : material ? [material] : []) {
          m.needsUpdate = true;
        }
      });
    }
  };

  let quadro = 0;
  let fov = camera.fov;
  return {
    scene,
    camera,
    renderer,
    focarSombras,
    ambientar: (a) => {
      scene.background = a.ceu ? a.ceu.clone() : new Color(0x000000);
      ambiente.color.copy(a.ambiente.cor);
      ambiente.intensity = a.ambiente.intensidade;
      luzDaTerra.color.copy(a.secundaria.cor);
      luzDaTerra.intensity = a.secundaria.intensidade;
      for (const luz of csm.lights) luz.intensity = a.intensidadeSol;
    },
    aplicarGraficos,
    render: () => {
      // Materiais novos (lotes, destroços) entram nas cascatas; a cada meio segundo basta.
      if (quadro++ % 30 === 0) prepararMateriais();
      renderer.info.reset();
      // O FOV muda no controle direto (CTL-15): as cascatas acompanham.
      if (camera.fov !== fov) {
        fov = camera.fov;
        csm.updateFrustums();
      }
      camera.updateMatrixWorld();
      csm.update();
      grao.uniforms.uTempo!.value = (performance.now() / 1000) % 100;
      composer.render();
    },
    dispose: () => {
      window.removeEventListener('resize', resize);
      csm.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
