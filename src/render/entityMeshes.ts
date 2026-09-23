import { BoxGeometry, Mesh, MeshStandardMaterial, type Scene } from 'three';
import { dados, type EntityId, entitiesWith, getComponent, type SimState } from '../sim';
import type { PositionHistory, Vec3 } from './interpolation';

/**
 * Um mesh por entidade com posição, colorido pela nação dona.
 * Provisório: modelos placeholder e instancing chegam na T-020.
 */
export class EntityMeshes {
  private readonly scene: Scene;
  /** Altura do terreno em (x, z): até o movimento da simulação cuidar do y (T-022). */
  private readonly alturaDoTerreno: ((x: number, z: number) => number) | undefined;
  private readonly meshes = new Map<EntityId, Mesh>();
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private readonly geometry = new BoxGeometry(2, 1, 3);
  private readonly scratch: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(scene: Scene, alturaDoTerreno?: (x: number, z: number) => number) {
    this.scene = scene;
    this.alturaDoTerreno = alturaDoTerreno;
  }

  sync(state: SimState, history: PositionHistory, alpha: number): void {
    const alive = new Set<EntityId>();
    for (const id of entitiesWith(state, 'position')) {
      alive.add(id);
      let mesh = this.meshes.get(id);
      if (!mesh) {
        mesh = new Mesh(this.geometry, this.material(getComponent(state, id, 'owner')?.nacao));
        this.scene.add(mesh);
        this.meshes.set(id, mesh);
      }
      const p = history.interpolate(id, getComponent(state, id, 'position')!, alpha, this.scratch);
      // MOV-01: hovers flutuam ~0,6 m acima do terreno; o bloco tem 1 m de altura.
      const chao = this.alturaDoTerreno ? this.alturaDoTerreno(p.x, p.z) : p.y;
      mesh.position.set(p.x, chao + 0.6 + 0.5, p.z);
    }
    for (const [id, mesh] of this.meshes) {
      if (!alive.has(id)) {
        this.scene.remove(mesh);
        this.meshes.delete(id);
      }
    }
  }

  get(id: EntityId): Mesh | undefined {
    return this.meshes.get(id);
  }

  private material(nacao: string | undefined): MeshStandardMaterial {
    const cor = dados.nacoes.find((n) => n.id === nacao)?.cor ?? '#888888';
    let material = this.materials.get(cor);
    if (!material) {
      material = new MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 0.25 });
      this.materials.set(cor, material);
    }
    return material;
  }
}
