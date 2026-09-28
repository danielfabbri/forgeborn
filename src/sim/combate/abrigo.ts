/**
 * Recolher mineradores (CMB-28, D-52): o comando da Nave leva todos os Hovers de Exploração ao
 * abrigo mais próximo com vaga (a Nave ou um Armazém próprio, até `abrigo_vagas`). Abrigado, o
 * hover sai do mapa (não se move, não aparece para o inimigo e não pode ser atingido) e soma à
 * estrutura um disparo de `abrigo_laser`, pago da rede. O mesmo comando, de novo, libera todos
 * para a coleta; se a estrutura cair, os abrigados saem ao lado dela.
 */
import {
  entitiesWith,
  getComponent,
  isAlive,
  removeComponent,
  setComponent,
} from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { EntityId, NacaoId } from '../core/types';
import { param } from '../data';
import { irPara, liberar, retomarColeta } from '../economia/coleta';
import { bordaDe } from '../producao/alcance';
import { statsMovel } from '../units/stats';
import { direcaoDe, distanciaM } from '../units/superficie';
import { alvoValido, armaDe } from './armas';
import { aplicarDano, type TipoDeDano } from './dano';
import { gastarDaRede, naRedeComEnergia } from '../energia/cabos';

export const RECOLHER_MINERADORES_COMMAND = 'recolher_mineradores';

const ABRIGOS = new Set(['ship', 'storage']);

/** O hover está dentro de um abrigo (fora do mapa)? */
export function abrigado(state: import('../core/state').SimState, id: EntityId): boolean {
  return getComponent(state, id, 'abrigo')?.estado === 'dentro';
}

function abrigosDa(ctx: SystemContext, nacao: NacaoId): EntityId[] {
  return entitiesWith(ctx.state, 'structure', 'owner').filter(
    (id) =>
      getComponent(ctx.state, id, 'owner')!.nacao === nacao &&
      ABRIGOS.has(getComponent(ctx.state, id, 'structure')!.tipo) &&
      !getComponent(ctx.state, id, 'obra') &&
      // ENE-29 (D-86): o Armazém só abriga numa rede com energia.
      (getComponent(ctx.state, id, 'structure')!.tipo === 'ship' ||
        naRedeComEnergia(ctx.state, id)),
  );
}

function hoversDa(ctx: SystemContext, nacao: NacaoId): EntityId[] {
  return entitiesWith(ctx.state, 'unit', 'owner', 'coleta').filter(
    (id) =>
      getComponent(ctx.state, id, 'owner')!.nacao === nacao &&
      getComponent(ctx.state, id, 'unit')!.tipo === 'hover_explorer' &&
      !getComponent(ctx.state, id, 'pilotado'),
  );
}

function soltar(ctx: SystemContext, hover: EntityId): void {
  removeComponent(ctx.state, hover, 'abrigo');
  retomarColeta(ctx, hover);
}

function recolher(ctx: SystemContext, nacao: NacaoId): void {
  const { state } = ctx;
  const abrigos = abrigosDa(ctx, nacao);
  const ocupacao = new Map<EntityId, number>(abrigos.map((a) => [a, 0]));
  for (const hover of hoversDa(ctx, nacao)) {
    const d = direcaoDe(getComponent(state, hover, 'position')!);
    const livres = abrigos.filter((a) => ocupacao.get(a)! < param('abrigo_vagas'));
    if (livres.length === 0) break;
    let melhor = livres[0]!;
    let menor = Infinity;
    for (const a of livres) {
      const dist = distanciaM(ctx, d, direcaoDe(getComponent(state, a, 'position')!));
      if (dist < menor) {
        menor = dist;
        melhor = a;
      }
    }
    ocupacao.set(melhor, ocupacao.get(melhor)! + 1);
    liberar(ctx, hover);
    const coleta = getComponent(state, hover, 'coleta')!;
    coleta.estado = 'ocioso';
    coleta.jazida = null;
    removeComponent(state, hover, 'fuga');
    setComponent(state, hover, 'abrigo', { estrutura: melhor, estado: 'indo', recargas: [] });
    irPara(ctx, hover, direcaoDe(getComponent(state, melhor, 'position')!));
  }
}

