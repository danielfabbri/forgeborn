/**
 * Jazidas como corpos da partida (ECO-04 a ECO-06, D-27): quantidade, vagas, fila e o raio de
 * colisão (MOV-04) que encolhe com a quantidade restante. A navegação só é invalidada quando o
 * conjunto de células bloqueadas pela jazida muda.
 */
import {
  createEntity,
  destroyEntity,
  entitiesWith,
  getComponent,
  isAlive,
  setComponent,
} from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { EntityId, NacaoId } from '../core/types';
import { dados, param, type RecursosId } from '../data';
import { celulasNoRaio } from '../map/conectividade';
import { normalizar, type Vec3 } from '../map/esfera';
import { chaoEm, direcaoDe, posicionar } from '../units/superficie';

export const SEMEAR_JAZIDAS_COMMAND = 'semear_jazidas';

/** ECO-05/D-27: raio (m) da jazida pela fração restante da quantidade inicial. */
export function raioDaJazida(quantidade: number, inicial: number): number {
  const min = param('raio_jazida_min_m');
  const max = param('raio_jazida_max_m');
  const fracao = inicial > 0 ? Math.max(0, Math.min(1, quantidade / inicial)) : 0;
  return min + (max - min) * fracao;
}

export function criarJazida(
  ctx: SystemContext,
  recurso: RecursosId,
  quantidade: number,
  d: Vec3,
): EntityId {
  const { state } = ctx;
  const id = createEntity(state);
  const pos = { x: 0, y: 0, z: 0 };
  posicionar(ctx, pos, d, chaoEm(ctx, d));
  setComponent(state, id, 'position', pos);
  setComponent(state, id, 'jazida', {
    recurso,
    quantidade,
    inicial: quantidade,
    vagas: Array.from({ length: param('slots_por_jazida') }, () => null),
    fila: [],
  });
  setComponent(state, id, 'obstacle', { raio: raioDaJazida(quantidade, quantidade) });
  state.versaoObstaculos++;
  return id;
}

/** Células bloqueadas por um círculo, como texto comparável (ou '' sem mundo). */
function assinaturaDeCelulas(ctx: SystemContext, d: Vec3, raio: number): string {
  if (!ctx.mundo) return '';
  return celulasNoRaio(ctx.mundo.grades.navegacao, d, raio)
    .sort((a, b) => a - b)
    .join(',');
}

/** Atualiza o raio de colisão pela quantidade; sobe a versão de obstáculos só se as células mudarem. */
export function atualizarRaio(ctx: SystemContext, id: EntityId): void {
  const jazida = getComponent(ctx.state, id, 'jazida')!;
  const obstaculo = getComponent(ctx.state, id, 'obstacle')!;
  const novo = raioDaJazida(jazida.quantidade, jazida.inicial);
  if (novo === obstaculo.raio) return;
  const d = direcaoDe(getComponent(ctx.state, id, 'position')!);
  const antes = assinaturaDeCelulas(ctx, d, obstaculo.raio);
  obstaculo.raio = novo;
  if (assinaturaDeCelulas(ctx, d, novo) !== antes) ctx.state.versaoObstaculos++;
}

/** Nações com hovers designados à jazida (vagas e fila). */
function nacoesInteressadas(ctx: SystemContext, id: EntityId): NacaoId[] {
  const jazida = getComponent(ctx.state, id, 'jazida')!;
  const nacoes = new Set<NacaoId>();
  for (const hover of [...jazida.vagas, ...jazida.fila]) {
    if (hover === null) continue;
    const dono = getComponent(ctx.state, hover, 'owner')?.nacao;
    if (dono) nacoes.add(dono);
  }
  return ctx.state.nacoes.filter((n) => nacoes.has(n));
}

/** ECO-05: jazida chegou a 0 — some e dispara AL-07 para quem minerava nela. */
export function esgotar(ctx: SystemContext, id: EntityId): void {
  const jazida = getComponent(ctx.state, id, 'jazida')!;
  const d = direcaoDe(getComponent(ctx.state, id, 'position')!);
  for (const nacao of nacoesInteressadas(ctx, id)) {
    ctx.emit('alerta', { id: 'AL-07', nacao, recurso: jazida.recurso, jazida: id, d });
  }
  destroyEntity(ctx.state, id);
  ctx.state.versaoObstaculos++;
}

/** Vagas livres da jazida. */
export function vagasLivres(jazida: { vagas: Array<EntityId | null> }): number {
  return jazida.vagas.filter((v) => v === null).length;
}

export function jazidaViva(ctx: SystemContext, id: EntityId | null): boolean {
  return (
    id !== null && isAlive(ctx.state, id) && getComponent(ctx.state, id, 'jazida') !== undefined
  );
}

export function todasAsJazidas(ctx: SystemContext): EntityId[] {
  return entitiesWith(ctx.state, 'jazida', 'position');
}

interface JazidaSemeada {
  recurso: RecursosId;
  quantidade: number;
  d: Vec3;
}

const RECURSOS = new Set(dados.recursos.map((r) => r.id));

/** Preparação da partida: cria as jazidas da distribuição (CEN-10). A T-056 dispara no início. */
export const comandosDeJazidas: Record<string, CommandHandler> = {
  [SEMEAR_JAZIDAS_COMMAND]: (ctx, comando) => {
    if (!Array.isArray(comando.dados)) return;
    for (const item of comando.dados as unknown as JazidaSemeada[]) {
      if (!RECURSOS.has(item.recurso) || !(item.quantidade > 0) || !Array.isArray(item.d)) continue;
      criarJazida(ctx, item.recurso, item.quantidade, normalizar(item.d));
    }
  },
};
