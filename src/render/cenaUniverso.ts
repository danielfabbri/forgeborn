/**
 * Visão do Universo (FLX-04): Sistema Solar estilizado (fora de escala) e navegável. Arrastar
 * gira, a roda aproxima, clicar num corpo foca nele. Cenários bloqueados ficam cinza com
 * cadeado, disponíveis pulsam e concluídos ganham a cor da nação e estrelas. Uma linha
 * tracejada de dobra liga a Terra ao corpo selecionado.
 */
import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  ShaderMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { CenariosId } from '../sim/data';
import { estrelas } from './sky';

export type EstadoDoCenario = 'bloqueado' | 'disponivel' | 'concluido';

export interface CorpoCeleste {
  id: string;
  /** Corpo em volta do qual orbita (luas). */
  pai?: string;
  raio: number;
  orbita: number;
  /** Ângulo da posição na órbita (rad): apresentação. */
  angulo: number;
  cor: string;
  cenarios: readonly CenariosId[];
}

/** FLX-04: os corpos do mapa do Sistema Solar (fora de escala: números de apresentação). */
export const CORPOS: readonly CorpoCeleste[] = [
  { id: 'sol', raio: 12, orbita: 0, angulo: 0, cor: '#ffcc55', cenarios: [] },
  { id: 'venus', raio: 3, orbita: 38, angulo: 2.4, cor: '#d9a25f', cenarios: ['venus'] },
  { id: 'terra', raio: 3.4, orbita: 58, angulo: 0.3, cor: '#2d5b9a', cenarios: ['terra_lab'] },
  {
    id: 'lua',
    pai: 'terra',
    raio: 1.1,
    orbita: 7,
    angulo: 1,
    cor: '#bdbdb5',
    cenarios: ['lua', 'lua_shackleton'],
  },
  { id: 'marte', raio: 2.6, orbita: 82, angulo: 4.1, cor: '#c1502e', cenarios: ['marte'] },
  {
    id: 'fobos',
    pai: 'marte',
    raio: 0.6,
    orbita: 5,
    angulo: 2,
    cor: '#8a7b6d',
    cenarios: ['fobos'],
  },
  { id: 'ceres', raio: 1.2, orbita: 108, angulo: 1.2, cor: '#9a968e', cenarios: ['ceres'] },
  { id: 'jupiter', raio: 8, orbita: 142, angulo: 5.3, cor: '#caa27a', cenarios: [] },
  {
    id: 'europa',
    pai: 'jupiter',
    raio: 1,
    orbita: 13,
    angulo: 0.6,
    cor: '#d8cfb8',
    cenarios: ['europa'],
  },
  { id: 'saturno', raio: 7, orbita: 186, angulo: 2.9, cor: '#d9c08a', cenarios: [] },
  {
    id: 'tita',
    pai: 'saturno',
    raio: 1.3,
    orbita: 14,
    angulo: 4,
    cor: '#d49a4a',
    cenarios: ['tita'],
  },
];
const RAIO_CINTURAO = 108;

export interface OpcoesDoUniverso {
  estadoDe(cenario: CenariosId): EstadoDoCenario;
  /** Cor da nação do jogador (cenários concluídos). */
  corDoJogador: string;
  aoSelecionar(corpo: string): void;
  /** CAM-03: estrelas do corpo na campanha (os concluídos mostram ★★☆). */
  estrelasDe?(corpo: CorpoCeleste): { tem: number; max: number } | null;
}

/** ART-09 (apresentação): cor da atmosfera de cada corpo. */
const ATMOSFERA: Record<string, string> = {
  terra: '#6fb7ff',
  venus: '#ffd98a',
  marte: '#ff9a6a',
  tita: '#ffb35c',
  jupiter: '#ffd9b0',
  saturno: '#ffe7b0',
};

