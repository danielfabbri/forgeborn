/**
 * Silo Móvel (ECO-22 a ECO-25). Ancorado, recebe descargas de hovers até `capacidade_silo_u`.
 * Ciclo automático: ao atingir `limiar_pct` da capacidade, desancora, leva a carga ao depósito
 * mais próximo, descarrega a `taxa_descarga_silo_u_s` e volta a ancorar no mesmo ponto.
 * Ordem de movimento do jogador com o silo ancorado: ele desancora e depois obedece.
 */
import { entitiesWith, getComponent } from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { EntityId } from '../core/types';
import { dados, param } from '../data';
import { avancar, norteEm, tangente } from '../map/esfera';
import { statsMovel } from '../units/stats';
import { direcaoDe, distanciaM, raioDoMundo } from '../units/superficie';
import { irPara } from './coleta';
import { cargaDoSilo, creditar, distanciaPeloCaminho, pontosDeEntrega, vivo } from './estoque';

const RECURSOS = dados.recursos.map((r) => r.id);
/** Distância (m) do ponto de âncora para considerar o silo de volta. */
const CHEGADA_ANCORA_M = 1;

/** O silo parado por âncora não anda nem é empurrado (usado pelo movimento). */
export function siloImovel(silo: { estado: string } | undefined): boolean {
  return (
    silo !== undefined &&
    (silo.estado === 'ancorando' ||
      silo.estado === 'ancorado' ||
      silo.estado === 'desancorando' ||
      silo.estado === 'descarregando')
  );
}

function raioDe(ctx: SystemContext, id: EntityId): number {
  return statsMovel(getComponent(ctx.state, id, 'unit')!.tipo).raio_m;
}

function comecarAncorar(ctx: SystemContext, id: EntityId): void {
  const silo = getComponent(ctx.state, id, 'silo')!;
  const loc = getComponent(ctx.state, id, 'locomotion')!;
  const ordem = getComponent(ctx.state, id, 'order')!;
  silo.estado = 'ancorando';
  silo.timer_s = param('tempo_ancorar_silo_s');
  silo.ancora = direcaoDe(getComponent(ctx.state, id, 'position')!);
  ordem.tipo = 'tarefa';
  loc.destino = null;
  loc.rota = [];
  loc.fluxo = null;
}

function comecarDesancorar(ctx: SystemContext, id: EntityId, manterAncora: boolean): void {
  const silo = getComponent(ctx.state, id, 'silo')!;
  silo.estado = 'desancorando';
  silo.timer_s = param('tempo_desancorar_silo_s');
  if (!manterAncora) silo.ancora = null;
}

/** Vai ao depósito (Nave ou Armazém) mais próximo pelo caminho. */
function irDescarregar(ctx: SystemContext, id: EntityId): void {
  const silo = getComponent(ctx.state, id, 'silo')!;
  const nacao = getComponent(ctx.state, id, 'owner')!.nacao;
  const d = direcaoDe(getComponent(ctx.state, id, 'position')!);
  const depositos = pontosDeEntrega(ctx, nacao).filter((p) => p.tipo === 'deposito');
  let melhor = null;
  let melhorDistancia = Infinity;
  for (const p of depositos) {
    const distancia = distanciaPeloCaminho(ctx, d, p.d);
    if (distancia < melhorDistancia) {
      melhorDistancia = distancia;
      melhor = p;
    }
  }
  if (!melhor) {
    silo.estado = 'solto';
    return;
  }
  silo.estado = 'indo_descarregar';
  silo.entrega = melhor.id;
  const rumo = tangente(melhor.d, d) ?? norteEm(melhor.d);
  const distancia = melhor.borda + raioDe(ctx, id) + param('raio_deposito_m') / 2;
  irPara(ctx, id, avancar(melhor.d, rumo, distancia / raioDoMundo(ctx)).p);
}

