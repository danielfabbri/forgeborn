/**
 * Portas de recarga e auto-recarga (ENE-12 a ENE-16, D-28).
 *
 * A unidade escolhe a estrutura com portas de menor tempo estimado (deslocamento + fila), acopla
 * com o casco a até `raio_deposito_m` da borda, espera em fila por ordem de chegada e desacopla
 * com 100% ou ao receber outra ordem. Depois da auto-recarga: o hover volta à coleta, a
 * Impressora à impressão (M5) e as demais unidades ao lugar (e à patrulha) de onde saíram.
 */
import { entitiesWith, getComponent, isAlive, removeComponent } from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { EntityId } from '../core/types';
import { param } from '../data';
import { avancar, norteEm, tangente } from '../map/esfera';
import { irPara, liberar, retomarColeta } from '../economia/coleta';
import { distanciaPeloCaminho } from '../economia/estoque';
import { siloImovel } from '../economia/silo';
import { tracarRota } from '../units/movimento';
import { navegavelDe } from '../units/navegacao';
import { statsEstrutura, statsMovel } from '../units/stats';
import { direcaoDe, distanciaM, raioDoMundo } from '../units/superficie';
import { emCombate } from '../combate/dano';
import { limiarDeRecarga, papelDe, porcentagem } from './bateria';

function raioDe(ctx: SystemContext, id: EntityId): number {
  return statsMovel(getComponent(ctx.state, id, 'unit')!.tipo).raio_m;
}

/** Folga entre o casco da unidade e a borda da estrutura. */
function folga(ctx: SystemContext, unidade: EntityId, estrutura: EntityId): number {
  const du = direcaoDe(getComponent(ctx.state, unidade, 'position')!);
  const de = direcaoDe(getComponent(ctx.state, estrutura, 'position')!);
  const borda = getComponent(ctx.state, estrutura, 'obstacle')?.raio ?? 0;
  return distanciaM(ctx, du, de) - borda - raioDe(ctx, unidade);
}

/** EN que falta às unidades acopladas e na fila da estrutura. */
function energiaPendente(ctx: SystemContext, estrutura: EntityId): number {
  const portas = getComponent(ctx.state, estrutura, 'portas')!;
  let total = 0;
  for (const u of [...portas.ocupantes, ...portas.fila]) {
    if (u === null) continue;
    const b = getComponent(ctx.state, u, 'bateria');
    if (b) total += b.max - b.en;
  }
  return total;
}

/** ENE-13: tempo estimado (s) = deslocamento + espera na fila. */
function tempoEstimado(ctx: SystemContext, unidade: EntityId, estrutura: EntityId): number {
  const du = direcaoDe(getComponent(ctx.state, unidade, 'position')!);
  const de = direcaoDe(getComponent(ctx.state, estrutura, 'position')!);
  const vel = statsMovel(getComponent(ctx.state, unidade, 'unit')!.tipo).vel_m_s;
  const deslocamento = distanciaPeloCaminho(ctx, du, de) / vel;
  const portas = getComponent(ctx.state, estrutura, 'portas')!;
  const livre = portas.ocupantes.includes(null) && portas.fila.length === 0;
  const tipo = getComponent(ctx.state, estrutura, 'structure')!.tipo;
  const vazao = portas.ocupantes.length * statsEstrutura(tipo).taxa_porta_en_s;
  const espera = livre ? 0 : energiaPendente(ctx, estrutura) / vazao;
  return deslocamento + espera;
}

function estruturaDeRecarga(ctx: SystemContext, unidade: EntityId): EntityId | null {
  const nacao = getComponent(ctx.state, unidade, 'owner')!.nacao;
  let melhor: EntityId | null = null;
  let melhorTempo = Infinity;
  for (const id of entitiesWith(ctx.state, 'portas', 'owner')) {
    if (getComponent(ctx.state, id, 'owner')!.nacao !== nacao) continue;
    const tempo = tempoEstimado(ctx, unidade, id);
    if (tempo < melhorTempo) {
      melhorTempo = tempo;
      melhor = id;
    }
  }
  return melhor;
}

function irAte(ctx: SystemContext, unidade: EntityId, estrutura: EntityId): void {
  const du = direcaoDe(getComponent(ctx.state, unidade, 'position')!);
  const de = direcaoDe(getComponent(ctx.state, estrutura, 'position')!);
  const borda = getComponent(ctx.state, estrutura, 'obstacle')?.raio ?? 0;
  const rumo = tangente(de, du) ?? norteEm(de);
  const distancia = borda + raioDe(ctx, unidade) + param('raio_deposito_m') / 2;
  irPara(ctx, unidade, avancar(de, rumo, distancia / raioDoMundo(ctx)).p);
}

