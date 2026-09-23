import { Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';

export interface View {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  render(): void;
  dispose(): void;
}

export function createView(container: HTMLElement): View {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(0x000000);

  // Câmera provisória; a câmera RTS chega na T-015.
  const camera = new PerspectiveCamera(50, 1, 0.1, 5000);
  camera.position.set(0, 60, 60);
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
    render: () => renderer.render(scene, camera),
    dispose: () => {
      window.removeEventListener('resize', resize);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
