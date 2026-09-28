/**
 * Usina Nuclear (ENE-06, D-85): sempre ligada, consome `nuclear_consumo_u` de Urânio do estoque
 * a cada `nuclear_intervalo_s`, mesmo com o banco cheio. Sem Urânio gera 0 e dispara AL-10.
 * (A solar, ENE-07, é só geração.)
 */
import { entitiesWith, getComponent } from '../core/entities';
import { direcaoDe } from '../units/superficie';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import { param } from '../data';

export function passoUsinas(ctx: SystemContext): void {
  const { state, dt } = ctx;
  for (const id of entitiesWith(state, 'reator', 'owner')) {
    const reator = getComponent(state, id, 'reator')!;
    // PRD-12: em obra a usina não funciona (nem queima Urânio, nem avisa que falta).
    if (getComponent(state, id, 'obra')) continue;
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

/** ENE-06 (D-85): a Usina Nuclear fica sempre ligada; não há comando de ligar ou desligar. */
export const comandosDasUsinas: Record<string, CommandHandler> = {};
