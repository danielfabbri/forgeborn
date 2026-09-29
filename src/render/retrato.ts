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
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { geometriaDoModelo, type TipoDeModelo } from './modelos';
import { criarMaterial } from './unidades';

/** Lado (px) das fotos do cartão de produção (apresentação). */
const LADO_MINIATURA_PX = 128;

/** Uma volta a cada 8 s (apresentação). */
const GIRO_RAD_S = (Math.PI * 2) / 8;

export class RetratoRender {
  /**
   * Um só contexto WebGL para todos os retratos: o painel recria o canvas a cada seleção, e
   * um renderer por canvas esgotava o limite de contextos do navegador (que então derrubava
   * o do mapa). O quadro é copiado para o canvas do painel pelo contexto 2D.
   */
  private renderer: WebGLRenderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private destino: CanvasRenderingContext2D | null = null;
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
      this.canvas = canvas;
      this.destino = canvas.getContext('2d');
      const escala = window.devicePixelRatio;
      canvas.width = Math.round((canvas.clientWidth || 96) * escala);
      canvas.height = Math.round((canvas.clientHeight || 96) * escala);
      this.renderer ??= new WebGLRenderer({ alpha: true, antialias: true });
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(canvas.width, canvas.height, false);
    }
    if (!this.destino) return;
    const chave = `${tipo}|${cor}`;
    if (chave !== this.chave) this.trocarModelo(tipo, cor, chave);
    this.angulo += GIRO_RAD_S * dt;
    this.malha!.rotation.y = this.angulo;
    this.renderer!.render(this.scene, this.camera);
    this.destino.clearRect(0, 0, canvas.width, canvas.height);
    this.destino.drawImage(this.renderer!.domElement, 0, 0);
  }

  private readonly miniaturas = new Map<string, string>();

  /**
   * UI-04: foto do modelo para o cartão de produção (imagem PNG, feita uma vez e guardada),
   * no mesmo contexto WebGL do retrato. Ângulo fixo de três quartos.
   */
  miniatura(tipo: TipoDeModelo, cor: string): string {
    const chave = `${tipo}|${cor}`;
    const pronta = this.miniaturas.get(chave);
    if (pronta) return pronta;
    this.renderer ??= new WebGLRenderer({ alpha: true, antialias: true });
    const tamanho = this.renderer.getSize(new Vector2());
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(LADO_MINIATURA_PX, LADO_MINIATURA_PX, false);
    this.trocarModelo(tipo, cor, chave);
    this.malha!.rotation.y = -0.7;
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.miniaturas.set(chave, url);
    // O retrato volta ao tamanho do seu canvas e recarrega o modelo no próximo quadro.
    if (tamanho.x > 0) this.renderer.setSize(tamanho.x, tamanho.y, false);
    this.chave = '';
    return url;
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
