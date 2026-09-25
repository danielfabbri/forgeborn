/**
 * Satélite (UNI-04 a UNI-06, VIS-08, ENE-04, REG-17). Pronta a Base de Lançamento, o satélite
 * sobe em `tempo_lancamento_satelite_s` (AL-12); destruir a base o derruba. Em órbita dá visão
 * persistente de `satelite_visao_m` num ponto (começa sobre a base), que se reposiciona em
 * linha reta a `satelite_vel_m_s`, e a Varredura Orbital. A base paga `manutencao_en_s` como
 * consumidor de prioridade 2 e, sem ser atendida por inteiro, fica offline (AL-17).
 */
import type { Ponto } from '../core/components';
import { entitiesWith, getComponent, isAlive } from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { EntityId, NacaoId } from '../core/types';
import { param } from '../data';
import { avancar, tangente } from '../map/esfera';
import { statsEstrutura } from '../units/stats';
import { direcaoDoComando, distanciaM, raioDoMundo } from '../units/superficie';

/** O satélite está dando visão (em órbita e atendido pela rede)? */
export function satelitesAtivos(ctx: SystemContext): Array<{ nacao: NacaoId; ponto: Ponto }> {
  const { state } = ctx;
  return entitiesWith(state, 'satelite', 'owner')
    .filter((id) => {
      const s = getComponent(state, id, 'satelite')!;
      return s.estado === 'orbita' && !getComponent(state, id, 'consumidor')?.offline;
    })
    .map((id) => ({
      nacao: getComponent(state, id, 'owner')!.nacao,
      ponto: getComponent(state, id, 'satelite')!.ponto,
    }));
}

/** Varreduras ativas (VIS-08). */
export function varredurasAtivas(ctx: SystemContext): Array<{ nacao: NacaoId; ponto: Ponto }> {
  const { state } = ctx;
  const lista: Array<{ nacao: NacaoId; ponto: Ponto }> = [];
  for (const id of entitiesWith(state, 'satelite', 'owner')) {
    const v = getComponent(state, id, 'satelite')!.varredura;
    if (v) lista.push({ nacao: getComponent(state, id, 'owner')!.nacao, ponto: v.ponto });
  }
  return lista;
}

export function passoSatelites(ctx: SystemContext): void {
  const { state, dt } = ctx;
  for (const id of entitiesWith(state, 'satelite', 'owner')) {
    const s = getComponent(state, id, 'satelite')!;
    const consumidor = getComponent(state, id, 'consumidor')!;
    const nacao = getComponent(state, id, 'owner')!.nacao;
    if (s.estado === 'lancando') {
      s.timer_s -= dt;
      if (s.timer_s <= 1e-9) {
        s.estado = 'orbita';
        ctx.emit('alerta', { id: 'AL-12', nacao, d: s.ponto });
      }
      continue;
    }
    // ENE-04: manutenção pela rede; offline quando não atendido por inteiro.
    consumidor.demanda_en_s = statsEstrutura('satellite_uplink').manutencao_en_s;
    if (consumidor.offline && !s.offlineAvisado) {
      s.offlineAvisado = true;
      ctx.emit('alerta', { id: 'AL-17', nacao, d: s.ponto });
    } else if (!consumidor.offline) {
      s.offlineAvisado = false;
    }
    if (s.destino) {
      const passo = param('satelite_vel_m_s') * dt;
      const falta = distanciaM(ctx, s.ponto, s.destino);
      if (falta <= passo) {
        s.ponto = s.destino;
        s.destino = null;
      } else {
        const rumo = tangente(s.ponto, s.destino)!;
        s.ponto = avancar(s.ponto, rumo, passo / raioDoMundo(ctx)).p;
      }
    }
    s.recarga_s = Math.max(0, s.recarga_s - dt);
    if (s.varredura) {
      s.varredura.restante_s -= dt;
      if (s.varredura.restante_s <= 0) s.varredura = null;
    }
  }
}

function satelitesDa(ctx: SystemContext, nacao: string, ids: unknown): EntityId[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids)]
    .filter((id): id is number => typeof id === 'number' && isAlive(ctx.state, id))
    .filter(
      (id) =>
        getComponent(ctx.state, id, 'owner')?.nacao === nacao &&
        getComponent(ctx.state, id, 'satelite')?.estado === 'orbita',
    )
    .sort((a, b) => a - b);
}

export const comandosDeSatelite: Record<string, CommandHandler> = {
  /** §12.4 (Base de Lançamento) T: reposicionar o satélite. */
  reposicionar_satelite: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown; x?: unknown; y?: unknown; z?: unknown };
    const alvo = direcaoDoComando(d);
    if (!alvo) return;
    for (const id of satelitesDa(ctx, comando.nacao, d.ids)) {
      getComponent(ctx.state, id, 'satelite')!.destino = alvo;
    }
  },
  /** §12.4 (Base de Lançamento) G: Varredura Orbital, paga do banco (VIS-08). */
  varredura: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown; x?: unknown; y?: unknown; z?: unknown };
    const alvo = direcaoDoComando(d);
    if (!alvo) return;
    const rede = ctx.state.energia[comando.nacao];
    for (const id of satelitesDa(ctx, comando.nacao, d.ids)) {
      const s = getComponent(ctx.state, id, 'satelite')!;
      if (s.recarga_s > 1e-9 || !rede || rede.banco < param('varredura_custo_en')) continue;
      rede.banco -= param('varredura_custo_en');
      s.varredura = { ponto: alvo, restante_s: param('varredura_duracao_s') };
      s.recarga_s = param('varredura_recarga_s');
    }
  },
};
