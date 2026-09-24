/**
 * Tela de Abertura (FLX-02): a Terra escura, sem luzes de cidades, e as quatro Arcas-Forja
 * (a Nave Inicial, na cor de cada nação) partindo em dobra, em loop. A Seleção de Modo
 * (FLX-03) continua com este fundo.
 */
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DirectionalLight,
  AmbientLight,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { dados } from '../sim';
import { geometriaDoModelo } from './modelos';
import { estrelas, terra } from './sky';
import { criarMaterial } from './unidades';

/** Apresentação: duração de uma partida de Arca (s) e raio da Terra na cena. */
const CICLO_S = 9;
const RAIO_TERRA = 60;

interface Arca {
  corpo: Group;
  rastro: Mesh;
  atraso: number;
  saida: Vector3;
  rumo: Vector3;
}

export class CenaAbertura {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(45, 1, 0.5, 9000);
  private readonly arcas: Arca[] = [];
  private quadro = 0;
  private inicio = performance.now();

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    container.appendChild(this.renderer.domElement);
    this.scene.background = new Color(0x000000);
    this.scene.add(estrelas());
    const planeta = terra(RAIO_TERRA);
    planeta.position.set(0, 0, 0);
    // O Sol ilumina a Terra de trás: um crescente fino na borda.
    planeta.material.uniforms.uSol!.value = new Vector3(0.9, 0.25, -0.6).normalize();
    this.scene.add(planeta);
    this.scene.add(new AmbientLight(0x8899aa, 0.5));
    const luz = new DirectionalLight(0xffffff, 2.2);
    luz.position.set(1, 1, 1);
    this.scene.add(luz);

    const material = criarMaterial();
    dados.nacoes.forEach((nacao, k) => {
      const geometria = geometriaDoModelo('ship').clone();
      const n = geometria.getAttribute('position').count;
      const cor = new Color(nacao.cor);
      const cores = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) cor.toArray(cores, i * 3);
      geometria.setAttribute('aCorNacao', new Float32BufferAttribute(cores, 3));
      const corpo = new Group();
      const malha = new Mesh(geometria, material);
      // A Arca voa com o topo para a frente (o corpo olha para o rumo).
      malha.rotation.x = Math.PI / 2;
      corpo.add(malha);
      corpo.scale.setScalar(0.9);
      const rastro = new Mesh(
        new CylinderGeometry(0.5, 0.05, 1, 8, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2),
        new MeshBasicMaterial({
          color: cor.clone().lerp(new Color('#ffffff'), 0.5),
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      this.scene.add(corpo, rastro);
      // Saem da borda da Terra (vista da câmera) e se afastam para os lados, em perfil.
      const angulo = 0.5 + (k / dados.nacoes.length) * Math.PI * 2;
      const saida = new Vector3(Math.cos(angulo), Math.sin(angulo), 0.15)
        .normalize()
        .multiplyScalar(RAIO_TERRA + 10);
      const rumo = new Vector3(Math.cos(angulo), Math.sin(angulo) * 0.7, -0.35).normalize();
      this.arcas.push({ corpo, rastro, atraso: (k * CICLO_S) / dados.nacoes.length, saida, rumo });
    });

    this.camera.position.set(-40, 30, 230);
    this.camera.lookAt(10, 0, 0);
    window.addEventListener('resize', this.redimensionar);
    this.redimensionar();
    this.animar();
  }

  private readonly redimensionar = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private readonly animar = (): void => {
    this.quadro = requestAnimationFrame(this.animar);
    const t = (performance.now() - this.inicio) / 1000;
    for (const a of this.arcas) {
      // Fase 0–0,7: sobe devagar da órbita; 0,7–0,8: dobra (estica e some); depois, pausa.
      const fase = ((((t + a.atraso) % CICLO_S) + CICLO_S) % CICLO_S) / CICLO_S;
      const lento = Math.min(fase, 0.7) * 40;
      const dobra = fase > 0.7 ? Math.min(1, (fase - 0.7) / 0.1) : 0;
      const pos = a.saida.clone().addScaledVector(a.rumo, lento + dobra * dobra * 2000);
      a.corpo.position.copy(pos);
      a.corpo.lookAt(pos.clone().add(a.rumo));
      a.corpo.visible = fase < 0.8;
      a.rastro.visible = dobra > 0 && dobra < 1;
      a.rastro.position.copy(pos);
      a.rastro.lookAt(pos.clone().add(a.rumo));
      a.rastro.scale.set(1 + dobra * 3, 1 + dobra * 3, 5 + dobra * 400);
      (a.rastro.material as MeshBasicMaterial).opacity = 0.9 * (1 - dobra);
    }
    this.scene.rotation.y = Math.sin(t * 0.05) * 0.05;
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.quadro);
    window.removeEventListener('resize', this.redimensionar);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
