/**
 * Estoque e pontos de entrega (ECO-10, ECO-14 a ECO-17, ECO-22, ECO-23).
 * Material só vira recurso ao ser descarregado num depósito (Nave ou Armazém); em hovers e
 * silos ele está em trânsito e não pode ser gasto.
 */
import { contar } from '../core/estatisticas';
import { entitiesWith, getComponent, isAlive } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { SimState } from '../core/state';
import type { EntityId, NacaoId } from '../core/types';
import { dados, param, type RecursosId } from '../data';
import { arco, type Vec3 } from '../map/esfera';
import { naRedeComEnergia } from '../energia/cabos';
import { celulaDe } from '../map/grids';
import { fluxoPara } from '../units/navegacao';
import { statsEstrutura } from '../units/stats';
import { direcaoDe, raioDoMundo } from '../units/superficie';

export interface PontoDeEntrega {
  id: EntityId;
  d: Vec3;
  /** Raio da borda (m): o do obstáculo da estrutura ou do corpo do silo. */
  borda: number;
  tipo: 'deposito' | 'silo';
  /** Espaço livre (u); Infinity para depósitos. */
  espaco: number;
}

export function ehDeposito(state: SimState, id: EntityId): boolean {
  const estrutura = getComponent(state, id, 'structure');
  // PRD-12: em obra não recebe descargas.
  if (!estrutura || getComponent(state, id, 'obra')) return false;
  if (!statsEstrutura(estrutura.tipo).deposito) return false;
  // ENE-29 (D-86): o Armazém só recebe descargas numa rede com energia (a Nave sempre).
  return estrutura.tipo === 'ship' || naRedeComEnergia(state, id);
}

export function cargaDoSilo(silo: { carga: Partial<Record<RecursosId, number>> }): number {
  return Object.values(silo.carga).reduce<number>((s, u) => s + (u ?? 0), 0);
}

/** ECO-10: Nave, Armazéns e Silos Móveis parados com espaço da nação. */
export function pontosDeEntrega(ctx: SystemContext, nacao: NacaoId): PontoDeEntrega[] {
  const { state } = ctx;
  const pontos: PontoDeEntrega[] = [];
  for (const id of entitiesWith(state, 'owner', 'position')) {
    if (getComponent(state, id, 'owner')!.nacao !== nacao) continue;
    const d = direcaoDe(getComponent(state, id, 'position')!);
    if (ehDeposito(state, id)) {
      const borda = getComponent(state, id, 'obstacle')?.raio ?? 0;
      pontos.push({ id, d, borda, tipo: 'deposito', espaco: Infinity });
      continue;
    }
    const silo = getComponent(state, id, 'silo');
    // ECO-10 (D-60): a entrega automática vai ao silo parado (não persegue silo andando).
    if (silo && silo.estado === 'solto' && !getComponent(state, id, 'locomotion')?.destino) {
      const espaco = param('capacidade_silo_u') - cargaDoSilo(silo);
      if (espaco <= 0) continue;
      const tipo = getComponent(state, id, 'unit')!.tipo;
      const raio = dados.moveis.find((m) => m.id === tipo)!.raio_m;
      pontos.push({ id, d, borda: raio, tipo: 'silo', espaco });
    }
  }
  return pontos;
}

/**
 * Distância (m) de `de` até `para` pelo caminho de solo (campo de fluxo em cache), ou pelo arco
 * sem mundo. Infinity se não há caminho.
 */
export function distanciaPeloCaminho(ctx: SystemContext, de: Vec3, para: Vec3): number {
  const campo = ctx.mundo ? fluxoPara(ctx, para) : null;
  if (!ctx.mundo || !campo) return raioDoMundo(ctx) * arco(de, para);
  const nav = ctx.mundo.grades.navegacao;
  const custo = campo[celulaDe(nav, de)]!;
  return custo < 0 ? Infinity : (custo * nav.celula_m) / 10;
}

/** O ponto de entrega mais próximo pelo caminho (ECO-10), ou null. */
export function entregaMaisProxima(
  ctx: SystemContext,
  nacao: NacaoId,
  de: Vec3,
): PontoDeEntrega | null {
  let melhor: PontoDeEntrega | null = null;
  let melhorDistancia = Infinity;
  for (const ponto of pontosDeEntrega(ctx, nacao)) {
    const distancia = distanciaPeloCaminho(ctx, de, ponto.d);
    if (distancia < melhorDistancia) {
      melhorDistancia = distancia;
      melhor = ponto;
    }
  }
  return melhor;
}

/** ECO-14: soma ao estoque global da nação. */
export function creditar(state: SimState, nacao: NacaoId, recurso: RecursosId, u: number): void {
  state.estoques[nacao]![recurso] += u;
  // REG-22: pontuação econômica pelo VR descarregado.
  const placar = state.placar[nacao];
  if (placar) placar.vrColetado += u * VR.get(recurso)!;
  const estatisticas = state.estatisticas[nacao];
  if (estatisticas) contar(estatisticas.coletado, recurso, u);
}

const VR = new Map(dados.recursos.map((r) => [r.id, r.vr]));

/** ECO-15: material em trânsito (hovers e silos) de uma nação, por recurso. */
export function emTransito(state: SimState, nacao: NacaoId): Record<RecursosId, number> {
  const total = Object.fromEntries(dados.recursos.map((r) => [r.id, 0])) as Record<
    RecursosId,
    number
  >;
  for (const id of entitiesWith(state, 'owner')) {
    if (getComponent(state, id, 'owner')!.nacao !== nacao) continue;
    const coleta = getComponent(state, id, 'coleta');
    if (coleta?.sucata) {
      for (const [recurso, u] of Object.entries(coleta.sucata)) {
        total[recurso as RecursosId] += u ?? 0;
      }
    } else if (coleta && coleta.cargaRecurso && coleta.carga > 0) {
      total[coleta.cargaRecurso] += coleta.carga;
    }
    const silo = getComponent(state, id, 'silo');
    if (silo) {
      for (const [recurso, u] of Object.entries(silo.carga)) {
        total[recurso as RecursosId] += u ?? 0;
      }
    }
  }
  return total;
}

/** Estoque global (utilizável) de uma nação (ECO-14). */
export function estoque(state: SimState, nacao: NacaoId): Record<RecursosId, number> {
  return { ...state.estoques[nacao]! };
}

export function vivo(state: SimState, id: EntityId | null): id is EntityId {
  return id !== null && isAlive(state, id);
}
