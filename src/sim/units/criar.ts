/**
 * Criação de corpos com os limites da nação (REG-16 a REG-19). Toda criação passa por aqui:
 * uma ordem que excede um limite é recusada e emite o alerta AL-11.
 */
import { createEntity, entitiesWith, getComponent, setComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EntityId, NacaoId } from '../core/types';
import { type EstruturasId, type MoveisId, param } from '../data';
import { norteEm, type Vec3 } from '../map/esfera';
import { ALTURA_HOVER_M, altitudeDrone, ehAerea, statsEstrutura } from './stats';
import { chaoEm, type Posicao, posicionar } from './superficie';

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

function posicao(ctx: SystemContext, d: Vec3, altura: number): Posicao {
  const pos = { x: 0, y: 0, z: 0 };
  posicionar(ctx, pos, d, altura);
  return pos;
}

export function criarUnidade(
  ctx: SystemContext,
  nacao: NacaoId,
  tipo: MoveisId,
  d: Vec3,
): EntityId | null {
  if (!dentroDoLimite(ctx, nacao, 'limite_corpos')) return null;
  const { state } = ctx;
  const id = createEntity(state);
  const aerea = ehAerea(tipo);
  setComponent(state, id, 'owner', { nacao });
  setComponent(state, id, 'unit', { tipo });
  setComponent(
    state,
    id,
    'position',
    posicao(ctx, d, aerea ? altitudeDrone() : chaoEm(ctx, d) + ALTURA_HOVER_M),
  );
  setComponent(state, id, 'locomotion', {
    // Nasce olhando para o norte local (CEN-15).
    rumo: norteEm(d),
    speed: 0,
    rota: [],
    destino: null,
    fluxo: null,
    limiteVel: null,
    ocioso_s: 0,
    travado_s: 0,
    ancora: null,
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
  d: Vec3,
): EntityId | null {
  if (tipo === 'satellite_uplink' && !dentroDoLimite(ctx, nacao, 'limite_bases_lancamento')) {
    return null;
  }
  const { state } = ctx;
  const id = createEntity(state);
  setComponent(state, id, 'owner', { nacao });
  setComponent(state, id, 'structure', { tipo });
  setComponent(state, id, 'position', posicao(ctx, d, chaoEm(ctx, d)));
  // Círculo que cobre a pegada quadrada (MOV-04).
  setComponent(state, id, 'obstacle', { raio: (statsEstrutura(tipo).pegada_m / 2) * Math.SQRT2 });
  if (tipo === 'ship') setComponent(state, id, 'producer', { pontoDeEncontro: null });
  state.versaoObstaculos++;
  return id;
}

export function criarMina(ctx: SystemContext, nacao: NacaoId, d: Vec3): EntityId | null {
  if (!dentroDoLimite(ctx, nacao, 'limite_minas_ativas')) return null;
  const { state } = ctx;
  const id = createEntity(state);
  setComponent(state, id, 'owner', { nacao });
  setComponent(state, id, 'mine', { armada: false });
  setComponent(state, id, 'position', posicao(ctx, d, chaoEm(ctx, d)));
  return id;
}