/** Manda a unidade recarregar; false se não há estrutura com portas. */
export function iniciarRecarga(
  ctx: SystemContext,
  unidade: EntityId,
  automatica: boolean,
  /** D-50: estrutura escolhida pelo jogador (clique direito); sem ela, a de menor tempo. */
  escolhida: EntityId | null = null,
): boolean {
  const recarga = getComponent(ctx.state, unidade, 'recarga');
  if (!recarga) return false;
  // Uma ordem nova de recarga troca o destino de quem já ia recarregar.
  if (recarga.estado !== 'nenhuma' && !(escolhida !== null && recarga.estado === 'indo')) {
    return false;
  }
  const estrutura = escolhida ?? estruturaDeRecarga(ctx, unidade);
  if (estrutura === null) return false;
  const tipo = getComponent(ctx.state, unidade, 'unit')!.tipo;
  const ordem = getComponent(ctx.state, unidade, 'order')!;
  // ENE-16: a Impressora também volta ao lugar e retoma a fila de onde parou.
  const volta = automatica && tipo !== 'hover_explorer';
  recarga.retorno = volta
    ? {
        ponto: direcaoDe(getComponent(ctx.state, unidade, 'position')!),
        patrulha: ordem.tipo === 'patrulhar' ? ordem.patrulha : null,
      }
    : null;
  if (getComponent(ctx.state, unidade, 'coleta')) liberar(ctx, unidade);
  removeComponent(ctx.state, unidade, 'trabalho');
  recarga.estado = 'indo';
  recarga.estrutura = estrutura;
  recarga.automatica = automatica;
  irAte(ctx, unidade, estrutura);
  return true;
}

export function sairDaEstrutura(ctx: SystemContext, unidade: EntityId): void {
  const recarga = getComponent(ctx.state, unidade, 'recarga')!;
  if (recarga.estrutura !== null && isAlive(ctx.state, recarga.estrutura)) {
    const portas = getComponent(ctx.state, recarga.estrutura, 'portas');
    if (portas) {
      portas.ocupantes = portas.ocupantes.map((u) => (u === unidade ? null : u));
      portas.fila = portas.fila.filter((u) => u !== unidade);
    }
  }
  recarga.estado = 'nenhuma';
  recarga.estrutura = null;
}

/** ENE-14/D-28: recarga completa — desacopla e retoma o que fazia. */
function concluir(ctx: SystemContext, unidade: EntityId): void {
  const recarga = getComponent(ctx.state, unidade, 'recarga')!;
  const retorno = recarga.retorno;
  sairDaEstrutura(ctx, unidade);
  recarga.retorno = null;
  const ordem = getComponent(ctx.state, unidade, 'order')!;
  const loc = getComponent(ctx.state, unidade, 'locomotion')!;
  if (getComponent(ctx.state, unidade, 'coleta')) {
    retomarColeta(ctx, unidade);
    return;
  }
  if (retorno) {
    ordem.tipo = retorno.patrulha ? 'patrulhar' : 'mover';
    ordem.patrulha = retorno.patrulha;
    loc.destino = retorno.ponto;
    loc.limiteVel = null;
    tracarRota(
      navegavelDe(ctx, unidade),
      loc,
      direcaoDe(getComponent(ctx.state, unidade, 'position')!),
      false,
    );
    return;
  }
  ordem.tipo = 'nenhuma';
  loc.destino = null;
  loc.rota = [];
}

function acoplar(ctx: SystemContext, unidade: EntityId, estrutura: EntityId): void {
  const portas = getComponent(ctx.state, estrutura, 'portas')!;
  const recarga = getComponent(ctx.state, unidade, 'recarga')!;
  portas.fila = portas.fila.filter((u) => u !== unidade);
  portas.ocupantes[portas.ocupantes.indexOf(null)] = unidade;
  recarga.estado = 'acoplada';
  const loc = getComponent(ctx.state, unidade, 'locomotion')!;
  loc.destino = null;
  loc.rota = [];
  loc.fluxo = null;
}

