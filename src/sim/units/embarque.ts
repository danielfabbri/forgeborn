/**
 * Embarque e desembarque (UNI-20, D-90). Unidades de solo embarcam num Transporte pela borda:
 * vão até a terra mais perto dele e entram quando o casco fica a até `embarque_distancia_m` do
 * casco do Transporte, se houver vaga (`transporte_capacidade`). Embarcadas, saem do mapa: não
 * andam, não veem, não atiram nem são atingidas; acompanham a posição do Transporte. Com o
 * Transporte na borda do ponto de desembarque, todas voltam à terra em volta do ponto de terra
 * mais perto. Se o Transporte é destruído, as embarcadas também são.
 */
import type { Ponto } from '../core/components';
import {
  entitiesWith,
  getComponent,
  isAlive,
  removeComponent,
  setComponent,
} from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { SimState } from '../core/state';
import type { EntityId } from '../core/types';
import { param } from '../data';
import { celulaLivreProxima, centroDoIndice } from '../map/pathfinding';
import { navegavel, navegavelAgua } from './navegacao';
import { moverPara } from './ordens';
import { ehEmbarcacao, statsMovel } from './stats';
import { direcaoDe, direcaoDoComando, distanciaM, posicionar } from './superficie';

/** A unidade está embarcada (fora do mapa, UNI-20)? */
export function embarcada(state: SimState, id: EntityId): boolean {
  return getComponent(state, id, 'embarcado') !== undefined;
}

/** Folga (m) além do casco do Transporte em que a terra ainda conta como "na borda". */
const BORDA_DESEMBARQUE_M = 8;
/** Depois do desembarque, as unidades só seguem ao ponto pedido se ele fica além disto (m). */
const SEGUIR_AO_PONTO_M = 10;
/** Folga (m) além do casco em que o Transporte já conta como chegado ao destino. */
const CHEGADA_M = 4;
/** O Transporte que se afastou mais que isto do ponto combinado refaz a ida dos passageiros. */
const REAJUSTE_M = 5;
/** Intervalo (s) entre as novas idas de quem parou fora do alcance. */
const TENTATIVA_S = 1;
/** Alcance (células) da procura do líquido mais perto do ponto de desembarque. */
const BUSCA_DE_AGUA_CELULAS = 600;
/** Abaixo desta velocidade (m/s) a unidade a caminho conta como parada. */
const VELOCIDADE_PARADA_M_S = 0.2;

function raio(state: SimState, id: EntityId): number {
  return statsMovel(getComponent(state, id, 'unit')!.tipo).raio_m;
}

function ehTransporte(state: SimState, id: EntityId): boolean {
  return getComponent(state, id, 'unit')?.tipo === 'boat_transport' && isAlive(state, id);
}

/** Ponto de terra livre mais perto de d (célula da grade de solo), ou null. */
function terraMaisPerto(ctx: SystemContext, d: Ponto): Ponto | null {
  const g = navegavel(ctx);
  if (!g) return null;
  const c = celulaLivreProxima(g, d);
  return c >= 0 ? centroDoIndice(g.nav, c) : null;
}

function embarcar(ctx: SystemContext, unidade: EntityId, transporte: EntityId): void {
  const { state } = ctx;
  const carga = getComponent(state, transporte, 'transporte')!;
  carga.passageiros.push(unidade);
  removeComponent(state, unidade, 'embarque');
  setComponent(state, unidade, 'embarcado', { transporte });
  const loc = getComponent(state, unidade, 'locomotion')!;
  loc.destino = null;
  loc.rota = [];
  loc.fluxo = null;
  loc.speed = 0;
  getComponent(state, unidade, 'order')!.tipo = 'nenhuma';
  ctx.emit('embarque', { unidade, transporte });
}

