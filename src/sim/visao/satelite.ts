/**
 * Satélite (UNI-04 a UNI-06, VIS-08, D-51). Pronta a Base de Lançamento, ela cria o satélite,
 * que sobe em `tempo_lancamento_satelite_s` (AL-12). Em órbita ele é um corpo próprio, sem
 * posição no solo: dá visão persistente de `satelite_visao_m` num ponto (começa sobre a base),
 * reposiciona em linha reta a `satelite_vel_m_s` e faz a Varredura Orbital. Tem
 * `satelite_hp` e o laser orbital `sat_laser`, que só atinge outro satélite; só outro satélite
 * o atinge. Não gasta energia (painéis próprios). Destruir a base derruba o satélite.
 */
import type { Ponto } from '../core/components';
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
import { param } from '../data';
import { avancar, tangente } from '../map/esfera';
import { direcaoDoComando, distanciaM, raioDoMundo } from '../units/superficie';
import { armaDe } from '../combate/armas';

/** UNI-04: a base pronta cria o satélite, que começa a subir sobre ela. */
export function lancarSatelite(
  ctx: SystemContext,
  base: EntityId,
  nacao: NacaoId,
  d: Ponto,
): EntityId {
  const id = createEntity(ctx.state);
  setComponent(ctx.state, id, 'owner', { nacao });
  setComponent(ctx.state, id, 'satelite', {
    base,
    estado: 'lancando',
    timer_s: param('tempo_lancamento_satelite_s'),
    ponto: d,
    destino: null,
    recarga_s: 0,
    varredura: null,
    hp: param('satelite_hp'),
    max: param('satelite_hp'),
    recargaArma_s: 0,
    alvo: null,
  });
  return id;
}

const emOrbita = (ctx: SystemContext, id: EntityId) =>
  isAlive(ctx.state, id) && getComponent(ctx.state, id, 'satelite')?.estado === 'orbita';

/** Satélites dando visão (em órbita). */
export function satelitesAtivos(
  ctx: SystemContext,
): Array<{ id: EntityId; nacao: NacaoId; ponto: Ponto }> {
  const { state } = ctx;
  return entitiesWith(state, 'satelite', 'owner')
    .filter((id) => getComponent(state, id, 'satelite')!.estado === 'orbita')
    .map((id) => ({
      id,
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

/** O satélite cai (base destruída ou abatido): some e avisa o dono (AL-18). */
function derrubar(ctx: SystemContext, id: EntityId, por: NacaoId | null): void {
  const s = getComponent(ctx.state, id, 'satelite')!;
  const nacao = getComponent(ctx.state, id, 'owner')!.nacao;
  if (s.estado === 'orbita') {
    ctx.emit('satelite_abatido', { id, nacao, por, d: s.ponto });
    ctx.emit('alerta', { id: 'AL-18', nacao, unidade: 'satellite', d: s.ponto });
  }
  destroyEntity(ctx.state, id);
}

export function passoSatelites(ctx: SystemContext): void {
  const { state, dt } = ctx;
  const arma = armaDe('sat_laser');
  for (const id of entitiesWith(state, 'satelite', 'owner')) {
    if (!isAlive(state, id)) continue;
    const s = getComponent(state, id, 'satelite')!;
    const nacao = getComponent(state, id, 'owner')!.nacao;
    // UNI-05: destruir a base derruba o satélite.
    if (!isAlive(state, s.base) || getComponent(state, s.base, 'owner')?.nacao !== nacao) {
      derrubar(ctx, id, null);
      continue;
    }
    if (s.estado === 'lancando') {
      s.timer_s -= dt;
      if (s.timer_s <= 1e-9) {
        s.estado = 'orbita';
        ctx.emit('alerta', { id: 'AL-12', nacao, d: s.ponto });
      }
      continue;
    }
    // UNI-05: com um alvo escolhido fora do alcance, vai atrás dele.
    if (s.alvo !== null && !emOrbita(ctx, s.alvo)) s.alvo = null;
    if (s.alvo !== null) {
      const ponto = getComponent(state, s.alvo, 'satelite')!.ponto;
      if (distanciaM(ctx, s.ponto, ponto) > arma.alcance_m) s.destino = ponto;
      else s.destino = null;
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

  // Combate orbital: `sat_laser` só atinge satélites inimigos no alcance (medido no solo).
  for (const id of entitiesWith(state, 'satelite', 'owner')) {
    if (!emOrbita(ctx, id)) continue;
    const s = getComponent(state, id, 'satelite')!;
    const nacao = getComponent(state, id, 'owner')!.nacao;
    s.recargaArma_s = Math.max(0, s.recargaArma_s - dt);
    if (s.recargaArma_s > 1e-9) continue;
    const noAlcance = (outro: EntityId) =>
      emOrbita(ctx, outro) &&
      getComponent(state, outro, 'owner')!.nacao !== nacao &&
      distanciaM(ctx, s.ponto, getComponent(state, outro, 'satelite')!.ponto) <= arma.alcance_m;
    let alvo = s.alvo !== null && noAlcance(s.alvo) ? s.alvo : null;
    if (alvo === null) {
      let menor = Infinity;
      for (const outro of entitiesWith(state, 'satelite', 'owner')) {
        if (!noAlcance(outro)) continue;
        const dist = distanciaM(ctx, s.ponto, getComponent(state, outro, 'satelite')!.ponto);
        if (dist < menor) {
          menor = dist;
          alvo = outro;
        }
      }
    }
    if (alvo === null) continue;
    const t = getComponent(state, alvo, 'satelite')!;
    t.hp -= arma.dano;
    s.recargaArma_s = arma.recarga_s ?? 0;
    ctx.emit('disparo', { atirador: id, alvo, arma: arma.id, orbita: true });
    if (t.hp <= 0) derrubar(ctx, alvo, nacao);
  }
}

/** Os satélites dos ids (satélites ou as bases deles) da nação, em órbita. */
function satelitesDa(ctx: SystemContext, nacao: string, ids: unknown): EntityId[] {
  if (!Array.isArray(ids)) return [];
  const pedidos = new Set(ids.filter((id): id is number => typeof id === 'number'));
  return entitiesWith(ctx.state, 'satelite', 'owner').filter((id) => {
    const s = getComponent(ctx.state, id, 'satelite')!;
    return (
      s.estado === 'orbita' &&
      getComponent(ctx.state, id, 'owner')!.nacao === nacao &&
      (pedidos.has(id) || pedidos.has(s.base))
    );
  });
}

export const comandosDeSatelite: Record<string, CommandHandler> = {
  /** §12.4 (Base de Lançamento) T, ou clique direito com o satélite selecionado. */
  reposicionar_satelite: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown; x?: unknown; y?: unknown; z?: unknown };
    const alvo = direcaoDoComando(d);
    if (!alvo) return;
    for (const id of satelitesDa(ctx, comando.nacao, d.ids)) {
      const s = getComponent(ctx.state, id, 'satelite')!;
      s.destino = alvo;
      s.alvo = null;
    }
  },
  /** UNI-05: clique direito num satélite inimigo com o satélite selecionado. */
  atacar_satelite: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown; alvo?: unknown };
    if (typeof d.alvo !== 'number' || !emOrbita(ctx, d.alvo)) return;
    if (getComponent(ctx.state, d.alvo, 'owner')?.nacao === comando.nacao) return;
    for (const id of satelitesDa(ctx, comando.nacao, d.ids)) {
      getComponent(ctx.state, id, 'satelite')!.alvo = d.alvo;
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