function passo(ctx: SystemContext, id: EntityId, dt: number): void {
  const { state } = ctx;
  const silo = getComponent(state, id, 'silo')!;
  const ordem = getComponent(state, id, 'order')!;
  const loc = getComponent(state, id, 'locomotion')!;
  const d = direcaoDe(getComponent(state, id, 'position')!);
  const manual = ordem.tipo !== 'tarefa';
  switch (silo.estado) {
    case 'solto':
      return;
    case 'ancorando':
      if (manual) {
        silo.estado = 'solto';
        silo.ancora = null;
        return;
      }
      silo.timer_s -= dt;
      if (silo.timer_s <= 1e-9) silo.estado = 'ancorado';
      return;
    case 'ancorado': {
      if (manual) {
        comecarDesancorar(ctx, id, false);
        return;
      }
      const limiar = (param('capacidade_silo_u') * silo.limiar_pct) / 100;
      if (silo.cicloAutomatico && cargaDoSilo(silo) >= limiar - 1e-9)
        comecarDesancorar(ctx, id, true);
      return;
    }
    case 'desancorando':
      silo.timer_s -= dt;
      if (silo.timer_s > 1e-9) return;
      if (!manual && silo.ancora && cargaDoSilo(silo) > 0) irDescarregar(ctx, id);
      else silo.estado = 'solto';
      return;
    case 'indo_descarregar': {
      if (manual) {
        silo.estado = 'solto';
        return;
      }
      if (!vivo(state, silo.entrega)) {
        irDescarregar(ctx, id);
        return;
      }
      const deposito = silo.entrega;
      const dd = direcaoDe(getComponent(state, deposito, 'position')!);
      const borda = getComponent(state, deposito, 'obstacle')?.raio ?? 0;
      if (distanciaM(ctx, d, dd) - borda - raioDe(ctx, id) <= param('raio_deposito_m')) {
        silo.estado = 'descarregando';
        loc.destino = null;
        loc.rota = [];
      } else if (!loc.destino) {
        irDescarregar(ctx, id);
      }
      return;
    }
    case 'descarregando': {
      // ECO-23: descarrega a `taxa_descarga_silo_u_s`, recurso a recurso, na ordem da tabela.
      const nacao = getComponent(state, id, 'owner')!.nacao;
      let orcamento = param('taxa_descarga_silo_u_s') * dt;
      for (const r of RECURSOS) {
        const u = Math.min(orcamento, silo.carga[r] ?? 0);
        if (u <= 0) continue;
        silo.carga[r] = (silo.carga[r] ?? 0) - u;
        if (silo.carga[r]! <= 1e-9) delete silo.carga[r];
        creditar(state, nacao, r, u);
        orcamento -= u;
        if (orcamento <= 0) break;
      }
      if (cargaDoSilo(silo) > 1e-9) return;
      silo.carga = {};
      silo.entrega = null;
      if (silo.ancora) {
        silo.estado = 'voltando';
        irPara(ctx, id, silo.ancora);
      } else {
        silo.estado = 'solto';
        ordem.tipo = 'nenhuma';
      }
      return;
    }
    case 'voltando':
      if (manual) {
        silo.estado = 'solto';
        return;
      }
      if (silo.ancora && distanciaM(ctx, d, silo.ancora) <= CHEGADA_ANCORA_M) {
        comecarAncorar(ctx, id);
        return;
      }
      if (!loc.destino && silo.ancora) irPara(ctx, id, silo.ancora);
      return;
  }
}

export function passoSilos(ctx: SystemContext): void {
  for (const id of entitiesWith(ctx.state, 'silo', 'position')) passo(ctx, id, ctx.dt);
}

function silosDa(ctx: SystemContext, nacao: string, ids: unknown): EntityId[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids)]
    .filter((id): id is number => typeof id === 'number' && vivo(ctx.state, id))
    .filter(
      (id) =>
        getComponent(ctx.state, id, 'owner')?.nacao === nacao &&
        getComponent(ctx.state, id, 'silo') !== undefined,
    )
    .sort((a, b) => a - b);
}

export const comandosDoSilo: Record<string, CommandHandler> = {
  /** §12.4 T: ancorar ou desancorar. */
  ancorar_silo: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown };
    for (const id of silosDa(ctx, comando.nacao, d.ids)) {
      const silo = getComponent(ctx.state, id, 'silo')!;
      if (silo.estado === 'solto') comecarAncorar(ctx, id);
      else if (silo.estado === 'ancorado') comecarDesancorar(ctx, id, false);
    }
  },
  /** §12.4 G: descarregar agora (o ciclo, fora do limiar). */
  descarregar_silo: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown };
    for (const id of silosDa(ctx, comando.nacao, d.ids)) {
      const silo = getComponent(ctx.state, id, 'silo')!;
      if (cargaDoSilo(silo) <= 0) continue;
      if (silo.estado === 'ancorado') comecarDesancorar(ctx, id, true);
      else if (silo.estado === 'solto') {
        getComponent(ctx.state, id, 'order')!.tipo = 'tarefa';
        irDescarregar(ctx, id);
      }
    }
  },
  /** ECO-24: o jogador liga ou desliga o ciclo e muda o limiar. */
  ciclo_silo: (ctx, comando) => {
    const d = (comando.dados ?? {}) as {
      ids?: unknown;
      automatico?: unknown;
      limiar_pct?: unknown;
    };
    for (const id of silosDa(ctx, comando.nacao, d.ids)) {
      const silo = getComponent(ctx.state, id, 'silo')!;
      if (typeof d.automatico === 'boolean') silo.cicloAutomatico = d.automatico;
      if (typeof d.limiar_pct === 'number' && d.limiar_pct > 0 && d.limiar_pct <= 100) {
        silo.limiar_pct = d.limiar_pct;
      }
    }
  },
};