function desembarcarTodos(ctx: SystemContext, transporte: EntityId, terra: Ponto): void {
  const { state } = ctx;
  const carga = getComponent(state, transporte, 'transporte')!;
  const destino = carga.desembarque;
  const g = navegavel(ctx);
  const soltos: EntityId[] = [];
  for (const id of carga.passageiros) {
    if (!isAlive(state, id)) continue;
    removeComponent(state, id, 'embarcado');
    posicionar(ctx, getComponent(state, id, 'position')!, terra, 0);
    soltos.push(id);
  }
  carga.passageiros = [];
  carga.desembarque = null;
  if (soltos.length === 0) return;
  ctx.emit('desembarque', { transporte, unidades: soltos });
  // Em terra, seguem até o ponto pedido (a formação os espalha, MOV-06), se ele não é ali.
  if (g && destino && distanciaM(ctx, destino, terra) > SEGUIR_AO_PONTO_M) {
    moverPara(ctx, soltos, destino);
  }
}

/** UNI-20: sistema do embarque (roda com o movimento, depois dele). */
export function sistemaEmbarque(ctx: SystemContext): void {
  const { state } = ctx;
  const capacidade = param('transporte_capacidade');
  const distancia = param('embarque_distancia_m');
  // Quem está a caminho do Transporte.
  for (const id of entitiesWith(state, 'embarque', 'position')) {
    const e = getComponent(state, id, 'embarque')!;
    const loc = getComponent(state, id, 'locomotion')!;
    // Outra ordem (destino que não é o combinado) cancela o embarque.
    const outraOrdem =
      loc.destino !== null && e.ponto !== null && distanciaM(ctx, loc.destino, e.ponto) > 1;
    if (!ehTransporte(state, e.transporte) || outraOrdem) {
      removeComponent(state, id, 'embarque');
      continue;
    }
    const dt = direcaoDe(getComponent(state, e.transporte, 'position')!);
    const du = direcaoDe(getComponent(state, id, 'position')!);
    const folga = distanciaM(ctx, du, dt) - raio(state, id) - raio(state, e.transporte);
    const carga = getComponent(state, e.transporte, 'transporte')!;
    if (folga <= distancia && carga.passageiros.length < capacidade) {
      embarcar(ctx, id, e.transporte);
      continue;
    }
    // Chegou (a formação a deixou longe) ou o Transporte andou: vai sozinha à borda mais perto
    // dele, de novo a cada TENTATIVA_S.
    e.espera_s = Math.max(0, e.espera_s - ctx.dt);
    // Parada: chegou, ou está presa disputando a vaga com outra (quase sem velocidade).
    const parada = loc.destino === null || loc.speed < VELOCIDADE_PARADA_M_S;
    const andou =
      !e.ponto || distanciaM(ctx, e.ponto, dt) > raio(state, e.transporte) + distancia + REAJUSTE_M;
    if ((parada && e.espera_s <= 0) || andou) {
      e.espera_s = TENTATIVA_S;
      const alvo = terraMaisPerto(ctx, dt);
      if (!alvo) continue;
      moverPara(ctx, [id], dt);
      e.ponto = getComponent(state, id, 'locomotion')!.destino ?? alvo;
    }
  }
  // Transportes: passageiros acompanham; destruído, leva todos; no ponto, desembarca.
  for (const id of entitiesWith(state, 'transporte')) {
    const carga = getComponent(state, id, 'transporte')!;
    if (!isAlive(state, id) || !getComponent(state, id, 'position')) continue;
    const pos = getComponent(state, id, 'position')!;
    const d = direcaoDe(pos);
    for (const p of carga.passageiros) {
      if (isAlive(state, p)) posicionar(ctx, getComponent(state, p, 'position')!, d, 0);
    }
    if (!carga.desembarque) continue;
    const loc = getComponent(state, id, 'locomotion')!;
    // Chegou (ou está quase lá, disputando a vaga com outro Transporte).
    if (loc.destino !== null && distanciaM(ctx, d, loc.destino) > raio(state, id) + CHEGADA_M) {
      continue;
    }
    const terra = terraMaisPerto(ctx, d);
    if (!terra) continue;
    if (distanciaM(ctx, d, terra) - raio(state, id) <= BORDA_DESEMBARQUE_M) {
      desembarcarTodos(ctx, id, terra);
    } else if (loc.destino === null) {
      // Parou de vez longe da terra (o ponto era inalcançável): desiste.
      carga.desembarque = null;
    }
  }
}

