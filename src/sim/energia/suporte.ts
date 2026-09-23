/**
 * Modo suporte da Bateria Móvel (ENE-17 a ENE-20): transfere energia para até
 * `bateria_movel_max_alvos` unidades próprias no raio `bateria_movel_raio_m`, a
 * `bateria_movel_taxa_por_alvo_en_s` cada, começando pela de menor %, só abaixo de
 * `bateria_movel_limiar_alvo_pct`. Sem perdas; parada ou em movimento. Quem está recebendo não
 * procura porta (ENE-20). Ao ir recarregar, o suporte para (ENE-19).
 */
import { entitiesWith, getComponent, isAlive } from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import { param } from '../data';
import { direcaoDe, distanciaM } from '../units/superficie';
import { porcentagem } from './bateria';

export function passoSuporte(ctx: SystemContext): void {
  const { state, dt } = ctx;
  for (const id of entitiesWith(state, 'bateria'))
    getComponent(state, id, 'bateria')!.recebendo = false;
  for (const fonte of entitiesWith(state, 'suporte', 'bateria')) {
    const suporte = getComponent(state, fonte, 'suporte')!;
    suporte.alvos = [];
    const propria = getComponent(state, fonte, 'bateria')!;
    const recarga = getComponent(state, fonte, 'recarga');
    if (!suporte.ligado || propria.en <= 1e-9 || (recarga && recarga.estado !== 'nenhuma'))
      continue;
    const nacao = getComponent(state, fonte, 'owner')!.nacao;
    const df = direcaoDe(getComponent(state, fonte, 'position')!);
    const raio = param('bateria_movel_raio_m');
    const limiar = param('bateria_movel_limiar_alvo_pct');
    const candidatos = entitiesWith(state, 'bateria', 'unit', 'owner')
      .filter(
        (id) =>
          id !== fonte &&
          !getComponent(state, id, 'suporte') &&
          getComponent(state, id, 'owner')!.nacao === nacao &&
          porcentagem(getComponent(state, id, 'bateria')!) < limiar &&
          distanciaM(ctx, df, direcaoDe(getComponent(state, id, 'position')!)) <= raio,
      )
      .sort(
        (a, b) =>
          porcentagem(getComponent(state, a, 'bateria')!) -
            porcentagem(getComponent(state, b, 'bateria')!) || a - b,
      )
      .slice(0, param('bateria_movel_max_alvos'));
    for (const alvo of candidatos) {
      const b = getComponent(state, alvo, 'bateria')!;
      const en = Math.min(param('bateria_movel_taxa_por_alvo_en_s') * dt, b.max - b.en, propria.en);
      if (en <= 0) continue;
      b.en += en;
      propria.en -= en;
      b.recebendo = true;
      suporte.alvos.push(alvo);
      if (propria.en <= 1e-9) break;
    }
  }
}

export const comandosDeSuporte: Record<string, CommandHandler> = {
  /** §12.4 (Bateria Móvel) T: modo suporte liga/desliga. */
  suporte_bateria: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown };
    if (!Array.isArray(d.ids)) return;
    for (const id of [...new Set(d.ids)].sort((a, b) => Number(a) - Number(b))) {
      if (typeof id !== 'number' || !isAlive(ctx.state, id)) continue;
      if (getComponent(ctx.state, id, 'owner')?.nacao !== comando.nacao) continue;
      const suporte = getComponent(ctx.state, id, 'suporte');
      if (suporte) suporte.ligado = !suporte.ligado;
    }
  },
};
