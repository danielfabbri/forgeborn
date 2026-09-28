/**
 * Jazidas desenhadas (ECO-04, ECO-05, D-89): rochas como as pedras neutras (CEN-17), com cristais
 * e veios na cor do recurso brotando delas; a rocha é um InstancedMesh só, os cristais um por
 * recurso, com a escala acompanhando o raio (que encolhe com a quantidade).
 */
import { configuracoes } from '../game/configuracoes';
import { corDoRecurso } from '../game/paleta';
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  type Scene,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dados, type EntityId, entitiesWith, getComponent, param, type SimState } from '../sim';
import type { RecursosId } from '../sim/data';
import { girar, normalizar, norteEm } from '../sim/map/esfera';
import { geometriaDaRocha } from './pedras';

export interface JazidaDesenhada {
  id: EntityId;
  recurso: RecursosId;
  x: number;
  y: number;
  z: number;
  cima: [number, number, number];
  /** Raio atual (m), o mesmo da colisão (D-27). */
  raio: number;
  altura: number;
}

/** Por recurso (ECO-30 espalha muitas jazidas pelo planeta). */
const CAPACIDADE = 256;

/** Rocha de raio 1 com a base em y = 0: achatada e meio enterrada, como as pedras. */
function geometriaDoCorpo(): BufferGeometry {
  const g = geometriaDaRocha();
  g.scale(1, 0.75, 1);
  g.translate(0, 0.45, 0);
  return g;
}

/**
 * Cristais e veios que brotam da rocha (raio 1): lascas pontudas saindo em leque pelo topo e
 * pelas faces, e placas finas rentes à superfície, como veios expostos.
 */
function geometriaDeCristais(): BufferGeometry {
  const partes: BufferGeometry[] = [];
  const lascas: Array<[number, number, number, number, number]> = [
    // ângulo em volta (rad), elevação (rad), comprimento, largura, raio da base
    [0.3, 1.2, 1.05, 0.2, 0.55],
    [1.9, 0.9, 0.8, 0.17, 0.75],
    [3.4, 1.05, 0.9, 0.18, 0.7],
    [4.8, 0.75, 0.7, 0.15, 0.85],
    [5.7, 1.35, 0.6, 0.14, 0.35],
    [2.6, 0.55, 0.55, 0.13, 0.95],
  ];
  const eixo = new Vector3();
  const cima = new Vector3(0, 1, 0);
  for (const [volta, elevacao, comprimento, largura, base] of lascas) {
    const g = new OctahedronGeometry(1, 0);
    g.scale(largura, comprimento / 2, largura);
    eixo.set(
      Math.cos(volta) * Math.cos(elevacao),
      Math.sin(elevacao),
      Math.sin(volta) * Math.cos(elevacao),
    );
    g.applyQuaternion(new Quaternion().setFromUnitVectors(cima, eixo));
    // Nasce dentro da rocha e sai pela superfície.
    g.translate(
      Math.cos(volta) * base * 0.8,
      0.45 + 0.6 * Math.sin(elevacao) * (1 - base * 0.3) + (comprimento / 2) * eixo.y * 0.6,
      Math.sin(volta) * base * 0.8,
    );
    partes.push(g);
  }
  // Veios: placas finas encostadas nas faces da rocha.
  for (const [volta, altura] of [
    [0.9, 0.55],
    [2.9, 0.4],
    [4.3, 0.65],
  ] as const) {
    const g = new BoxGeometry(0.55, 0.09, 0.05);
    g.rotateZ(0.5);
    g.rotateY(-volta);
    g.translate(Math.cos(volta) * 0.93, altura, Math.sin(volta) * 0.93);
    partes.push(g);
  }
  return mergeGeometries(partes.map((p) => (p.index ? p.toNonIndexed() : p)))!;
}

export class JazidasRender {
  private readonly lotes = new Map<RecursosId, InstancedMesh>();
  /** ECO-04 (D-89): o corpo de pedra de todas as jazidas. */
  private readonly rochas: InstancedMesh;
  private readonly matriz = new Matrix4();
  private readonly frente = new Vector3();
  private readonly cima = new Vector3();
  private readonly lado = new Vector3();
  private readonly geometria = geometriaDeCristais();
  private readonly corpo = geometriaDoCorpo();
  readonly desenhadas: JazidaDesenhada[] = [];
  private modo = '';

