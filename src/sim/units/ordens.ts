/**
 * Ordens de movimento (CTL-07 parcial, CMB-13, PRD-08, MOV-05, MOV-06), todas por Comando
 * serializável (TEC-07). Unidades de outra nação no pedido são ignoradas.
 */
import type { Ponto } from '../core/components';
import { getComponent, isAlive } from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { EntityId, NacaoId, QueuedCommand } from '../core/types';
import { param } from '../data';
import { celulaDe } from '../map/grids';
import { celulaLivreProxima, centroDoIndice, livre, type Navegavel } from '../map/pathfinding';
import { tracarRota } from './movimento';
import { navegavel } from './navegacao';
import { statsMovel } from './stats';

interface DadosAlvo {
  ids: number[];
  x: number;
  z: number;
  /** MOV-06: "mover livre" desliga a velocidade de grupo. */
  livre?: boolean;
}

function dadosDe(comando: QueuedCommand): Partial<DadosAlvo> {
  return (comando.dados ?? {}) as Partial<DadosAlvo>;
}

function daNacao(
  ctx: SystemContext,
  nacao: NacaoId,
  ids: unknown,
  componente: 'unit' | 'producer',
): EntityId[] {
  if (!Array.isArray(ids)) return [];
  const { state } = ctx;
  return [...new Set(ids)]
    .filter((id): id is number => typeof id === 'number' && isAlive(state, id))
    .filter(
      (id) =>
        getComponent(state, id, 'owner')?.nacao === nacao && getComponent(state, id, componente),
    )
    .sort((a, b) => a - b);
}

function livreEm(g: Navegavel, x: number, z: number): boolean {
  const c = celulaDe(g.nav, x, z);
  return c !== null && livre(g, c[1] * g.nav.colunas + c[0]);
}

/** Lugar de cada unidade no destino, mantendo a disposição relativa do grupo (MOV-06). */
export function formacao(
  ctx: SystemContext,
  g: Navegavel | null,
  ids: EntityId[],
  alvo: Ponto,
): Ponto[] {
  const { state } = ctx;
  const posicoes = ids.map((id) => getComponent(state, id, 'position')!);
  const cx = posicoes.reduce((s, p) => s + p.x, 0) / ids.length;
  const cz = posicoes.reduce((s, p) => s + p.z, 0) / ids.length;
  const desvios = posicoes.map((p) => [p.x - cx, p.z - cz] as Ponto);
  const maior = Math.max(...desvios.map(([x, z]) => Math.hypot(x, z)));
  const raioMax = 4 + 3 * Math.sqrt(ids.length);
  const escala = maior > raioMax ? raioMax / maior : 1;
  return ids.map((id, k) => {
    const [dx, dz] = desvios[k]!;
    const slot: Ponto = [alvo[0] + dx * escala, alvo[1] + dz * escala];
    const aerea = statsMovel(getComponent(state, id, 'unit')!.tipo).camada === 'ar';
    if (!g || aerea || livreEm(g, slot[0], slot[1])) return slot;
    const celula = celulaLivreProxima(g, slot[0], slot[1]);
    return celula >= 0 ? centroDoIndice(g.nav, celula) : slot;
  });
}

function mandarMover(
  ctx: SystemContext,
  ids: EntityId[],
  alvo: Ponto,
  livreDeGrupo: boolean,
  patrulha: boolean,
): void {
  if (ids.length === 0) return;
  const { state } = ctx;
  const g = navegavel(ctx);
  const lugares = formacao(ctx, g, ids, alvo);
  const aerea = (id: EntityId) => statsMovel(getComponent(state, id, 'unit')!.tipo).camada === 'ar';
  const limite =
    livreDeGrupo || ids.length < 2
      ? null
      : Math.min(...ids.map((id) => statsMovel(getComponent(state, id, 'unit')!.tipo).vel_m_s));
  const deSolo = ids.filter((id) => !aerea(id));
  const alvoFluxo =
    g && deSolo.length >= param('flow_field_min_unidades')
      ? (() => {
          const c = celulaLivreProxima(g, alvo[0], alvo[1]);
          return c >= 0 ? centroDoIndice(g.nav, c) : null;
        })()
      : null;

  ids.forEach((id, k) => {
    const loc = getComponent(state, id, 'locomotion')!;
    const ordem = getComponent(state, id, 'order')!;
    const pos = getComponent(state, id, 'position')!;
    const lugar = lugares[k]!;
    ordem.tipo = patrulha ? 'patrulhar' : 'mover';
    ordem.patrulha = patrulha ? [[pos.x, pos.z], lugar] : null;
    loc.destino = lugar;
    loc.limiteVel = limite;
    loc.travado_s = 0;
    if (!aerea(id) && alvoFluxo) {
      loc.fluxo = alvoFluxo;
      loc.rota = [];
    } else {
      tracarRota(g, loc, pos.x, pos.z, aerea(id));
    }
  });
}

function parar(ctx: SystemContext, ids: EntityId[], manter: boolean): void {
  for (const id of ids) {
    const loc = getComponent(ctx.state, id, 'locomotion')!;
    const ordem = getComponent(ctx.state, id, 'order')!;
    loc.rota = [];
    loc.destino = null;
    loc.fluxo = null;
    loc.limiteVel = null;
    ordem.tipo = manter ? 'manter' : 'nenhuma';
    ordem.patrulha = null;
  }
}

export const comandosDeMovimento: Record<string, CommandHandler> = {
  mover: (ctx, comando) => {
    const d = dadosDe(comando);
    if (typeof d.x !== 'number' || typeof d.z !== 'number') return;
    mandarMover(
      ctx,
      daNacao(ctx, comando.nacao, d.ids, 'unit'),
      [d.x, d.z],
      d.livre === true,
      false,
    );
  },
  patrulhar: (ctx, comando) => {
    const d = dadosDe(comando);
    if (typeof d.x !== 'number' || typeof d.z !== 'number') return;
    mandarMover(
      ctx,
      daNacao(ctx, comando.nacao, d.ids, 'unit'),
      [d.x, d.z],
      d.livre === true,
      true,
    );
  },
  parar: (ctx, comando) =>
    parar(ctx, daNacao(ctx, comando.nacao, dadosDe(comando).ids, 'unit'), false),
  manter_posicao: (ctx, comando) =>
    parar(ctx, daNacao(ctx, comando.nacao, dadosDe(comando).ids, 'unit'), true),
  ponto_de_encontro: (ctx, comando) => {
    const d = dadosDe(comando);
    if (typeof d.x !== 'number' || typeof d.z !== 'number') return;
    for (const id of daNacao(ctx, comando.nacao, d.ids, 'producer')) {
      getComponent(ctx.state, id, 'producer')!.pontoDeEncontro = [d.x, d.z];
    }
  },
};
