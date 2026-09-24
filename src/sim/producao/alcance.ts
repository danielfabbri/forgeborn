/**
 * Alcance de obra e reparo (D-29): o casco a até `raio_deposito_m` da borda do alvo, a mesma
 * medida da descarga (ECO-11) e do acoplamento (D-28).
 */
import { getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EntityId } from '../core/types';
import { param } from '../data';
import { irPara } from '../economia/coleta';
import { avancar, norteEm, tangente } from '../map/esfera';
import { raioDaPegada } from '../units/criar';
import { statsMovel } from '../units/stats';
import { direcaoDe, distanciaM, raioDoMundo } from '../units/superficie';

/** Raio da borda: a pegada da estrutura (mesmo reservada) ou o casco da unidade. */
export function bordaDe(ctx: SystemContext, id: EntityId): number {
  const estrutura = getComponent(ctx.state, id, 'structure');
  if (estrutura) return raioDaPegada(estrutura.tipo);
  const unidade = getComponent(ctx.state, id, 'unit');
  return unidade ? statsMovel(unidade.tipo).raio_m : 0;
}

/** Espaço entre o casco da unidade e a borda do alvo (m). */
export function folgaAte(ctx: SystemContext, unidade: EntityId, alvo: EntityId): number {
  const du = direcaoDe(getComponent(ctx.state, unidade, 'position')!);
  const da = direcaoDe(getComponent(ctx.state, alvo, 'position')!);
  return distanciaM(ctx, du, da) - bordaDe(ctx, alvo) - bordaDe(ctx, unidade);
}

export function noAlcance(
  ctx: SystemContext,
  unidade: EntityId,
  alvo: EntityId,
  faixa = param('raio_deposito_m'),
): boolean {
  return folgaAte(ctx, unidade, alvo) <= faixa;
}

/** Leva a unidade até o meio da faixa de alcance, do lado de onde ela vem. */
export function aproximar(
  ctx: SystemContext,
  unidade: EntityId,
  alvo: EntityId,
  faixa = param('raio_deposito_m'),
): void {
  const du = direcaoDe(getComponent(ctx.state, unidade, 'position')!);
  const da = direcaoDe(getComponent(ctx.state, alvo, 'position')!);
  const rumo = tangente(da, du) ?? norteEm(da);
  const distancia = bordaDe(ctx, alvo) + bordaDe(ctx, unidade) + faixa / 2;
  irPara(ctx, unidade, avancar(da, rumo, distancia / raioDoMundo(ctx)).p);
}

/** Para a unidade no lugar, mantendo a tarefa. */
export function pararNoLugar(ctx: SystemContext, unidade: EntityId): void {
  const loc = getComponent(ctx.state, unidade, 'locomotion')!;
  loc.destino = null;
  loc.rota = [];
  loc.fluxo = null;
}
