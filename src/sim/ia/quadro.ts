/** O que a IA sabe de si e do mundo numa decisão (IA-02: inimigos só pela própria névoa). */
import type { Ponto } from '../core/components';
import { getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EstadoDaIa } from '../core/state';
import type { EntityId, NacaoId } from '../core/types';
import { param, type RecursosId } from '../data';
import { jazidasElegiveis } from '../economia/diretiva';
import {
  centroDaBase,
  dificuldade,
  dosTipos,
  inimigosVisiveis,
  type Nivel,
  proprios,
  temTraco,
  tipoDe,
} from './base';

export interface Quadro {
  nacao: NacaoId;
  ia: EstadoDaIa;
  nivel: Nivel;
  base: Ponto;
  naves: EntityId[];
  impressoras: EntityId[];
  hovers: EntityId[];
  /** Unidades móveis armadas (o exército). */
  exercito: EntityId[];
  inimigos: EntityId[];
  /** Itens nas filas de todos os produtores da nação, por tipo. */
  naFila: Record<string, number>;
  minutos: number;
  /** Recursos que a nação consegue obter agora: com jazida elegível (ECO-19) ou já minerados. */
  acessiveis: Set<RecursosId>;
}

export function montarQuadro(ctx: SystemContext, nacao: NacaoId): Quadro | null {
  const { state } = ctx;
  const ia = state.ias[nacao]!;
  const base = centroDaBase(state, nacao);
  if (!base) return null;
  const naFila: Record<string, number> = {};
  for (const id of proprios(state, nacao)) {
    for (const item of getComponent(state, id, 'producer')?.fila ?? []) {
      naFila[item.item] = (naFila[item.item] ?? 0) + 1;
    }
  }
  return {
    nacao,
    ia,
    nivel: ia.nivel,
    base,
    naves: dosTipos(state, nacao, 'ship'),
    impressoras: dosTipos(state, nacao, 'printer'),
    hovers: dosTipos(state, nacao, 'hover_explorer'),
    exercito: proprios(state, nacao).filter(
      (id) => getComponent(state, id, 'unit') && getComponent(state, id, 'arma'),
    ),
    inimigos: inimigosVisiveis(ctx, nacao),
    naFila,
    minutos: (ctx.tick * ctx.dt) / 60,
    acessiveis: new Set([
      ...jazidasElegiveis(ctx, nacao).map((j) => getComponent(state, j, 'jazida')!.recurso),
      ...dosTipos(state, nacao, 'hover_explorer')
        .map((h) => getComponent(state, h, 'coleta')!.recurso)
        .filter((r): r is RecursosId => r !== null),
    ]),
  };
}

/** Meta de hovers da dificuldade, com o traço "meta de hovers" (IA-07). */
export function metaDeHovers(q: Quadro): number {
  const meta = dificuldade(q.nivel, 'meta_hovers');
  const traco = temTraco(q.nacao, 'meta de hovers') ? param('ia_traco_meta_hovers_pct') / 100 : 0;
  return Math.round(meta * (1 + traco));
}

export function contar(q: Quadro, tipo: string, ids: readonly EntityId[], ctx: SystemContext) {
  return ids.filter((id) => tipoDe(ctx.state, id) === tipo).length + (q.naFila[tipo] ?? 0);
}
