/**
 * Efeitos e corpos de combate na tela: feixes de laser (CMB-06: 0,15 s na cor da nação),
 * torpedos e bombas em voo, explosões (ART-07, versão simples), destroços (ECO-27) e zonas de
 * radiação (CMB-24). Só lê o estado e os eventos da simulação.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  type Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  dados,
  type EntityId,
  entitiesWith,
  getComponent,
  param,
  type SimEvent,
  type SimState,
} from '../sim';
import { norteEm, produtoVetorial, type Vec3 } from '../sim/map/esfera';
import type { CorpoDesenhado } from './unidades';

/** CMB-06: duração do feixe (s). */
const FEIXE_S = 0.15;
/** Duração (s) e raio mínimo (m) da explosão desenhada (apresentação). */
const EXPLOSAO_S = 0.6;
const EXPLOSAO_MIN_M = 1.2;
const MAX_FEIXES = 256;
const MAX_INSTANCIAS = 256;

export interface DestrocoDesenhado {
  id: EntityId;
  x: number;
  y: number;
  z: number;
  cima: [number, number, number];
  raio: number;
  altura: number;
}

/** Entulho: alguns blocos tortos com raio ~1 e base em y = 0. */
function geometriaDeEntulho(): BufferGeometry {
  const partes: BufferGeometry[] = [];
  const blocos: Array<[number, number, number, number, number]> = [
    [0, 0, 0.9, 0.35, 0.3],
    [0.5, 0.2, 0.5, 0.25, -0.5],
    [-0.45, 0.3, 0.6, 0.2, 0.8],
    [0.1, -0.5, 0.45, 0.3, 1.2],
    [-0.3, -0.4, 0.35, 0.18, -1.0],
  ];
  for (const [x, z, largura, altura, giro] of blocos) {
    const g = new BoxGeometry(largura, altura, largura * 0.7);
    g.rotateY(giro);
    g.rotateX(giro * 0.3);
    g.translate(x, altura / 2, z);
    partes.push(g);
  }
  return mergeGeometries(partes)!;
}

interface Feixe {
  de: EntityId;
  para: EntityId;
  cor: Color;
  ate: number;
}

interface Explosao {
  pos: Vector3;
  raio: number;
  inicio: number;
  malha: Mesh;
}

