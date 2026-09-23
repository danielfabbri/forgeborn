import { type EntityId, entitiesWith, getComponent, type SimState } from '../sim';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Guarda posições e rumos (vetores tangentes) do tick anterior para o render interpolar (TEC-04). */
export class PositionHistory {
  private readonly previous = new Map<EntityId, Vec3>();
  private readonly rumos = new Map<EntityId, [number, number, number]>();

  /** Chame logo antes de cada tick da simulação. */
  capture(state: SimState): void {
    this.previous.clear();
    this.rumos.clear();
    for (const id of entitiesWith(state, 'position')) {
      const p = getComponent(state, id, 'position')!;
      this.previous.set(id, { x: p.x, y: p.y, z: p.z });
      const loc = getComponent(state, id, 'locomotion');
      if (loc) this.rumos.set(id, [loc.rumo[0], loc.rumo[1], loc.rumo[2]]);
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

  /** Rumo entre o tick anterior e o atual (interpolação normalizada dos vetores). */
  interpolateRumo(
    id: EntityId,
    current: readonly [number, number, number],
    alpha: number,
    out: Vec3,
  ): Vec3 {
    const before = this.rumos.get(id) ?? current;
    const x = before[0] + (current[0] - before[0]) * alpha;
    const y = before[1] + (current[1] - before[1]) * alpha;
    const z = before[2] + (current[2] - before[2]) * alpha;
    const len = Math.hypot(x, y, z) || 1;
    out.x = x / len;
    out.y = y / len;
    out.z = z / len;
    return out;
  }
}
