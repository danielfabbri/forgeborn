/**
 * Retrato 3D do painel de seleção (UI-03): o modelo da unidade girando, num canvas próprio,
 * com a tarja e o olho na cor da nação (ART-02).
 */
import {
  AmbientLight,
  Box3,
  type BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Mesh,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { geometriaDoModelo, type TipoDeModelo } from './modelos';
import { criarMaterial } from './unidades';

/** Uma volta a cada 8 s (apresentação). */
const GIRO_RAD_S = (Math.PI * 2) / 8;

export class RetratoRender {
  private renderer: WebGLRenderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.1, 200);
  private readonly material = criarMaterial();
  private malha: Mesh | null = null;
  private chave = '';
  private angulo = 0;

  constructor() {
    this.scene.add(new AmbientLight('#8fa3c0', 1.2));
    const sol = new DirectionalLight('#ffffff', 2.5);
    sol.position.set(3, 5, 4);
    this.scene.add(sol);
  }

  /** Desenha o modelo `tipo` no canvas; null esconde. */
  desenhar(canvas: HTMLCanvasElement | null, tipo: TipoDeModelo | null, cor: string, dt: number) {
    if (!canvas || !tipo) return;
    if (canvas !== this.canvas) {
      this.renderer?.dispose();
      this.canvas = canvas;
      this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
      this.renderer.setPixelRatio(window.devicePixelRatio);
      this.renderer.setSize(canvas.clientWidth || 96, canvas.clientHeight || 96, false);
    }
    const chave = `${tipo}|${cor}`;
    if (chave !== this.chave) this.trocarModelo(tipo, cor, chave);
    this.angulo += GIRO_RAD_S * dt;
    this.malha!.rotation.y = this.angulo;
    this.renderer!.render(this.scene, this.camera);
  }

  private trocarModelo(tipo: TipoDeModelo, cor: string, chave: string): void {
    if (this.malha) {
      this.scene.remove(this.malha);
      this.malha.geometry.dispose();
    }
    const geometria: BufferGeometry = geometriaDoModelo(tipo).clone();
    // A cor da nação por vértice (no jogo ela vem por instância).
    const c = new Color(cor);
    const n = geometria.getAttribute('position').count;
    const cores = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) c.toArray(cores, k * 3);
    geometria.setAttribute('aCorNacao', new Float32BufferAttribute(cores, 3));
    this.malha = new Mesh(geometria, this.material);
    this.scene.add(this.malha);
    // Enquadra o modelo: a câmera olha o centro de cima e de lado.
    const caixa = new Box3().setFromObject(this.malha);
    const centro = caixa.getCenter(new Vector3());
    const tamanho = caixa.getSize(new Vector3()).length();
    this.malha.position.sub(centro);
    this.camera.position.set(0, tamanho * 0.9, tamanho * 1.7);
    this.camera.lookAt(0, 0, 0);
    this.chave = chave;
  }
}
