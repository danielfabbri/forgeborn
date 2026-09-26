/**
 * Modo suporte da Bateria Móvel (ENE-17 a ENE-20): transfere energia para até
 * `bateria_movel_max_alvos` unidades próprias no raio `bateria_movel_raio_m`, a
 * `bateria_movel_taxa_por_alvo_en_s` cada, começando pela de menor %, só abaixo de
 * `bateria_movel_limiar_alvo_pct`. Sem perdas; parada ou em movimento. Quem está recebendo não
 * procura porta (ENE-20). Ao ir recarregar, o suporte para (ENE-19).
 */
import {
  entitiesWith,
  getComponent,
  isAlive,
  removeComponent,
  setComponent,
} from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { EntityId } from '../core/types';
import { param } from '../data';
import { irPara, liberar, retomarColeta } from '../economia/coleta';
import { statsMovel } from '../units/stats';
import { direcaoDe, distanciaM } from '../units/superficie';
import { porcentagem } from './bateria';
import { sairDaEstrutura } from './recarga';

/** D-57: a unidade para de seguir a Bateria Móvel (cheia, sem bateria ou outra ordem). */
function pararDeSeguir(ctx: SystemContext, id: EntityId, retomar: boolean): void {
  removeComponent(ctx.state, id, 'seguirBateria');
  if (!retomar) return;
  const loc = getComponent(ctx.state, id, 'locomotion')!;
  loc.destino = null;
  loc.rota = [];
  if (getComponent(ctx.state, id, 'coleta')) retomarColeta(ctx, id);
  else getComponent(ctx.state, id, 'order')!.tipo = 'nenhuma';
}

/** ENE-18 (D-59): folga (m) entre os cascos de dois corpos móveis. */
function folgaEntre(ctx: SystemContext, a: EntityId, b: EntityId): number {
  const { state } = ctx;
  const raio = (id: EntityId) => statsMovel(getComponent(state, id, 'unit')!.tipo).raio_m;
  return (
    distanciaM(
      ctx,
      direcaoDe(getComponent(state, a, 'position')!),
      direcaoDe(getComponent(state, b, 'position')!),
    ) -
    raio(a) -
    raio(b)
  );
}

/** Vai até `alvo` (móvel) se ainda não está encostado; encostado, para. */
function encostarEm(ctx: SystemContext, id: EntityId, alvo: EntityId): void {
  const loc = getComponent(ctx.state, id, 'locomotion')!;
  const d = direcaoDe(getComponent(ctx.state, alvo, 'position')!);
  if (folgaEntre(ctx, id, alvo) > param('bateria_movel_raio_m') * 0.8) {
    if (!loc.destino || distanciaM(ctx, loc.destino, d) > 2) irPara(ctx, id, d);
  } else if (loc.destino) {
    loc.destino = null;
    loc.rota = [];
  }
}

/** ENE-23 (D-59): a Bateria Móvel mandada a uma unidade vai até ela e a enche; depois para. */
function passoAtendimentos(ctx: SystemContext): void {
  const { state } = ctx;
  for (const fonte of entitiesWith(state, 'suporte', 'position')) {
    const suporte = getComponent(state, fonte, 'suporte')!;
    const alvo = suporte.atender ?? null;
    if (alvo === null) continue;
    const b = isAlive(state, alvo) ? getComponent(state, alvo, 'bateria') : undefined;
    const ordem = getComponent(state, fonte, 'order')!;
    if (ordem.tipo !== 'tarefa' || !b) {
      suporte.atender = null;
      continue;
    }
    if (b.en >= b.max - 1e-9) {
      suporte.atender = null;
      ordem.tipo = 'nenhuma';
      const loc = getComponent(state, fonte, 'locomotion')!;
      loc.destino = null;
      loc.rota = [];
      continue;
    }
    encostarEm(ctx, fonte, alvo);
  }
}

/** D-57: quem foi mandado à Bateria Móvel vai até ela e fica encostado até encher. */
function passoSeguidores(ctx: SystemContext): void {
  const { state } = ctx;
  for (const id of entitiesWith(state, 'seguirBateria', 'position')) {
    const { bateria } = getComponent(state, id, 'seguirBateria')!;
    const b = getComponent(state, id, 'bateria');
    if (getComponent(state, id, 'order')!.tipo !== 'tarefa') {
      pararDeSeguir(ctx, id, false);
      continue;
    }
    if (!isAlive(state, bateria) || !b || b.en >= b.max - 1e-9) {
      pararDeSeguir(ctx, id, true);
      continue;
    }
    encostarEm(ctx, id, bateria);
  }
}