/** Casca aditiva que brilha só na borda (fresnel), do lado de fora do corpo. */
function materialDeAtmosfera(cor: string): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { cor: { value: new Color(cor) } },
    vertexShader: `varying vec3 vNormal; varying vec3 vVista;
      void main() {
        vec4 mundo = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vVista = normalize(-mundo.xyz);
        gl_Position = projectionMatrix * mundo;
      }`,
    fragmentShader: `uniform vec3 cor; varying vec3 vNormal; varying vec3 vVista;
      void main() {
        float borda = pow(1.0 - max(dot(vNormal, vVista), 0.0), 3.0);
        gl_FragColor = vec4(cor * borda * 1.4, borda);
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}

interface Desenho {
  corpo: CorpoCeleste;
  malha: Mesh;
  halo: Mesh | null;
  estado: EstadoDoCenario | null;
}

/** Estado do corpo: o melhor dos seus cenários (sem cenário, null). */
export function estadoDoCorpo(
  corpo: CorpoCeleste,
  estadoDe: (c: CenariosId) => EstadoDoCenario,
): EstadoDoCenario | null {
  if (corpo.cenarios.length === 0) return null;
  const estados = corpo.cenarios.map(estadoDe);
  if (estados.includes('disponivel')) return 'disponivel';
  if (estados.includes('concluido')) return 'concluido';
  return 'bloqueado';
}

export class CenaUniverso {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(45, 1, 0.5, 20000);
  private readonly desenhos: Desenho[] = [];
  private readonly posicoes = new Map<string, Vector3>();
  private readonly dobra: Line;
  private readonly foco = new Vector3();
  private readonly focoAlvo = new Vector3();
  private azimute = -0.6;
  private elevacao = 0.55;
  private distancia = 330;
  private distanciaAlvo = 330;
  private selecionado: string | null = null;
  private arrasto: { x: number; y: number; moveu: boolean } | null = null;
  private quadro = 0;
  private readonly raio = new Raycaster();
  private readonly rotulos: HTMLDivElement;

  constructor(
    private readonly container: HTMLElement,
    private readonly opcoes: OpcoesDoUniverso,
    private readonly nomeDe: (corpo: string) => string,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    container.appendChild(this.renderer.domElement);
    this.scene.background = new Color(0x000000);
    this.scene.add(estrelas(), new AmbientLight(0x404858, 0.8));
    this.scene.add(new PointLight(0xfff2d0, 4, 0, 0));

    for (const corpo of CORPOS) this.posicoes.set(corpo.id, this.posicaoDe(corpo));
    for (const corpo of CORPOS) this.criarCorpo(corpo);
    this.criarCinturao();

    this.dobra = new Line(
      new BufferGeometry().setAttribute(
        'position',
        new Float32BufferAttribute(new Float32Array(6), 3),
      ),
      new LineDashedMaterial({ color: '#9fd8ff', dashSize: 2, gapSize: 1.5 }),
    );
    this.dobra.visible = false;
    this.scene.add(this.dobra);

    this.rotulos = document.createElement('div');
    this.rotulos.className = 'universo-rotulos';
    container.appendChild(this.rotulos);

    const tela = this.renderer.domElement;
    tela.addEventListener('pointerdown', this.apertou);
    window.addEventListener('pointermove', this.moveu);
    window.addEventListener('pointerup', this.soltou);
    tela.addEventListener('wheel', this.roda, { passive: false });
    window.addEventListener('resize', this.redimensionar);
    this.redimensionar();
    this.animar();
  }

  private posicaoDe(corpo: CorpoCeleste): Vector3 {
    const centro = corpo.pai
      ? this.posicaoDe(CORPOS.find((c) => c.id === corpo.pai)!)
      : new Vector3();
    return centro.add(
      new Vector3(Math.cos(corpo.angulo) * corpo.orbita, 0, Math.sin(corpo.angulo) * corpo.orbita),
    );
  }

  private criarCorpo(corpo: CorpoCeleste): void {
    const estado = estadoDoCorpo(corpo, this.opcoes.estadoDe);
    let cor = new Color(corpo.cor);
    if (estado === 'bloqueado') cor = new Color('#5a5c62');
    if (estado === 'concluido') cor = cor.lerp(new Color(this.opcoes.corDoJogador), 0.6);
    const material =
      corpo.id === 'sol'
        ? new MeshBasicMaterial({ color: cor })
        : new MeshStandardMaterial({ color: cor, roughness: 0.9 });
    const malha = new Mesh(new SphereGeometry(corpo.raio, 32, 16), material);
    malha.position.copy(this.posicoes.get(corpo.id)!);
    malha.userData.corpo = corpo.id;
    this.scene.add(malha);
    // ART-09: atmosfera em rim light (fresnel) nos planetas e luas.
    if (corpo.id !== 'sol') {
      const atmosfera = new Mesh(
        new SphereGeometry(corpo.raio * 1.08, 32, 16),
        materialDeAtmosfera(ATMOSFERA[corpo.id] ?? '#9aa6b8'),
      );
      atmosfera.position.copy(malha.position);
      this.scene.add(atmosfera);
    }

    // Órbita em volta do Sol ou do planeta.
    if (corpo.orbita > 0) {
      const centro = corpo.pai ? this.posicoes.get(corpo.pai)! : new Vector3();
      const pontos: number[] = [];
      for (let k = 0; k <= 96; k++) {
        const a = (k / 96) * Math.PI * 2;
        pontos.push(
          centro.x + Math.cos(a) * corpo.orbita,
          0,
          centro.z + Math.sin(a) * corpo.orbita,
        );
      }
      const orbita = new Line(
        new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pontos, 3)),
        new LineBasicMaterial({ color: '#2a3446', transparent: true, opacity: 0.8 }),
      );
      this.scene.add(orbita);
    }
    if (corpo.id === 'saturno') {
      const anel = new Mesh(
        new RingGeometry(corpo.raio * 1.3, corpo.raio * 2.1, 64),
        new MeshBasicMaterial({ color: '#b8a57c', transparent: true, opacity: 0.55, side: 2 }),
      );
      anel.position.copy(malha.position);
      anel.rotation.x = -Math.PI / 2.4;
      this.scene.add(anel);
    }
    // Disponível pulsa; concluído ganha um halo na cor da nação.
    let halo: Mesh | null = null;
    if (estado === 'disponivel' || estado === 'concluido') {
      halo = new Mesh(
        new SphereGeometry(corpo.raio * 1.6, 24, 12),
        new MeshBasicMaterial({
          color: estado === 'concluido' ? this.opcoes.corDoJogador : '#8fe3ff',
          transparent: true,
          opacity: 0.25,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      halo.position.copy(malha.position);
      this.scene.add(halo);
    }
    this.desenhos.push({ corpo, malha, halo, estado });
  }

  private criarCinturao(): void {
    const n = 1500;
    const pontos = new Float32Array(n * 3);
    let s = 99;
    const aleatorio = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let k = 0; k < n; k++) {
      const a = aleatorio() * Math.PI * 2;
      const r = RAIO_CINTURAO + (aleatorio() - 0.5) * 10;
      pontos.set([Math.cos(a) * r, (aleatorio() - 0.5) * 2, Math.sin(a) * r], k * 3);
    }
    const g = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pontos, 3));
    this.scene.add(new Points(g, new PointsMaterial({ color: '#6d6a64', size: 0.6 })));
  }

  /** Seleciona e foca um corpo (clique ou lista). */
  selecionar(id: string): void {
    const pos = this.posicoes.get(id);
    if (!pos) return;
    this.selecionado = id;
    this.focoAlvo.copy(pos);
    const corpo = CORPOS.find((c) => c.id === id)!;
    this.distanciaAlvo = Math.max(18, corpo.raio * 9 + (corpo.pai ? 20 : 30));
    this.opcoes.aoSelecionar(id);
  }

  private readonly apertou = (e: PointerEvent): void => {
    this.arrasto = { x: e.clientX, y: e.clientY, moveu: false };
  };

  private readonly moveu = (e: PointerEvent): void => {
    if (!this.arrasto) return;
    const dx = e.clientX - this.arrasto.x;
    const dy = e.clientY - this.arrasto.y;
    if (Math.hypot(dx, dy) > 3) this.arrasto.moveu = true;
    if (!this.arrasto.moveu) return;
    this.azimute -= dx * 0.005;
    this.elevacao = Math.min(1.45, Math.max(-1.2, this.elevacao + dy * 0.005));
    this.arrasto.x = e.clientX;
    this.arrasto.y = e.clientY;
  };

  private readonly soltou = (e: PointerEvent): void => {
    const clique = this.arrasto && !this.arrasto.moveu;
    this.arrasto = null;
    if (!clique) return;
    const id = this.corpoEm(e.clientX, e.clientY);
    if (id) this.selecionar(id);
  };

  /** O corpo sob o ponto de tela (px), para cliques e testes. */
  corpoEm(x: number, y: number): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raio.setFromCamera(
      new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1),
      this.camera,
    );
    const acerto = this.raio.intersectObjects(this.desenhos.map((d) => d.malha))[0];
    return (acerto?.object.userData.corpo as string | undefined) ?? null;
  }

  /** Posição de tela (px) de um corpo, ou null atrás da câmera. */
  pontoDe(id: string): { x: number; y: number } | null {
    const pos = this.posicoes.get(id);
    if (!pos) return null;
    const v = pos.clone().project(this.camera);
    if (v.z > 1) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  private readonly roda = (e: WheelEvent): void => {
    e.preventDefault();
    this.distanciaAlvo = Math.min(
      700,
      Math.max(12, this.distanciaAlvo * (e.deltaY > 0 ? 1.15 : 0.87)),
    );
  };

  private readonly redimensionar = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private readonly animar = (): void => {
    this.quadro = requestAnimationFrame(this.animar);
    const t = performance.now() / 1000;
    this.foco.lerp(this.focoAlvo, 0.08);
    this.distancia += (this.distanciaAlvo - this.distancia) * 0.08;
    const c = Math.cos(this.elevacao);
    this.camera.position
      .set(Math.cos(this.azimute) * c, Math.sin(this.elevacao), Math.sin(this.azimute) * c)
      .multiplyScalar(this.distancia)
      .add(this.foco);
    this.camera.lookAt(this.foco);

    for (const d of this.desenhos) {
      d.malha.rotation.y = t * 0.2;
      if (d.halo && d.estado === 'disponivel') {
        const pulso = 0.5 + 0.5 * Math.sin(t * 3);
        (d.halo.material as MeshBasicMaterial).opacity = 0.12 + 0.25 * pulso;
        d.halo.scale.setScalar(1 + 0.12 * pulso);
      }
    }

    // Linha de dobra: Terra → selecionado.
    const terra = this.posicoes.get('terra')!;
    const alvo = this.selecionado ? this.posicoes.get(this.selecionado) : undefined;
    this.dobra.visible = alvo !== undefined && this.selecionado !== 'terra';
    if (alvo) {
      const pos = this.dobra.geometry.getAttribute('position') as Float32BufferAttribute;
      pos.setXYZ(0, terra.x, terra.y, terra.z);
      pos.setXYZ(1, alvo.x, alvo.y, alvo.z);
      pos.needsUpdate = true;
      this.dobra.computeLineDistances();
    }

    this.renderer.render(this.scene, this.camera);
    this.desenharRotulos();
  };

  /** Nomes, cadeados e estrelas sobre os corpos (HTML acompanha a projeção). */
  private desenharRotulos(): void {
    const partes: string[] = [];
    for (const d of this.desenhos) {
      const p = this.pontoDe(d.corpo.id);
      if (!p) continue;
      const estrelas = this.opcoes.estrelasDe?.(d.corpo) ?? null;
      const marca =
        d.estado === 'bloqueado'
          ? '🔒 '
          : estrelas && estrelas.tem > 0
            ? `${'★'.repeat(estrelas.tem)}${'☆'.repeat(estrelas.max - estrelas.tem)} `
            : d.estado === 'concluido'
              ? '★ '
              : '';
      const classe = `rotulo ${d.estado ?? 'neutro'}${d.corpo.id === this.selecionado ? ' selecionado' : ''}`;
      partes.push(
        `<div class="${classe}" data-corpo="${d.corpo.id}" style="left:${p.x}px;top:${p.y + 10}px">${marca}${this.nomeDe(d.corpo.id)}</div>`,
      );
    }
    this.rotulos.innerHTML = partes.join('');
  }

  dispose(): void {
    cancelAnimationFrame(this.quadro);
    window.removeEventListener('pointermove', this.moveu);
    window.removeEventListener('pointerup', this.soltou);
    window.removeEventListener('resize', this.redimensionar);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.rotulos.remove();
  }
}
