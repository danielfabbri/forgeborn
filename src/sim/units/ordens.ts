/**
 * Ordens de movimento (CTL-07 parcial, CMB-13, PRD-08, MOV-05, MOV-06), todas por Comando
 * serializável (TEC-07). Unidades de outra nação no pedido são ignoradas.
 */
import type { Ponto } from '../core/components';
import { getComponent, isAlive } from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { EntityId, NacaoId, QueuedCommand } from '../core/types';
import { param } from '../data';
import {
  arco,
  avancar,
  normalizar,
  norteEm,
  produtoEscalar,
  produtoVetorial,
  tangente,
  type Vec3,
} from '../map/esfera';
import { celulaDe } from '../map/grids';
import { celulaLivreProxima, centroDoIndice, livre, type Navegavel } from '../map/pathfinding';
import { tracarRota } from './movimento';
import { navegavel } from './navegacao';
import { statsMovel } from './stats';
import { direcaoDe, direcaoDoComando, raioDoMundo } from './superficie';

interface DadosAlvo {
  ids: number[];
  /** Direção do ponto clicado (normalizada aqui). */
  x: number;
  y: number;
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

function livreEm(g: Navegavel, d: Vec3): boolean {
  return livre(g, celulaDe(g.nav, d));
}

/**
 * Lugar de cada unidade no destino, mantendo a disposição relativa do grupo (MOV-06). Os
 * desvios são medidos no plano tangente ao centro do grupo, numa base que acompanha o rumo da
 * viagem, e reaplicados no destino com a base transportada pelo grande círculo.
 */
export function formacao(
  ctx: SystemContext,
  g: Navegavel | null,
  ids: EntityId[],
  alvo: Ponto,
): Ponto[] {
  const { state } = ctx;
  const R = raioDoMundo(ctx);
  const dirs = ids.map((id) => direcaoDe(getComponent(state, id, 'position')!));
  const centro = normalizar(
    dirs.reduce<Vec3>((s, d) => [s[0] + d[0], s[1] + d[1], s[2] + d[2]], [0, 0, 0]),
  );
  const e1 = tangente(centro, alvo) ?? norteEm(centro);
  const e2 = produtoVetorial(centro, e1);
  const desvios = dirs.map((d) => {
    const t = tangente(centro, d);
    const dist = R * arco(centro, d);
    return t
      ? ([dist * produtoEscalar(t, e1), dist * produtoEscalar(t, e2)] as const)
      : ([0, 0] as const);
  });
  const maior = Math.max(...desvios.map(([x, y]) => Math.hypot(x, y)));
  const raioMax = 4 + 3 * Math.sqrt(ids.length);
  const escala = maior > raioMax ? raioMax / maior : 1;
  const viagem = avancar(centro, e1, arco(centro, alvo));
  const f1 = tangente(alvo, viagem.rumo) ?? norteEm(alvo);
  const f2 = produtoVetorial(alvo, f1);
  return ids.map((id, k) => {
    const [x, y] = desvios[k]!;
    const deslocamento: Vec3 = [
      (f1[0] * x + f2[0] * y) * escala,
      (f1[1] * x + f2[1] * y) * escala,
      (f1[2] * x + f2[2] * y) * escala,
    ];
    const comprimento = Math.hypot(...deslocamento);
    const slot: Ponto =
      comprimento < 1e-9 ? alvo : avancar(alvo, normalizar(deslocamento), comprimento / R).p;
    const aerea = statsMovel(getComponent(state, id, 'unit')!.tipo).camada === 'ar';
    if (!g || aerea || livreEm(g, slot)) return slot;
    const celula = celulaLivreProxima(g, slot);
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
          const c = celulaLivreProxima(g, alvo);
          return c >= 0 ? centroDoIndice(g.nav, c) : null;
        })()
      : null;

  ids.forEach((id, k) => {
    const loc = getComponent(state, id, 'locomotion')!;
    const ordem = getComponent(state, id, 'order')!;
    const d = direcaoDe(getComponent(state, id, 'position')!);
    const lugar = lugares[k]!;
    ordem.tipo = patrulha ? 'patrulhar' : 'mover';
    ordem.patrulha = patrulha ? [d, lugar] : null;
    loc.destino = lugar;
    loc.limiteVel = limite;
    loc.travado_s = 0;
    loc.ancora = null;
    if (!aerea(id) && alvoFluxo) {
      loc.fluxo = alvoFluxo;
      loc.rota = [];
    } else {
      tracarRota(g, loc, d, aerea(id));
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
    const alvo = direcaoDoComando(d);
    if (!alvo) return;
    mandarMover(ctx, daNacao(ctx, comando.nacao, d.ids, 'unit'), alvo, d.livre === true, false);
  },
  patrulhar: (ctx, comando) => {
    const d = dadosDe(comando);
    const alvo = direcaoDoComando(d);
    if (!alvo) return;
    mandarMover(ctx, daNacao(ctx, comando.nacao, d.ids, 'unit'), alvo, d.livre === true, true);
  },
  parar: (ctx, comando) =>
    parar(ctx, daNacao(ctx, comando.nacao, dadosDe(comando).ids, 'unit'), false),
  manter_posicao: (ctx, comando) =>
    parar(ctx, daNacao(ctx, comando.nacao, dadosDe(comando).ids, 'unit'), true),
  ponto_de_encontro: (ctx, comando) => {
    const d = dadosDe(comando);
    const alvo = direcaoDoComando(d);
    if (!alvo) return;
    for (const id of daNacao(ctx, comando.nacao, d.ids, 'producer')) {
      getComponent(ctx.state, id, 'producer')!.pontoDeEncontro = alvo;
    }
  },
};