export class CombateRender {
  private readonly feixes: Feixe[] = [];
  private readonly linhas: LineSegments;
  private readonly posicoesFeixe = new Float32Array(MAX_FEIXES * 6);
  private readonly coresFeixe = new Float32Array(MAX_FEIXES * 6);
  private readonly projeteis: InstancedMesh;
  private readonly destrocos: InstancedMesh;
  private readonly explosoes: Explosao[] = [];
  private readonly geoExplosao = new SphereGeometry(1, 16, 12);
  private readonly zonas = new Map<EntityId, Mesh>();
  private readonly matriz = new Matrix4();
  private readonly corDaNacao = new Map<string, Color>();
  /** Destroços desenhados no último quadro (alvo do clique direito de reciclar, CTL-07). */
  readonly destrocosDesenhados: DestrocoDesenhado[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly raio: number,
    private readonly chao: (d: Vec3) => number,
  ) {
    const geo = new BufferGeometry();
    // BufferAttribute usa o próprio array (sem cópia): os feixes são reescritos a cada quadro.
    geo.setAttribute(
      'position',
      new BufferAttribute(this.posicoesFeixe, 3).setUsage(DynamicDrawUsage),
    );
    geo.setAttribute('color', new BufferAttribute(this.coresFeixe, 3).setUsage(DynamicDrawUsage));
    this.linhas = new LineSegments(
      geo,
      new LineBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending }),
    );
    this.linhas.frustumCulled = false;
    this.projeteis = new InstancedMesh(
      new SphereGeometry(0.22, 8, 6),
      new MeshBasicMaterial({ color: '#ffb347' }),
      MAX_INSTANCIAS,
    );
    this.projeteis.frustumCulled = false;
    this.projeteis.count = 0;
    this.destrocos = new InstancedMesh(
      geometriaDeEntulho(),
      new MeshStandardMaterial({ color: '#3b3d42', roughness: 0.9, metalness: 0.2 }),
      MAX_INSTANCIAS,
    );
    this.destrocos.frustumCulled = false;
    this.destrocos.receiveShadow = true;
    this.destrocos.count = 0;
    scene.add(this.linhas, this.projeteis, this.destrocos);
  }

  private cor(nacao: string | undefined): Color {
    const chave = nacao ?? '';
    let cor = this.corDaNacao.get(chave);
    if (!cor) {
      cor = new Color(dados.nacoes.find((n) => n.id === nacao)?.cor ?? '#ffffff');
      this.corDaNacao.set(chave, cor);
    }
    return cor;
  }

  /** Eventos do tick: disparos hitscan viram feixes; detonações, explosões. */
  registrar(state: SimState, eventos: readonly SimEvent[], agora: number): void {
    for (const e of eventos) {
      if (e.tipo === 'disparo') {
        const d = e.dados as { atirador: EntityId; alvo: EntityId; arma: string };
        const arma = dados.armas.find((a) => a.id === d.arma);
        if (arma?.projetil !== 'hitscan') continue;
        const nacao = getComponent(state, d.atirador, 'owner')?.nacao;
        this.feixes.push({
          de: d.atirador,
          para: d.alvo,
          cor: this.cor(nacao),
          ate: agora + FEIXE_S * 1000,
        });
      } else if (e.tipo === 'explosao') {
        const d = e.dados as { d: Vec3; raio: number };
        const r = this.raio + this.chao(d.d) + 0.5;
        const malha = new Mesh(
          this.geoExplosao,
          new MeshBasicMaterial({
            color: '#ffcc66',
            transparent: true,
            blending: AdditiveBlending,
            depthWrite: false,
          }),
        );
        malha.position.set(d.d[0] * r, d.d[1] * r, d.d[2] * r);
        this.scene.add(malha);
        this.explosoes.push({
          pos: malha.position,
          raio: Math.max(EXPLOSAO_MIN_M, d.raio),
          inicio: agora,
          malha,
        });
      }
    }
  }

  /** `explorado`: destroços e projéteis só em área explorada ou visível (VIS-01). */
  sync(
    state: SimState,
    corpos: (id: EntityId) => CorpoDesenhado | undefined,
    agora: number,
    explorado: ((id: EntityId) => boolean) | null = null,
  ): void {
    // Feixes: da posição desenhada do atirador à do alvo.
    let n = 0;
    for (let k = this.feixes.length - 1; k >= 0; k--) {
      if (this.feixes[k]!.ate < agora) this.feixes.splice(k, 1);
    }
    for (const f of this.feixes) {
      const a = corpos(f.de);
      const b = corpos(f.para);
      if (!a || !b || n >= MAX_FEIXES) continue;
      const alto = (c: CorpoDesenhado) => c.altura * 0.6;
      this.posicoesFeixe.set(
        [
          a.x + a.cima[0] * alto(a),
          a.y + a.cima[1] * alto(a),
          a.z + a.cima[2] * alto(a),
          b.x + b.cima[0] * alto(b),
          b.y + b.cima[1] * alto(b),
          b.z + b.cima[2] * alto(b),
        ],
        n * 6,
      );
      for (let v = 0; v < 2; v++) f.cor.toArray(this.coresFeixe, n * 6 + v * 3);
      n++;
    }
    const geo = this.linhas.geometry;
    geo.setDrawRange(0, n * 2);
    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('color').needsUpdate = true;

    // Projéteis em voo.
    let p = 0;
    for (const id of entitiesWith(state, 'projetil', 'position')) {
      if (p >= MAX_INSTANCIAS) break;
      if (explorado && !explorado(id)) continue;
      const pos = getComponent(state, id, 'position')!;
      this.matriz.makeTranslation(pos.x, pos.y, pos.z);
      this.projeteis.setMatrixAt(p++, this.matriz);
    }
    this.projeteis.count = p;
    this.projeteis.instanceMatrix.needsUpdate = true;

    // Destroços (ECO-27), alinhados à vertical local.
    this.destrocosDesenhados.length = 0;
    let q = 0;
    const cima = new Vector3();
    const frente = new Vector3();
    const lado = new Vector3();
    for (const id of entitiesWith(state, 'destroco', 'position')) {
      if (q >= MAX_INSTANCIAS) break;
      if (explorado && !explorado(id)) continue;
      const pos = getComponent(state, id, 'position')!;
      const r = Math.hypot(pos.x, pos.y, pos.z);
      const d: Vec3 = [pos.x / r, pos.y / r, pos.z / r];
      cima.set(...d);
      frente.set(...norteEm(d));
      lado.set(...produtoVetorial(norteEm(d), d));
      this.matriz.makeBasis(frente, cima, lado);
      this.matriz.setPosition(pos.x, pos.y, pos.z);
      this.destrocos.setMatrixAt(q++, this.matriz);
      this.destrocosDesenhados.push({
        id,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        cima: d,
        raio: 1,
        altura: 0.8,
      });
    }
    this.destrocos.count = q;
    this.destrocos.instanceMatrix.needsUpdate = true;

    // Explosões: esfera que cresce e some.
    for (let k = this.explosoes.length - 1; k >= 0; k--) {
      const e = this.explosoes[k]!;
      const t = (agora - e.inicio) / (EXPLOSAO_S * 1000);
      if (t >= 1) {
        this.scene.remove(e.malha);
        (e.malha.material as MeshBasicMaterial).dispose();
        this.explosoes.splice(k, 1);
        continue;
      }
      e.malha.scale.setScalar(e.raio * (0.3 + 0.7 * t));
      (e.malha.material as MeshBasicMaterial).opacity = 0.8 * (1 - t);
    }

    // Zonas de radiação (CMB-24): disco verde translúcido.
    const vivas = new Set(entitiesWith(state, 'radiacao', 'position'));
    for (const [id, malha] of this.zonas) {
      if (vivas.has(id)) continue;
      this.scene.remove(malha);
      malha.geometry.dispose();
      (malha.material as MeshBasicMaterial).dispose();
      this.zonas.delete(id);
    }
    for (const id of vivas) {
      if (this.zonas.has(id)) continue;
      const pos = getComponent(state, id, 'position')!;
      const r = Math.hypot(pos.x, pos.y, pos.z);
      const d: Vec3 = [pos.x / r, pos.y / r, pos.z / r];
      const raio = param('radiacao_raio_m');
      const malha = new Mesh(
        new RingGeometry(raio * 0.05, raio, 48),
        new MeshBasicMaterial({
          color: '#9dff4a',
          transparent: true,
          opacity: 0.18,
          side: DoubleSide,
          depthWrite: false,
        }),
      );
      const alto = r + 0.4;
      malha.position.set(d[0] * alto, d[1] * alto, d[2] * alto);
      malha.lookAt(d[0] * (alto + 1), d[1] * (alto + 1), d[2] * (alto + 1));
      this.zonas.set(id, malha);
      this.scene.add(malha);
    }
  }
}
