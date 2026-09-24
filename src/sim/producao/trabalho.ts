/**
 * Ordens diretas de construir (PRD-13, PRD-16) e reparar (PRD-18, PRD-19). A unidade vai até o
 * alvo, fica a até `raio_deposito_m` da borda (D-29) e trabalha; outra ordem encerra o trabalho.
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
import { liberar, retomarColeta } from '../economia/coleta';
import { emReserva, gastar } from '../energia/bateria';
import { aproximar, folgaAte, noAlcance, pararNoLugar } from './alcance';
import { instalarCanteiro } from './obra';

/** Quem constrói e repara: Impressoras e Hovers de Exploração. */
const ehTrabalhador = (tipo: string): boolean => tipo === 'printer' || tipo === 'hover_explorer';

/** Fim do trabalho: o hover volta à coleta; a Impressora fica parada. */
export function encerrarTrabalho(ctx: SystemContext, id: EntityId): void {
  const { state } = ctx;
  if (!getComponent(state, id, 'trabalho')) return;
  removeComponent(state, id, 'trabalho');
  const ordem = getComponent(state, id, 'order')!;
  if (ordem.tipo !== 'tarefa') return;
  pararNoLugar(ctx, id);
  if (getComponent(state, id, 'coleta')) retomarColeta(ctx, id);
  else ordem.tipo = 'nenhuma';
}

function comecarTrabalho(
  ctx: SystemContext,
  id: EntityId,
  tipo: 'construir' | 'reparar',
  alvo: EntityId,
  auto: boolean,
): void {
  const { state } = ctx;
  const coleta = getComponent(state, id, 'coleta');
  if (coleta) {
    liberar(ctx, id);
    coleta.estado = 'ocioso';
    coleta.jazida = null;
    coleta.manual = false;
  }
  setComponent(state, id, 'trabalho', { tipo, alvo, auto });
  const ordem = getComponent(state, id, 'order')!;
  ordem.tipo = 'tarefa';
  ordem.patrulha = null;
  pararNoLugar(ctx, id);
}

function terminou(ctx: SystemContext, trabalho: { tipo: string; alvo: EntityId }): boolean {
  const { state } = ctx;
  if (!isAlive(state, trabalho.alvo)) return true;
  if (trabalho.tipo === 'construir') return !getComponent(state, trabalho.alvo, 'obra');
  const vida = getComponent(state, trabalho.alvo, 'vida');
  return !vida || vida.hp >= vida.max - 1e-9;
}

/** Deslocamento até o alvo e instalação do canteiro por Impressora (PRD-13, PRD-16). */
function passoTrabalho(ctx: SystemContext): void {
  const { state } = ctx;
  for (const id of entitiesWith(state, 'trabalho', 'position')) {
    const trabalho = getComponent(state, id, 'trabalho')!;
    if (terminou(ctx, trabalho)) {
      encerrarTrabalho(ctx, id);
      continue;
    }
    // Outra ordem (mover, parar, manter, patrulhar) encerra o trabalho.
    if (getComponent(state, id, 'order')!.tipo !== 'tarefa') {
      removeComponent(state, id, 'trabalho');
      continue;
    }
    const recarga = getComponent(state, id, 'recarga');
    if (recarga && recarga.estado !== 'nenhuma') continue;
    const loc = getComponent(state, id, 'locomotion')!;
    if (noAlcance(ctx, id, trabalho.alvo)) {
      if (loc.destino) pararNoLugar(ctx, id);
      const ehImpressora = getComponent(state, id, 'unit')!.tipo === 'printer';
      if (trabalho.tipo === 'construir' && ehImpressora) instalarCanteiro(ctx, trabalho.alvo);
    } else if (!loc.destino) {
      aproximar(ctx, id, trabalho.alvo);
    }
  }
}

/** PRD-19: Impressora ociosa repara a estrutura própria danificada mais próxima no raio. */
function reparoAutomatico(ctx: SystemContext): void {
  const { state } = ctx;
  for (const id of entitiesWith(state, 'producer', 'unit', 'owner')) {
    if (getComponent(state, id, 'producer')!.fila.length > 0) continue;
    if (getComponent(state, id, 'trabalho')) continue;
    if (getComponent(state, id, 'order')!.tipo !== 'nenhuma') continue;
    if (getComponent(state, id, 'locomotion')!.destino) continue;
    const recarga = getComponent(state, id, 'recarga');
    if (recarga && recarga.estado !== 'nenhuma') continue;
    const nacao = getComponent(state, id, 'owner')!.nacao;
    let melhor: EntityId | null = null;
    let melhorFolga = param('raio_reparo_auto_m');
    for (const alvo of entitiesWith(state, 'structure', 'vida', 'owner')) {
      if (getComponent(state, alvo, 'owner')!.nacao !== nacao) continue;
      if (getComponent(state, alvo, 'obra')) continue;
      const vida = getComponent(state, alvo, 'vida')!;
      if (vida.hp >= vida.max - 1e-9) continue;
      const folga = folgaAte(ctx, id, alvo);
      if (folga <= melhorFolga) {
        melhorFolga = folga;
        melhor = alvo;
      }
    }
    if (melhor !== null) comecarTrabalho(ctx, id, 'reparar', melhor, true);
  }
}

