/**
 * Ordens diretas de construir (PRD-13, PRD-16), reparar (PRD-18, PRD-19) e reciclar (ECO-28).
 * A unidade vai até o alvo, fica a até `raio_deposito_m` da borda (D-29) — ou a até
 * `distancia_mineracao_m` do destroço (D-32) — e trabalha; outra ordem encerra o trabalho.
 */
import {
  destroyEntity,
  entitiesWith,
  getComponent,
  isAlive,
  removeComponent,
  setComponent,
} from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { EntityId } from '../core/types';
import { param, type RecursosId } from '../data';
import { iniciarEntrega, liberar, retomarColeta } from '../economia/coleta';
import { emReserva, gastar } from '../energia/bateria';
import { aproximar, faixaAte, folgaAte, noAlcance, pararNoLugar } from './alcance';
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

/** Faixa de trabalho do tipo: destroço como ponto (D-32); o resto pela borda (D-29). */
function faixaDe(tipo: string): number {
  return param(tipo === 'reciclar' ? 'distancia_mineracao_m' : 'raio_deposito_m');
}

export function comecarTrabalho(
  ctx: SystemContext,
  id: EntityId,
  tipo: 'construir' | 'reparar' | 'reciclar',
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
  if (trabalho.tipo === 'reciclar') return !getComponent(state, trabalho.alvo, 'destroco');
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
    // ECO-13: em fuga, o trabalho espera.
    if (getComponent(state, id, 'fuga')) continue;
    // ECO-28: levando a sucata, o hover volta depois de descarregar.
    const coleta = getComponent(state, id, 'coleta');
    if (coleta && coleta.estado !== 'ocioso') continue;
    const loc = getComponent(state, id, 'locomotion')!;
    const faixa = faixaDe(trabalho.tipo);
    if (noAlcance(ctx, id, trabalho.alvo, faixaAte(ctx, trabalho.alvo, faixa))) {
      if (loc.destino) pararNoLugar(ctx, id);
      const ehImpressora = getComponent(state, id, 'unit')!.tipo === 'printer';
      if (trabalho.tipo === 'construir' && ehImpressora) instalarCanteiro(ctx, trabalho.alvo);
    } else if (!loc.destino) {
      aproximar(ctx, id, trabalho.alvo, faixaAte(ctx, trabalho.alvo, faixa));
    }
  }
}

/** ECO-28: recicla a `taxa_reciclagem_u_s`, na composição do destroço, até `carga_hover_u`. */
function passoReciclagem(ctx: SystemContext): void {
  const { state, dt } = ctx;
  for (const id of entitiesWith(state, 'trabalho', 'coleta')) {
    const trabalho = getComponent(state, id, 'trabalho')!;
    if (trabalho.tipo !== 'reciclar' || !isAlive(state, trabalho.alvo)) continue;
    const coleta = getComponent(state, id, 'coleta')!;
    if (coleta.estado !== 'ocioso' || getComponent(state, id, 'fuga')) continue;
    if (getComponent(state, id, 'locomotion')!.destino || emReserva(ctx, id)) continue;
    if (!noAlcance(ctx, id, trabalho.alvo, faixaDe('reciclar'))) continue;
    const destroco = getComponent(state, trabalho.alvo, 'destroco');
    if (!destroco) continue;
    const entradas = Object.entries(destroco.composicao) as Array<[RecursosId, number]>;
    const restante = entradas.reduce((s, [, u]) => s + u, 0);
    // ENE-10: reciclar gasta `en_reciclar_s`; sem energia, recicla na fração paga.
    const pago = gastar(ctx, id, param('en_reciclar_s') * dt);
    const u = Math.min(
      param('taxa_reciclagem_u_s') * dt * pago,
      param('carga_hover_u') - coleta.carga,
      restante,
    );
    if (u > 1e-12) {
      coleta.sucata ??= {};
      for (const [r, q] of entradas) {
        const parte = (u * q) / restante;
        destroco.composicao[r] = q - parte;
        coleta.sucata[r] = (coleta.sucata[r] ?? 0) + parte;
      }
      coleta.carga += u;
      coleta.cargaRecurso = null;
    }
    const vazio = restante - u <= 1e-9;
    if (vazio) destroyEntity(state, trabalho.alvo);
    if (coleta.carga >= param('carga_hover_u') - 1e-9 || (vazio && coleta.carga > 0)) {
      iniciarEntrega(ctx, id);
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
    if (!noAlcance(ctx, id, trabalho.alvo, faixaAte(ctx, trabalho.alvo))) continue;
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
  passoReciclagem(ctx);
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
  /** ECO-28 (hover F, clique direito num destroço): reciclar — qualquer destroço, de qualquer nação. */
  reciclar: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown; alvo?: unknown };
    if (typeof d.alvo !== 'number' || !getComponent(ctx.state, d.alvo, 'destroco')) return;
    for (const id of trabalhadoresDa(ctx, comando.nacao, d.ids, d.alvo)) {
      if (getComponent(ctx.state, id, 'unit')!.tipo !== 'hover_explorer') continue;
      const coleta = getComponent(ctx.state, id, 'coleta')!;
      comecarTrabalho(ctx, id, 'reciclar', d.alvo, false);
      // Minério a bordo: entrega antes de reciclar.
      if (coleta.carga > 0 && !coleta.sucata) iniciarEntrega(ctx, id);
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
