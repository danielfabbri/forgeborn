/**
 * Silo Móvel (ECO-22 a ECO-25, D-60). Não ancora: recebe descargas de hovers até
 * `capacidade_silo_u` a qualquer hora, menos enquanto ele mesmo descarrega. Com carga, ao
 * encostar num depósito próprio descarrega sozinho. Ciclo automático: parado e no limiar, vai
 * ao depósito mais próximo, descarrega a `taxa_descarga_silo_u_s` e volta ao mesmo ponto.
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
/** Distância (m) do ponto de volta para considerar o silo de volta. */
const CHEGADA_ANCORA_M = 1;

/** O silo que descarrega fica parado (usado pelo movimento). */
export function siloImovel(silo: { estado: string } | undefined): boolean {
  return silo !== undefined && silo.estado === 'descarregando';
}

/** ECO-22 (D-60): o silo recebe descargas de hovers, menos enquanto descarrega. */
export function siloRecebe(silo: { estado: string } | undefined): boolean {
  return silo !== undefined && silo.estado !== 'descarregando';
}

function raioDe(ctx: SystemContext, id: EntityId): number {
  return statsMovel(getComponent(ctx.state, id, 'unit')!.tipo).raio_m;
}

/** ECO-23 (D-60): o depósito próprio encostado no silo (casco a até `raio_deposito_m`), ou null. */
function depositoEncostado(ctx: SystemContext, id: EntityId): EntityId | null {
  const nacao = getComponent(ctx.state, id, 'owner')!.nacao;
  const d = direcaoDe(getComponent(ctx.state, id, 'position')!);
  for (const p of pontosDeEntrega(ctx, nacao)) {
    if (p.tipo !== 'deposito') continue;
    if (distanciaM(ctx, d, p.d) - p.borda - raioDe(ctx, id) <= param('raio_deposito_m'))
      return p.id;
  }
  return null;
}

function comecarDescarga(ctx: SystemContext, id: EntityId, deposito: EntityId): void {
  const silo = getComponent(ctx.state, id, 'silo')!;
  const loc = getComponent(ctx.state, id, 'locomotion')!;
  silo.estado = 'descarregando';
  silo.entrega = deposito;
  getComponent(ctx.state, id, 'order')!.tipo = 'tarefa';
  loc.destino = null;
  loc.rota = [];
  loc.fluxo = null;
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
    case 'solto': {
      if (cargaDoSilo(silo) <= 1e-9) return;
      // D-60: com carga, encostar num depósito descarrega.
      const deposito = depositoEncostado(ctx, id);
      if (deposito !== null) {
        silo.ancora = null;
        comecarDescarga(ctx, id, deposito);
        return;
      }
      // ECO-24: parado e no limiar, leva a carga e volta a este ponto.
      const limiar = (param('capacidade_silo_u') * silo.limiar_pct) / 100;
      if (silo.cicloAutomatico && !loc.destino && cargaDoSilo(silo) >= limiar - 1e-9) {
        silo.ancora = d;
        ordem.tipo = 'tarefa';
        irDescarregar(ctx, id);
      }
      return;
    }
    case 'indo_descarregar': {
      if (manual) {
        silo.estado = 'solto';
        silo.ancora = null;
        return;
      }
      if (!vivo(state, silo.entrega)) {
        irDescarregar(ctx, id);
        return;
      }
      const deposito = depositoEncostado(ctx, id);
      if (deposito !== null) comecarDescarga(ctx, id, deposito);
      else if (!loc.destino) irDescarregar(ctx, id);
      return;
    }
    case 'descarregando': {
      if (manual || !vivo(state, silo.entrega)) {
        silo.estado = 'solto';
        silo.ancora = null;
        return;
      }
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
        silo.ancora = null;
        return;
      }
      if (silo.ancora && distanciaM(ctx, d, silo.ancora) <= CHEGADA_ANCORA_M) {
        silo.estado = 'solto';
        silo.ancora = null;
        ordem.tipo = 'nenhuma';
        loc.destino = null;
        loc.rota = [];
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
  /** §12.4 G: descarregar agora (o ciclo, fora do limiar). */
  descarregar_silo: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown };
    for (const id of silosDa(ctx, comando.nacao, d.ids)) {
      const silo = getComponent(ctx.state, id, 'silo')!;
      if (cargaDoSilo(silo) <= 0 || silo.estado !== 'solto') continue;
      getComponent(ctx.state, id, 'order')!.tipo = 'tarefa';
      irDescarregar(ctx, id);
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
