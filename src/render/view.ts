import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { DIRECAO_SOL, DIRECAO_TERRA } from './sky';

/** Metade do lado da área com sombras em volta do foco da câmera. */
const ALCANCE_SOMBRA_M = 140;

export interface View {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  /** Centra a área com sombras no ponto (x, z), normalmente o foco da câmera. */
  focarSombras(x: number, z: number): void;
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

  const scene = new Scene();
  scene.background = new Color(0x000000);

  // Sem atmosfera: sombras quase pretas, com um leve preenchimento azulado da luz da Terra.
  scene.add(new AmbientLight(0x8899aa, 0.12));
  const luzDaTerra = new DirectionalLight(0x7090ff, 0.35);
  luzDaTerra.position.copy(DIRECAO_TERRA).multiplyScalar(600);
  scene.add(luzDaTerra);

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

  const focarSombras = (x: number, z: number): void => {
    sol.target.position.set(x, 0, z);
    sol.position.set(x + DIRECAO_SOL.x * 700, DIRECAO_SOL.y * 700, z + DIRECAO_SOL.z * 700);
    sol.target.updateMatrixWorld();
  };
  focarSombras(0, 0);

  // Câmera provisória; a câmera RTS chega na T-015.
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