/** Máquina de estados das unidades a caminho, na fila ou acopladas. */
export function passoRecarga(ctx: SystemContext): void {
  const { state } = ctx;
  for (const unidade of entitiesWith(state, 'recarga', 'position')) {
    const recarga = getComponent(state, unidade, 'recarga')!;
    if (recarga.estado === 'nenhuma') continue;
    // ENE-14: outra ordem (mover, parar, manter, patrulhar) cancela a recarga.
    if (getComponent(state, unidade, 'order')!.tipo !== 'tarefa') {
      sairDaEstrutura(ctx, unidade);
      recarga.retorno = null;
      continue;
    }
    const estrutura = recarga.estrutura;
    if (
      estrutura === null ||
      !isAlive(state, estrutura) ||
      !getComponent(state, estrutura, 'portas')
    ) {
      sairDaEstrutura(ctx, unidade);
      if (!iniciarRecarga(ctx, unidade, recarga.automatica)) concluir(ctx, unidade);
      continue;
    }
    const portas = getComponent(state, estrutura, 'portas')!;
    const bateria = getComponent(state, unidade, 'bateria')!;
    switch (recarga.estado) {
      case 'indo':
        if (folga(ctx, unidade, estrutura) <= param('raio_deposito_m')) {
          if (portas.ocupantes.includes(null) && portas.fila.length === 0) {
            acoplar(ctx, unidade, estrutura);
          } else {
            portas.fila.push(unidade);
            recarga.estado = 'fila';
            const loc = getComponent(state, unidade, 'locomotion')!;
            loc.destino = null;
            loc.rota = [];
          }
        } else if (!getComponent(state, unidade, 'locomotion')!.destino) {
          irAte(ctx, unidade, estrutura);
        }
        break;
      case 'fila':
        if (portas.fila[0] === unidade && portas.ocupantes.includes(null)) {
          acoplar(ctx, unidade, estrutura);
        }
        break;
      case 'acoplada':
        if (bateria.en >= bateria.max - 1e-9) concluir(ctx, unidade);
        break;
    }
  }
}

/** ENE-15/ENE-16/ENE-20: dispara a auto-recarga pelos limiares de cada papel. */
export function autoRecarga(ctx: SystemContext): void {
  const { state } = ctx;
  for (const unidade of entitiesWith(state, 'bateria', 'recarga')) {
    const bateria = getComponent(state, unidade, 'bateria')!;
    const recarga = getComponent(state, unidade, 'recarga')!;
    if (!bateria.autoRecarga || recarga.estado !== 'nenhuma' || bateria.recebendo) continue;
    // CMB-28: hover recolhido não sai para recarregar; D-57: quem segue a Bateria Móvel, também não.
    if (getComponent(state, unidade, 'abrigo') || getComponent(state, unidade, 'seguirBateria'))
      continue;
    // D-44: em controle direto, o jogador decide quando recarregar.
    if (getComponent(state, unidade, 'pilotado')) continue;
    // O silo ancorado não sai do lugar; recarrega quando estiver solto.
    if (siloImovel(getComponent(state, unidade, 'silo'))) continue;
    const ordem = getComponent(state, unidade, 'order')!.tipo;
    if (ordem === 'manter') continue;
    const papel = papelDe(getComponent(state, unidade, 'unit')!.tipo);
    const pct = porcentagem(bateria);
    if (pct > limiarDeRecarga(papel)) continue;
    const forcada = papel === 'drone' && pct <= param('recarga_forcada_drone_pct');
    if ((papel === 'militar' || papel === 'drone') && !forcada && emCombate(state, unidade)) {
      continue;
    }
    iniciarRecarga(ctx, unidade, true);
  }
}

function daNacao(
  ctx: SystemContext,
  nacao: string,
  ids: unknown,
  componente: 'recarga' | 'bateria',
) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids)]
    .filter((id): id is number => typeof id === 'number' && isAlive(ctx.state, id))
    .filter(
      (id) =>
        getComponent(ctx.state, id, 'owner')?.nacao === nacao &&
        getComponent(ctx.state, id, componente) !== undefined,
    )
    .sort((a, b) => a - b);
}

export const comandosDeRecarga: Record<string, CommandHandler> = {
  /** §12.4 R: recarregar agora. */
  recarregar: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown; estrutura?: unknown };
    // D-50: com `estrutura` (própria, com portas), recarrega ali, com qualquer nível de bateria.
    const alvo =
      typeof d.estrutura === 'number' &&
      getComponent(ctx.state, d.estrutura, 'portas') &&
      getComponent(ctx.state, d.estrutura, 'owner')?.nacao === comando.nacao
        ? d.estrutura
        : null;
    for (const id of daNacao(ctx, comando.nacao, d.ids, 'recarga')) {
      iniciarRecarga(ctx, id, false, alvo);
    }
  },
  /** ENE-15: liga ou desliga a auto-recarga por unidade. */
  auto_recarga: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown; ligada?: unknown };
    if (typeof d.ligada !== 'boolean') return;
    for (const id of daNacao(ctx, comando.nacao, d.ids, 'bateria')) {
      getComponent(ctx.state, id, 'bateria')!.autoRecarga = d.ligada;
    }
  },
};