export const comandosDeAbrigo: Record<string, CommandHandler> = {
  /** CMB-28 (Nave, Q): recolhe todos os mineradores; com algum recolhido, libera todos. */
  [RECOLHER_MINERADORES_COMMAND]: (ctx, comando) => {
    const hovers = hoversDa(ctx, comando.nacao);
    const algum = hovers.some((h) => getComponent(ctx.state, h, 'abrigo'));
    if (algum) {
      for (const h of hovers) if (getComponent(ctx.state, h, 'abrigo')) soltar(ctx, h);
    } else {
      recolher(ctx, comando.nacao);
    }
  },
};

export function passoAbrigo(ctx: SystemContext): void {
  const { state, dt } = ctx;
  const arma = armaDe('abrigo_laser');
  const porEstrutura = new Map<EntityId, EntityId[]>();
  for (const hover of entitiesWith(state, 'abrigo', 'position')) {
    const abrigo = getComponent(state, hover, 'abrigo')!;
    // A estrutura caiu: o hover sai ao lado e volta à coleta.
    if (!isAlive(state, abrigo.estrutura) || getComponent(state, abrigo.estrutura, 'obra')) {
      soltar(ctx, hover);
      continue;
    }
    // Outra ordem do jogador tira o hover do abrigo (ou do caminho dele).
    if (getComponent(state, hover, 'order')!.tipo !== 'tarefa') {
      removeComponent(state, hover, 'abrigo');
      continue;
    }
    if (abrigo.estado === 'indo') {
      const folga =
        distanciaM(
          ctx,
          direcaoDe(getComponent(state, hover, 'position')!),
          direcaoDe(getComponent(state, abrigo.estrutura, 'position')!),
        ) -
        bordaDe(ctx, abrigo.estrutura) -
        statsMovel('hover_explorer').raio_m;
      if (folga <= param('raio_deposito_m')) {
        abrigo.estado = 'dentro';
        const loc = getComponent(state, hover, 'locomotion')!;
        loc.destino = null;
        loc.rota = [];
        loc.speed = 0;
      } else if (!getComponent(state, hover, 'locomotion')!.destino) {
        irPara(ctx, hover, direcaoDe(getComponent(state, abrigo.estrutura, 'position')!));
      }
      continue;
    }
    const lista = porEstrutura.get(abrigo.estrutura) ?? [];
    lista.push(hover);
    porEstrutura.set(abrigo.estrutura, lista);
  }

  // Cada abrigado soma um disparo de `abrigo_laser` à estrutura (pago da rede).
  for (const [estrutura, hovers] of porEstrutura) {
    const nacao = getComponent(state, estrutura, 'owner')!.nacao as NacaoId;
    const rede = state.energia[nacao];
    const de = direcaoDe(getComponent(state, estrutura, 'position')!);
    let alvo: EntityId | null = null;
    let menor = Infinity;
    for (const id of entitiesWith(state, 'vida', 'position', 'owner')) {
      if (!alvoValido(ctx, estrutura, id, arma)) continue;
      const dist =
        distanciaM(ctx, de, direcaoDe(getComponent(state, id, 'position')!)) -
        bordaDe(ctx, estrutura);
      if (dist <= arma.alcance_m && dist < menor) {
        menor = dist;
        alvo = id;
      }
    }
    for (const hover of hovers) {
      const abrigo = getComponent(state, hover, 'abrigo')!;
      const recarga = Math.max(0, (abrigo.recargas[0] ?? 0) - dt);
      abrigo.recargas = [recarga];
      // ENE-28: o disparo sai do banco da rede da estrutura.
      if (alvo === null || recarga > 1e-9 || !rede) continue;
      if (!gastarDaRede(state, estrutura, arma.en_disparo)) continue;
      abrigo.recargas = [arma.recarga_s ?? 0];
      ctx.emit('disparo', { atirador: estrutura, alvo, arma: arma.id });
      aplicarDano(ctx, alvo, arma.dano, arma.tipo_dano as TipoDeDano, estrutura, nacao);
      if (!isAlive(state, alvo) || (getComponent(state, alvo, 'vida')?.hp ?? 0) <= 0) alvo = null;
    }
  }
}
