/**
 * Usina Nuclear (ENE-06): consome `nuclear_consumo_u` de Urânio do estoque a cada
 * `nuclear_intervalo_s` enquanto ligada, mesmo com o banco cheio. Sem Urânio gera 0 e dispara
 * AL-10. Desligar é imediato; religar leva `nuclear_religar_s`. (A solar, ENE-07, é só geração.)
 */
import { entitiesWith, getComponent, isAlive } from '../core/entities';
import { direcaoDe } from '../units/superficie';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import { param } from '../data';

export function passoUsinas(ctx: SystemContext): void {
  const { state, dt } = ctx;
  for (const id of entitiesWith(state, 'reator', 'owner')) {
    const reator = getComponent(state, id, 'reator')!;
    if (!reator.ligado) continue;
    if (reator.religando_s > 0) {
      reator.religando_s = Math.max(0, reator.religando_s - dt);
      continue;
    }
    const nacao = getComponent(state, id, 'owner')!.nacao;
    // Queima o ciclo corrente; se acabou, abastece com o próximo (geração contínua).
    reator.ciclo_s = Math.max(0, reator.ciclo_s - dt);
    if (reator.ciclo_s > 1e-9) continue;
    const estoque = state.estoques[nacao]!;
    const consumo = param('nuclear_consumo_u');
    if (estoque.u >= consumo - 1e-9) {
      estoque.u -= consumo;
      reator.ciclo_s = param('nuclear_intervalo_s');
      reator.semUranio = false;
    } else if (!reator.semUranio) {
      reator.semUranio = true;
      ctx.emit('alerta', {
        id: 'AL-10',
        nacao,
        usina: id,
        d: direcaoDe(getComponent(state, id, 'position')!),
      });
    }
  }
}

export const comandosDasUsinas: Record<string, CommandHandler> = {
  /** §12.4 (Usina Nuclear) T: ligar ou desligar. */
  ligar_usina: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown };
    if (!Array.isArray(d.ids)) return;
    const ids = [...new Set(d.ids)]
      .filter((id): id is number => typeof id === 'number' && isAlive(ctx.state, id))
      .filter((id) => getComponent(ctx.state, id, 'owner')?.nacao === comando.nacao)
      .sort((a, b) => a - b);
    for (const id of ids) {
      const reator = getComponent(ctx.state, id, 'reator');
      if (!reator) continue;
      if (reator.ligado) {
        reator.ligado = false;
      } else {
        reator.ligado = true;
        reator.religando_s = param('nuclear_religar_s');
      }
    }
  },
};
