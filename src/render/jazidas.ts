/**
 * Jazidas desenhadas (ECO-04, ECO-05): afloramentos cristalinos na cor do recurso, um
 * InstancedMesh por recurso, com a escala acompanhando o raio (que encolhe com a quantidade).
 */
import { configuracoes } from '../game/configuracoes';
import { corDoRecurso } from '../game/paleta';
import {
  type BufferGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  type Scene,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dados, type EntityId, entitiesWith, getComponent, param, type SimState } from '../sim';
import type { RecursosId } from '../sim/data';
import { girar, normalizar, norteEm } from '../sim/map/esfera';

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

const CAPACIDADE = 64;

/** Aglomerado de cristais com raio 1 e base em y = 0 (escalado pelo raio da jazida). */
function geometriaDeCristais(): BufferGeometry {
  const partes: BufferGeometry[] = [];
  const cristais: Array<[number, number, number, number, number]> = [
    // x, z, altura, largura, inclinação
    [0, 0, 1.8, 0.45, 0],
    [0.45, 0.2, 1.2, 0.32, 0.35],
    [-0.4, 0.3, 1.0, 0.3, -0.3],
    [0.1, -0.5, 1.3, 0.34, 0.25],
    [-0.35, -0.35, 0.8, 0.26, -0.4],
    [0.55, -0.35, 0.7, 0.24, 0.5],
  ];
  for (const [x, z, h, l, inclinacao] of cristais) {
    const g = new OctahedronGeometry(1, 0);
    g.scale(l, h / 2, l);
    g.rotateZ(inclinacao);
    g.rotateY(x * 2.1 + z);
    g.translate(x, (h / 2) * Math.cos(inclinacao) * 0.9, z);
    partes.push(g);
  }
  return mergeGeometries(partes)!;
}

export class JazidasRender {
  private readonly lotes = new Map<RecursosId, InstancedMesh>();
  private readonly matriz = new Matrix4();
  private readonly frente = new Vector3();
  private readonly cima = new Vector3();
  private readonly lado = new Vector3();
  private readonly geometria = geometriaDeCristais();
  readonly desenhadas: JazidaDesenhada[] = [];
  private modo = '';

  constructor(private readonly scene: Scene) {
    for (const r of dados.recursos) {
      const cor = new Color(r.cor);
      const material = new MeshStandardMaterial({
        color: cor,
        emissive: cor,
        emissiveIntensity: 0.55,
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
        altura: raio * 1.8,
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
    }
    for (const [recurso, malha] of this.lotes) {
      malha.count = usados.get(recurso) ?? 0;
      malha.instanceMatrix.needsUpdate = true;
    }
  }
}
