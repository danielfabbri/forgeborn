/**
 * IA dos oponentes (§13). O sistema `ia` roda cada IA a cada `reacao_s` da dificuldade; o
 * Estrategista escolhe a postura a cada `ia_intervalo_estrategista_s`. Os módulos só enfileiram
 * Comandos (TEC-07) e só enxergam pela névoa da própria nação (IA-02).
 */
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { EstadoDaIa } from '../core/state';
import { param } from '../data';
import { atualizarMemoria, dificuldade, type Nivel, niveis } from './base';
import { decidirBatedor } from './batedor';
import { decidirEconomia } from './economia';
import { decidirMilitar } from './militar';
import { CATEGORIAS, decidirProducao, observar, prioridades } from './producao';
import { metaDeHovers, montarQuadro, type Quadro } from './quadro';

export { bonusDaNacao, dificuldade, niveis, type Nivel } from './base';
export { pesos, prioridades } from './producao';

export const ATIVAR_IA_COMMAND = 'ativar_ia';

/**
 * IA-01: o Estrategista escolhe a postura global — atacar com uma onda em curso, fortalecer a
 * economia abaixo da meta de hovers, armar depois dela (a defesa é decidida pelo Militar).
 */
function estrategista(q: Quadro): EstadoDaIa['postura'] {
  if (q.ia.onda) return 'atacar';
  if (q.hovers.length < metaDeHovers(q)) return 'economia';
  return 'armar';
}

export function sistemaIa(ctx: SystemContext): void {
  const { state } = ctx;
  const agora = ctx.tick * ctx.dt;
  for (const nacao of state.nacoes) {
    const ia = state.ias[nacao];
    if (!ia || state.placar[nacao]?.eliminada || state.resultado) continue;
    if (agora + 1e-9 < ia.proxima_s) continue;
    ia.proxima_s = agora + dificuldade(ia.nivel, 'reacao_s');
    atualizarMemoria(ctx, nacao);
    const q = montarQuadro(ctx, nacao);
    if (!q) continue;
    observar(ctx, q);
    if (agora + 1e-9 >= ia.proximoEstrategista_s) {
      ia.proximoEstrategista_s = agora + param('ia_intervalo_estrategista_s');
      if (ia.postura !== 'defender' || !ia.onda) ia.postura = estrategista(q);
    }
    // A próxima compra militar também conta para o remanejamento da coleta.
    const militar = prioridades(ctx, q)
      .slice(0, 1)
      .map((c) => CATEGORIAS[c]);
    decidirEconomia(ctx, q, militar);
    decidirProducao(ctx, q);
    decidirMilitar(ctx, q);
    decidirBatedor(ctx, q);
  }
}

export const comandosDaIa: Record<string, CommandHandler> = {
  /** Põe a nação que envia sob controle da IA no nível dado (§13.2). */
  [ATIVAR_IA_COMMAND]: (ctx, comando) => {
    const nivel = (comando.dados as { nivel?: unknown } | null)?.nivel;
    if (!niveis().includes(nivel as Nivel)) return;
    ctx.state.ias[comando.nacao] = {
      nivel: nivel as Nivel,
      proxima_s: 0,
      proximoEstrategista_s: 0,
      postura: 'economia',
      conhecidas: {},
      observado: {},
      onda: null,
      visitados: [],
    };
  },
};
