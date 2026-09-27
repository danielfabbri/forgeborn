/**
 * TEC-27 (D-76): macetes para testar as fases. "mais" + recurso soma `macete_quantidade` ao
 * estoque da nação que envia o Comando.
 */
import type { CommandHandler } from '../core/pipeline';
import { dados, param } from '../data';

export const MACETE_COMMAND = 'macete';

export const comandosDeMacete: Record<string, CommandHandler> = {
  [MACETE_COMMAND]: (ctx, comando) => {
    const recurso = (comando.dados as { recurso?: unknown } | null)?.recurso;
    const r = dados.recursos.find((x) => x.id === recurso);
    const estoque = ctx.state.estoques[comando.nacao];
    if (!r || !estoque) return;
    estoque[r.id] += param('macete_quantidade');
  },
};