  constructor(
    private readonly scene: Scene,
    corDaRocha: Color = new Color(0.45, 0.44, 0.42),
  ) {
    this.rochas = new InstancedMesh(
      this.corpo,
      new MeshStandardMaterial({ color: corDaRocha, roughness: 0.95, flatShading: true }),
      CAPACIDADE * dados.recursos.length,
    );
    this.rochas.instanceMatrix.setUsage(DynamicDrawUsage);
    this.rochas.castShadow = true;
    this.rochas.receiveShadow = true;
    this.rochas.frustumCulled = false;
    this.rochas.count = 0;
    this.scene.add(this.rochas);
    for (const r of dados.recursos) {
      const cor = new Color(r.cor);
      const material = new MeshStandardMaterial({
        color: cor,
        emissive: cor,
        emissiveIntensity: 0.7,
        roughness: 0.25,
        metalness: 0.1,
        flatShading: true,
      });
      const malha = new InstancedMesh(this.geometria, material, CAPACIDADE);
      malha.instanceMatrix.setUsage(DynamicDrawUsage);
      malha.castShadow = true;
      malha.receiveShadow = true;
      malha.frustumCulled = false;
      malha.count = 0;
      this.scene.add(malha);
      this.lotes.set(r.id, malha);
    }
  }

  /** `explorado`: só as jazidas em área já explorada pelo jogador (VIS-01). */
  sync(state: SimState, explorado: ((id: EntityId) => boolean) | null = null): void {
    // UI-11: a cor do recurso segue a paleta (muda com o modo daltônico).
    const modo = configuracoes.value.daltonismo;
    if (modo !== this.modo) {
      this.modo = modo;
      for (const [recurso, malha] of this.lotes) {
        const material = malha.material as MeshStandardMaterial;
        material.color.set(corDoRecurso(recurso));
        material.emissive.set(corDoRecurso(recurso));
      }
    }
    this.desenhadas.length = 0;
    const usados = new Map<RecursosId, number>();
    let rochas = 0;
    const escalaMax = param('raio_jazida_max_m');
    for (const id of entitiesWith(state, 'jazida', 'position')) {
      if (explorado && !explorado(id)) continue;
      const jazida = getComponent(state, id, 'jazida')!;
      const p = getComponent(state, id, 'position')!;
      const raio = getComponent(state, id, 'obstacle')?.raio ?? escalaMax;
      const r = Math.hypot(p.x, p.y, p.z) || 1;
      const cima: [number, number, number] = [p.x / r, p.y / r, p.z / r];
      this.desenhadas.push({
        id,
        recurso: jazida.recurso,
        x: p.x,
        y: p.y,
        z: p.z,
        cima,
        raio,
        altura: raio * 1.4,
      });
      const malha = this.lotes.get(jazida.recurso)!;
      const k = usados.get(jazida.recurso) ?? 0;
      if (k >= CAPACIDADE) continue;
      usados.set(jazida.recurso, k + 1);
      // Cada jazida girada por um ângulo fixo derivado do ID (variedade sem aleatoriedade).
      const rumo = normalizar(girar(norteEm(cima), cima, id * 2.39996));
      this.cima.set(...cima);
      this.frente.set(...rumo);
      this.lado.crossVectors(this.frente, this.cima);
      this.matriz
        .makeBasis(
          this.frente.multiplyScalar(raio),
          this.cima.multiplyScalar(raio),
          this.lado.multiplyScalar(raio),
        )
        .setPosition(p.x, p.y, p.z);
      malha.setMatrixAt(k, this.matriz);
      this.rochas.setMatrixAt(rochas++, this.matriz);
    }
    this.rochas.count = rochas;
    this.rochas.instanceMatrix.needsUpdate = true;
    for (const [recurso, malha] of this.lotes) {
      malha.count = usados.get(recurso) ?? 0;
      malha.instanceMatrix.needsUpdate = true;
    }
  }
}
