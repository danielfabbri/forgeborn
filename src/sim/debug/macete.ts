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
    const estoque = ctx.state.estoques[comando.nacao];
    if (!estoque) return;
    // D-83: "todos" soma a cada recurso ("maistudo").
    const alvos =
      recurso === 'todos' ? dados.recursos : dados.recursos.filter((x) => x.id === recurso);
    for (const r of alvos) estoque[r.id] += param('macete_quantidade');
  },
};
