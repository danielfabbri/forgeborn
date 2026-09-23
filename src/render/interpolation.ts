import { type EntityId, entitiesWith, getComponent, type SimState } from '../sim';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Guarda posições e rumos do tick anterior para o render interpolar até o tick atual (TEC-04). */
export class PositionHistory {
  private readonly previous = new Map<EntityId, Vec3>();
  private readonly headings = new Map<EntityId, number>();

  /** Chame logo antes de cada tick da simulação. */
  capture(state: SimState): void {
    this.previous.clear();
    this.headings.clear();
    for (const id of entitiesWith(state, 'position')) {
      const p = getComponent(state, id, 'position')!;
      this.previous.set(id, { x: p.x, y: p.y, z: p.z });
      const loc = getComponent(state, id, 'locomotion');
      if (loc) this.headings.set(id, loc.heading);
    }
  }

  /** Posição entre o tick anterior e o atual; entidades novas aparecem direto na posição atual. */
  interpolate(id: EntityId, current: Vec3, alpha: number, out: Vec3): Vec3 {
    const before = this.previous.get(id) ?? current;
    out.x = before.x + (current.x - before.x) * alpha;
    out.y = before.y + (current.y - before.y) * alpha;
    out.z = before.z + (current.z - before.z) * alpha;
    return out;
  }

  /** Rumo entre o tick anterior e o atual, pelo menor arco. */
  interpolateHeading(id: EntityId, current: number, alpha: number): number {
    const before = this.headings.get(id) ?? current;
    let delta = (current - before) % (2 * Math.PI);
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    return before + delta * alpha;
  }
}