/** PRD-18: até `max_reparadores` por alvo, gastando só energia. */
function passoReparo(ctx: SystemContext): void {
  const { state, dt } = ctx;
  const porAlvo = new Map<EntityId, EntityId[]>();
  for (const id of entitiesWith(state, 'trabalho', 'position')) {
    const trabalho = getComponent(state, id, 'trabalho')!;
    if (trabalho.tipo !== 'reparar' || !isAlive(state, trabalho.alvo)) continue;
    const recarga = getComponent(state, id, 'recarga');
    if (recarga && recarga.estado !== 'nenhuma') continue;
    if (getComponent(state, id, 'locomotion')!.destino || emReserva(ctx, id)) continue;
    if (!noAlcance(ctx, id, trabalho.alvo)) continue;
    porAlvo.set(trabalho.alvo, [...(porAlvo.get(trabalho.alvo) ?? []), id]);
  }
  for (const alvo of [...porAlvo.keys()].sort((a, b) => a - b)) {
    // Drones só são reparados pousados.
    const air = getComponent(state, alvo, 'air');
    if (air && air.estado !== 'pousado') continue;
    const vida = getComponent(state, alvo, 'vida')!;
    const estrutura = getComponent(state, alvo, 'structure') !== undefined;
    const reparadores = porAlvo
      .get(alvo)!
      .sort((a, b) => a - b)
      .slice(0, param('max_reparadores'));
    for (const id of reparadores) {
      if (vida.hp >= vida.max - 1e-9) break;
      const impressora = getComponent(state, id, 'unit')!.tipo === 'printer';
      const taxa = impressora
        ? param(estrutura ? 'reparo_impressora_estrutura_hp_s' : 'reparo_impressora_unidade_hp_s')
        : param(estrutura ? 'reparo_hover_estrutura_hp_s' : 'reparo_hover_unidade_hp_s');
      const custo = param(impressora ? 'en_reparo_impressora_s' : 'en_reparo_hover_s') * dt;
      const pago = gastar(ctx, id, custo);
      vida.hp = Math.min(vida.max, vida.hp + taxa * pago * dt);
    }
  }
}

export function passoTrabalhos(ctx: SystemContext): void {
  passoTrabalho(ctx);
  reparoAutomatico(ctx);
}

export { passoReparo };

function trabalhadoresDa(
  ctx: SystemContext,
  nacao: string,
  ids: unknown,
  alvo: EntityId,
): EntityId[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids)]
    .filter((id): id is number => typeof id === 'number' && isAlive(ctx.state, id) && id !== alvo)
    .filter((id) => {
      if (getComponent(ctx.state, id, 'owner')?.nacao !== nacao) return false;
      const tipo = getComponent(ctx.state, id, 'unit')?.tipo;
      return tipo !== undefined && ehTrabalhador(tipo);
    })
    .sort((a, b) => a - b);
}

function alvoProprio(ctx: SystemContext, nacao: string, alvo: unknown): alvo is EntityId {
  return (
    typeof alvo === 'number' &&
    isAlive(ctx.state, alvo) &&
    getComponent(ctx.state, alvo, 'owner')?.nacao === nacao
  );
}

export const comandosDeTrabalho: Record<string, CommandHandler> = {
  /** CTL-07: auxiliar ou retomar um canteiro próprio (PRD-13); só a Impressora instala (PRD-16). */
  construir: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown; alvo?: unknown };
    if (!alvoProprio(ctx, comando.nacao, d.alvo)) return;
    const obra = getComponent(ctx.state, d.alvo, 'obra');
    if (!obra) return;
    for (const id of trabalhadoresDa(ctx, comando.nacao, d.ids, d.alvo)) {
      const impressora = getComponent(ctx.state, id, 'unit')!.tipo === 'printer';
      if (!obra.instalada && !impressora) continue;
      comecarTrabalho(ctx, id, 'construir', d.alvo, false);
    }
  },
  /** PRD-18 (hover G, clique direito em próprio danificado): reparar. */
  reparar: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown; alvo?: unknown };
    if (!alvoProprio(ctx, comando.nacao, d.alvo)) return;
    if (!getComponent(ctx.state, d.alvo, 'vida') || getComponent(ctx.state, d.alvo, 'obra')) return;
    for (const id of trabalhadoresDa(ctx, comando.nacao, d.ids, d.alvo)) {
      comecarTrabalho(ctx, id, 'reparar', d.alvo, false);
    }
  },
};