/** UNI-20: o Transporte destruído leva as embarcadas (chamado antes das mortes do tick). */
export function afundarTransportes(ctx: SystemContext): void {
  const { state } = ctx;
  for (const id of entitiesWith(state, 'transporte')) {
    if ((getComponent(state, id, 'vida')?.hp ?? 1) > 0) continue;
    const carga = getComponent(state, id, 'transporte')!;
    for (const p of carga.passageiros) {
      if (!isAlive(state, p)) continue;
      removeComponent(state, p, 'embarcado');
      const vida = getComponent(state, p, 'vida');
      if (vida) vida.hp = 0;
    }
    carga.passageiros = [];
  }
}

export const comandosDeEmbarque: Record<string, CommandHandler> = {
  /** UNI-20: as unidades de solo `ids` embarcam no Transporte próprio `transporte`. */
  embarcar: (ctx, comando) => {
    const { state } = ctx;
    const d = (comando.dados ?? {}) as { ids?: unknown; transporte?: unknown };
    if (typeof d.transporte !== 'number' || !ehTransporte(state, d.transporte)) return;
    if (getComponent(state, d.transporte, 'owner')?.nacao !== comando.nacao) return;
    if (!Array.isArray(d.ids)) return;
    const transporte = d.transporte;
    const dt = direcaoDe(getComponent(state, transporte, 'position')!);
    const ids = [...new Set(d.ids)]
      .filter((id): id is number => typeof id === 'number' && isAlive(state, id))
      .filter((id) => {
        const unidade = getComponent(state, id, 'unit');
        if (!unidade || getComponent(state, id, 'owner')?.nacao !== comando.nacao) return false;
        // Drones e embarcações não embarcam; quem já está embarcado também não.
        const camada = statsMovel(unidade.tipo).camada;
        return camada === 'solo' && !ehEmbarcacao(unidade.tipo) && !embarcada(state, id);
      })
      .sort((a, b) => a - b);
    if (ids.length === 0) return;
    // O Transporte encosta na borda mais perto delas (o destino dele vira o líquido mais perto).
    const soma = ids.reduce<Ponto>(
      (s, id) => {
        const p = direcaoDe(getComponent(state, id, 'position')!);
        return [s[0] + p[0], s[1] + p[1], s[2] + p[2]];
      },
      [0, 0, 0],
    );
    const norma = Math.hypot(...soma) || 1;
    moverPara(ctx, [transporte], [soma[0] / norma, soma[1] / norma, soma[2] / norma]);
    moverPara(ctx, ids, dt);
    for (const id of ids) {
      const destino = getComponent(state, id, 'locomotion')!.destino;
      setComponent(state, id, 'embarque', { transporte, ponto: destino, espera_s: TENTATIVA_S });
    }
  },
  /** UNI-20: o Transporte `id` vai ao líquido mais perto do ponto e desembarca em terra. */
  desembarcar: (ctx, comando) => {
    const { state } = ctx;
    const d = (comando.dados ?? {}) as { id?: unknown; x?: unknown; y?: unknown; z?: unknown };
    if (typeof d.id !== 'number' || !ehTransporte(state, d.id)) return;
    if (getComponent(state, d.id, 'owner')?.nacao !== comando.nacao) return;
    const ponto = direcaoDoComando(d);
    if (!ponto) return;
    // O ponto pode ficar terra adentro: o Transporte vai ao líquido mais perto dele, onde for.
    const agua = navegavelAgua(ctx);
    const c = agua ? celulaLivreProxima(agua, ponto, BUSCA_DE_AGUA_CELULAS) : -1;
    if (agua && c < 0) return;
    getComponent(state, d.id, 'transporte')!.desembarque = ponto;
    moverPara(ctx, [d.id], agua ? centroDoIndice(agua.nav, c) : ponto);
  },
};
