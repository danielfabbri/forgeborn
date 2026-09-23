/**
 * Criação de corpos com os limites da nação (REG-16 a REG-19). Toda criação passa por aqui:
 * uma ordem que excede um limite é recusada e emite o alerta AL-11.
 */
import { createEntity, entitiesWith, getComponent, setComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EntityId, NacaoId } from '../core/types';
import { type EstruturasId, type MoveisId, param } from '../data';
import { alturaEm } from '../map/heightmap';
import { ALTURA_HOVER_M, altitudeDrone, ehAerea, statsEstrutura } from './stats';

export type Limite = 'limite_corpos' | 'limite_bases_lancamento' | 'limite_minas_ativas';

function contar(ctx: SystemContext, nacao: NacaoId, limite: Limite): number {
  const { state } = ctx;
  const daNacao = (id: EntityId) => getComponent(state, id, 'owner')?.nacao === nacao;
  switch (limite) {
    case 'limite_corpos':
      return entitiesWith(state, 'unit', 'owner').filter(daNacao).length;
    case 'limite_bases_lancamento':
      return entitiesWith(state, 'structure', 'owner').filter(
        (id) => daNacao(id) && getComponent(state, id, 'structure')!.tipo === 'satellite_uplink',
      ).length;
    case 'limite_minas_ativas':
      return entitiesWith(state, 'mine', 'owner').filter(daNacao).length;
  }
}

/** REG-19: true se cabe mais um; senão emite AL-11 e devolve false. */
export function dentroDoLimite(ctx: SystemContext, nacao: NacaoId, limite: Limite): boolean {
  if (contar(ctx, nacao, limite) < param(limite)) return true;
  ctx.emit('alerta', { id: 'AL-11', nacao, limite });
  return false;
}

function chao(ctx: SystemContext, x: number, z: number): number {
  return ctx.mundo ? alturaEm(ctx.mundo.mapa, x, z) : 0;
}

export function criarUnidade(
  ctx: SystemContext,
  nacao: NacaoId,
  tipo: MoveisId,
  x: number,
  z: number,
): EntityId | null {
  if (!dentroDoLimite(ctx, nacao, 'limite_corpos')) return null;
  const { state } = ctx;
  const id = createEntity(state);
  const aerea = ehAerea(tipo);
  setComponent(state, id, 'owner', { nacao });
  setComponent(state, id, 'unit', { tipo });
  setComponent(state, id, 'position', {
    x,
    y: aerea ? altitudeDrone() : chao(ctx, x, z) + ALTURA_HOVER_M,
    z,
  });
  setComponent(state, id, 'locomotion', {
    heading: 0,
    speed: 0,
    rota: [],
    destino: null,
    fluxo: null,
    limiteVel: null,
    ocioso_s: 0,
    travado_s: 0,
  });
  setComponent(state, id, 'order', { tipo: 'nenhuma', patrulha: null });
  if (aerea) setComponent(state, id, 'air', { estado: 'voando', timer_s: 0 });
  if (tipo === 'printer') setComponent(state, id, 'producer', { pontoDeEncontro: null });
  return id;
}

export function criarEstrutura(
  ctx: SystemContext,
  nacao: NacaoId,
  tipo: EstruturasId,
  x: number,
  z: number,
): EntityId | null {
  if (tipo === 'satellite_uplink' && !dentroDoLimite(ctx, nacao, 'limite_bases_lancamento')) {
    return null;
  }
  const { state } = ctx;
  const id = createEntity(state);
  setComponent(state, id, 'owner', { nacao });
  setComponent(state, id, 'structure', { tipo });
  setComponent(state, id, 'position', { x, y: chao(ctx, x, z), z });
  // Círculo que cobre a pegada quadrada (MOV-04).
  setComponent(state, id, 'obstacle', { raio: (statsEstrutura(tipo).pegada_m / 2) * Math.SQRT2 });
  if (tipo === 'ship') setComponent(state, id, 'producer', { pontoDeEncontro: null });
  state.versaoObstaculos++;
  return id;
}

export function criarMina(
  ctx: SystemContext,
  nacao: NacaoId,
  x: number,
  z: number,
): EntityId | null {
  if (!dentroDoLimite(ctx, nacao, 'limite_minas_ativas')) return null;
  const { state } = ctx;
  const id = createEntity(state);
  setComponent(state, id, 'owner', { nacao });
  setComponent(state, id, 'mine', { armada: false });
  setComponent(state, id, 'position', { x, y: chao(ctx, x, z), z });
  return id;
}
