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

/** D-57: quem foi mandado à Bateria Móvel vai até ela e fica perto até encher. */
function passoSeguidores(ctx: SystemContext): void {
  const { state } = ctx;
  const perto = param('bateria_movel_raio_m') / 2;
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
    const alvo = direcaoDe(getComponent(state, bateria, 'position')!);
    const dist = distanciaM(ctx, direcaoDe(getComponent(state, id, 'position')!), alvo);
    const loc = getComponent(state, id, 'locomotion')!;
    if (dist > perto) {
      if (!loc.destino || distanciaM(ctx, loc.destino, alvo) > perto / 2) irPara(ctx, id, alvo);
    } else if (loc.destino) {
      loc.destino = null;
      loc.rota = [];
    }
  }
}

export function passoSuporte(ctx: SystemContext): void {
  const { state, dt } = ctx;
  passoSeguidores(ctx);
  for (const id of entitiesWith(state, 'bateria'))
    getComponent(state, id, 'bateria')!.recebendo = false;
  for (const fonte of entitiesWith(state, 'suporte', 'bateria')) {
    const suporte = getComponent(state, fonte, 'suporte')!;
    suporte.alvos = [];
    const propria = getComponent(state, fonte, 'bateria')!;
    const recarga = getComponent(state, fonte, 'recarga');
    if (!suporte.ligado || propria.en <= 1e-9 || (recarga && recarga.estado !== 'nenhuma'))
      continue;
    const nacao = getComponent(state, fonte, 'owner')!.nacao;
    const df = direcaoDe(getComponent(state, fonte, 'position')!);
    const raio = param('bateria_movel_raio_m');
    const limiar = param('bateria_movel_limiar_alvo_pct');
    // D-57: quem veio a esta bateria pelo clique direito vem antes, com qualquer nível.
    const seguidor = (id: EntityId) => getComponent(state, id, 'seguirBateria')?.bateria === fonte;
    const candidatos = entitiesWith(state, 'bateria', 'unit', 'owner')
      .filter((id) => {
        if (id === fonte || getComponent(state, id, 'suporte')) return false;
        if (getComponent(state, id, 'owner')!.nacao !== nacao) return false;
        const b = getComponent(state, id, 'bateria')!;
        if (seguidor(id) ? b.en >= b.max - 1e-9 : porcentagem(b) >= limiar) return false;
        return distanciaM(ctx, df, direcaoDe(getComponent(state, id, 'position')!)) <= raio;
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
  /** §12.4 (Bateria Móvel) T: modo suporte liga/desliga. */
  suporte_bateria: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown };
    if (!Array.isArray(d.ids)) return;
    for (const id of [...new Set(d.ids)].sort((a, b) => Number(a) - Number(b))) {
      if (typeof id !== 'number' || !isAlive(ctx.state, id)) continue;
      if (getComponent(ctx.state, id, 'owner')?.nacao !== comando.nacao) continue;
      const suporte = getComponent(ctx.state, id, 'suporte');
      if (suporte) suporte.ligado = !suporte.ligado;
    }
  },
};
