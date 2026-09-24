import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { DIRECAO_SOL, DIRECAO_TERRA } from './sky';

/** Metade do lado da área com sombras em volta do foco da câmera. */
const ALCANCE_SOMBRA_M = 140;

export interface View {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  /**
   * ART-11: centra a área com sombras no ponto focal e aponta o Sol e a luz da Terra pelas
   * direções (mundo) do céu local.
   */
  focarSombras(alvo: Vector3, sol: Vector3, terra: Vector3): void;
  render(): void;
  dispose(): void;
}

export function createView(container: HTMLElement): View {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
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
  scene.add(new AmbientLight(0x8899aa, 0.12));
  const luzDaTerra = new DirectionalLight(0x7090ff, 0.35);
  scene.add(luzDaTerra, luzDaTerra.target);

  const sol = new DirectionalLight(0xfff8f0, 3.4);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  sol.shadow.camera.left = -ALCANCE_SOMBRA_M;
  sol.shadow.camera.right = ALCANCE_SOMBRA_M;
  sol.shadow.camera.top = ALCANCE_SOMBRA_M;
  sol.shadow.camera.bottom = -ALCANCE_SOMBRA_M;
  sol.shadow.camera.near = 1;
  sol.shadow.camera.far = 1600;
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.6;
  scene.add(sol, sol.target);

  const focarSombras = (alvo: Vector3, dirSol: Vector3, dirTerra: Vector3): void => {
    sol.target.position.copy(alvo);
    sol.position.copy(alvo).addScaledVector(dirSol, 700);
    sol.target.updateMatrixWorld();
    luzDaTerra.target.position.copy(alvo);
    luzDaTerra.position.copy(alvo).addScaledVector(dirTerra, 600);
    luzDaTerra.target.updateMatrixWorld();
  };
  focarSombras(new Vector3(0, 0, 0), DIRECAO_SOL, DIRECAO_TERRA);

  const camera = new PerspectiveCamera(50, 1, 0.5, 6000);
  camera.position.set(0, 160, 170);
  camera.lookAt(0, 0, 0);

  const resize = (): void => {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  return {
    scene,
    camera,
    renderer,
    focarSombras,
    render: () => renderer.render(scene, camera),
    dispose: () => {
      window.removeEventListener('resize', resize);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
