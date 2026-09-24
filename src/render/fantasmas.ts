/**
 * Fantasmas (VIS-04): memória, do lado do jogador, das estruturas inimigas vistas. Fora da
 * visão, a estrutura aparece como fantasma com o tipo, a posição e o HP da última observação;
 * o fantasma some quando a área volta a ser vista e a estrutura não existe mais.
 */
import { type EntityId, entitiesWith, getComponent } from '../sim';
import type { SystemContext } from '../sim/core/pipeline';
import { estadoEm, VISIVEL, visivelPara } from '../sim/visao/nevoa';

export interface Fantasma {
  id: EntityId;
  tipo: string;
  nacao: string;
  x: number;
  y: number;
  z: number;
  hp: number;
  max: number;
}

export class MemoriaDeFantasmas {
  private readonly memoria = new Map<EntityId, Fantasma>();

  atualizar(ctx: SystemContext, jogador: string): void {
    const { state } = ctx;
    for (const id of entitiesWith(state, 'structure', 'owner', 'position', 'vida')) {
      const nacao = getComponent(state, id, 'owner')!.nacao;
      if (nacao === jogador || !visivelPara(ctx, jogador as never, id)) continue;
      const p = getComponent(state, id, 'position')!;
      const vida = getComponent(state, id, 'vida')!;
      this.memoria.set(id, {
        id,
        tipo: getComponent(state, id, 'structure')!.tipo,
        nacao,
        x: p.x,
        y: p.y,
        z: p.z,
        hp: vida.hp,
        max: vida.max,
      });
    }
    for (const [id, f] of this.memoria) {
      const r = Math.hypot(f.x, f.y, f.z);
      const lugarVisivel = estadoEm(ctx, jogador as never, [f.x / r, f.y / r, f.z / r]) === VISIVEL;
      const existe = state.entities.includes(id);
      if (lugarVisivel && (!existe || !visivelPara(ctx, jogador as never, id)))
        this.memoria.delete(id);
    }
  }

  /** Fantasmas a desenhar: os lembrados que não estão visíveis agora. */
  visiveis(ctx: SystemContext, jogador: string): Fantasma[] {
    return [...this.memoria.values()].filter(
      (f) => !ctx.state.entities.includes(f.id) || !visivelPara(ctx, jogador as never, f.id),
    );
  }
}