export function passoSuporte(ctx: SystemContext): void {
  const { state, dt } = ctx;
  passoSeguidores(ctx);
  passoAtendimentos(ctx);
  for (const id of entitiesWith(state, 'bateria'))
    getComponent(state, id, 'bateria')!.recebendo = false;
  for (const fonte of entitiesWith(state, 'suporte', 'bateria')) {
    const suporte = getComponent(state, fonte, 'suporte')!;
    suporte.alvos = [];
    const propria = getComponent(state, fonte, 'bateria')!;
    const recarga = getComponent(state, fonte, 'recarga');
    // D-71: o suporte é sempre ativo (para só ao ir recarregar ou sem energia, ENE-19).
    if (propria.en <= 1e-9 || (recarga && recarga.estado !== 'nenhuma')) continue;
    const nacao = getComponent(state, fonte, 'owner')!.nacao;
    const raio = param('bateria_movel_raio_m');
    const limiar = param('bateria_movel_limiar_alvo_pct');
    // D-57: quem veio a esta bateria pelo clique direito vem antes, com qualquer nível.
    const seguidor = (id: EntityId) =>
      getComponent(state, id, 'seguirBateria')?.bateria === fonte || suporte.atender === id;
    const candidatos = entitiesWith(state, 'bateria', 'unit', 'owner')
      .filter((id) => {
        if (id === fonte || getComponent(state, id, 'suporte')) return false;
        if (getComponent(state, id, 'owner')!.nacao !== nacao) return false;
        const b = getComponent(state, id, 'bateria')!;
        if (seguidor(id) ? b.en >= b.max - 1e-9 : porcentagem(b) >= limiar) return false;
        // ENE-18 (D-59): só quem está encostado (casco a casco).
        return folgaEntre(ctx, fonte, id) <= raio;
      })
      .sort(
        (a, b) =>
          Number(seguidor(b)) - Number(seguidor(a)) ||
          porcentagem(getComponent(state, a, 'bateria')!) -
            porcentagem(getComponent(state, b, 'bateria')!) ||
          a - b,
      )
      .slice(0, param('bateria_movel_max_alvos'));
    for (const alvo of candidatos) {
      const b = getComponent(state, alvo, 'bateria')!;
      const en = Math.min(param('bateria_movel_taxa_por_alvo_en_s') * dt, b.max - b.en, propria.en);
      if (en <= 0) continue;
      b.en += en;
      propria.en -= en;
      b.recebendo = true;
      suporte.alvos.push(alvo);
      if (propria.en <= 1e-9) break;
    }
  }
}

export const comandosDeSuporte: Record<string, CommandHandler> = {
  /** ENE-23 (D-59): Bateria Móvel selecionada + clique direito numa unidade própria. */
  carregar_unidade: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown; alvo?: unknown };
    const alvo = d.alvo;
    if (typeof alvo !== 'number' || !isAlive(ctx.state, alvo)) return;
    if (getComponent(ctx.state, alvo, 'owner')?.nacao !== comando.nacao) return;
    if (!getComponent(ctx.state, alvo, 'bateria') || !getComponent(ctx.state, alvo, 'unit')) return;
    if (!Array.isArray(d.ids)) return;
    for (const id of [...new Set(d.ids)].sort((a, b) => Number(a) - Number(b))) {
      if (typeof id !== 'number' || id === alvo || !isAlive(ctx.state, id)) continue;
      if (getComponent(ctx.state, id, 'owner')?.nacao !== comando.nacao) continue;
      const suporte = getComponent(ctx.state, id, 'suporte');
      if (!suporte) continue;
      if (getComponent(ctx.state, id, 'recarga')) sairDaEstrutura(ctx, id);
      suporte.atender = alvo;
      irPara(ctx, id, direcaoDe(getComponent(ctx.state, alvo, 'position')!));
    }
  },
  /** CTL-07/D-57: clique direito na Bateria Móvel própria: ir até ela e encher até 100%. */
  recarregar_na_bateria: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown; bateria?: unknown };
    const fonte = d.bateria;
    if (typeof fonte !== 'number' || !isAlive(ctx.state, fonte)) return;
    if (!getComponent(ctx.state, fonte, 'suporte')) return;
    if (getComponent(ctx.state, fonte, 'owner')?.nacao !== comando.nacao) return;
    if (!Array.isArray(d.ids)) return;
    for (const id of [...new Set(d.ids)].sort((a, b) => Number(a) - Number(b))) {
      if (typeof id !== 'number' || id === fonte || !isAlive(ctx.state, id)) continue;
      if (getComponent(ctx.state, id, 'owner')?.nacao !== comando.nacao) continue;
      if (!getComponent(ctx.state, id, 'bateria') || !getComponent(ctx.state, id, 'locomotion'))
        continue;
      if (getComponent(ctx.state, id, 'recarga')) sairDaEstrutura(ctx, id);
      const coleta = getComponent(ctx.state, id, 'coleta');
      if (coleta) {
        liberar(ctx, id);
        coleta.estado = 'ocioso';
        coleta.jazida = null;
      }
      removeComponent(ctx.state, id, 'trabalho');
      setComponent(ctx.state, id, 'seguirBateria', { bateria: fonte });
      irPara(ctx, id, direcaoDe(getComponent(ctx.state, fonte, 'position')!));
    }
  },
};
