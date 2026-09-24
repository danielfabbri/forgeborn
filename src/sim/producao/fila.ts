/**
 * Filas de impressão (PRD-03 a PRD-09). A Nave imprime com energia da rede (consumidor de
 * prioridade 3, ENE-04); a Impressora, parada, com a própria bateria. O item pronto nasce na
 * borda do produtor, do lado do ponto de encontro (D-29), e segue para ele.
 */
import { contar } from '../core/estatisticas';
import type { ItemDaFila } from '../core/components';
import { entitiesWith, getComponent, isAlive } from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { EntityId, NacaoId } from '../core/types';
import { type CustosId, type MoveisId, param } from '../data';
import { designar } from '../economia/coleta';
import { todasAsJazidas } from '../economia/jazidas';
import { emReserva, gastar } from '../energia/bateria';
import { bonusDaNacao } from '../ia/base';
import { avancar, escalar, norteEm, tangente, type Vec3 } from '../map/esfera';
import { criarUnidade } from '../units/criar';
import { moverPara } from '../units/ordens';
import { statsMovel } from '../units/stats';
import { direcaoDe, distanciaM, raioDoMundo } from '../units/superficie';
import { bordaDe } from './alcance';
import { custoDe, ehItem, pagar, produz, reembolsar, tipoDoProdutor } from './custos';
import { removerObra } from './obra';

/** Folga (m) entre o casco da unidade nascida e a borda do produtor (apresentação). */
const FOLGA_NASCIMENTO_M = 0.1;

export function filaMaxima(tipoProdutor: string): number {
  return tipoProdutor === 'ship' ? param('fila_max_nave') : param('fila_max_impressora');
}

export const ehMovel = (item: CustosId): item is MoveisId => custoDe(item).categoria === 'movel';

/** REG-19: corpos vivos mais unidades já pagas nas filas da nação. */
function corposComFila(ctx: SystemContext, nacao: NacaoId): number {
  const { state } = ctx;
  let total = 0;
  for (const id of entitiesWith(state, 'unit', 'owner')) {
    if (getComponent(state, id, 'owner')!.nacao === nacao) total++;
  }
  for (const id of entitiesWith(state, 'producer', 'owner')) {
    if (getComponent(state, id, 'owner')!.nacao !== nacao) continue;
    total += getComponent(state, id, 'producer')!.fila.filter((i) => ehMovel(i.item)).length;
  }
  return total;
}

/** A fila do produtor aceita mais um item (PRD-01, PRD-03)? */
export function cabeNaFila(ctx: SystemContext, produtor: EntityId, item: CustosId): boolean {
  const tipo = tipoDoProdutor(ctx, produtor);
  if (!tipo || !produz(tipo, item)) return false;
  return getComponent(ctx.state, produtor, 'producer')!.fila.length < filaMaxima(tipo);
}

/**
 * Enfileira um item (PRD-03, PRD-04); true se entrou. `pagoAntes`: estrutura já paga ao
 * posicionar.
 */
export function enfileirar(
  ctx: SystemContext,
  produtor: EntityId,
  item: CustosId,
  obra: EntityId | null = null,
  pagoAntes: ItemDaFila['pago'] | null = null,
): boolean {
  const { state } = ctx;
  if (!cabeNaFila(ctx, produtor, item)) return false;
  const nacao = getComponent(state, produtor, 'owner')!.nacao;
  if (ehMovel(item) && corposComFila(ctx, nacao) >= param('limite_corpos')) {
    ctx.emit('alerta', { id: 'AL-11', nacao, limite: 'limite_corpos' });
    return false;
  }
  const pago = pagoAntes ?? pagar(ctx, nacao, item);
  if (!pago) return false;
  getComponent(state, produtor, 'producer')!.fila.push({ item, progresso: 0, pago, obra });
  return true;
}

/** PRD-05/PRD-14: cancela o item `indice` da fila. */
export function cancelarItem(ctx: SystemContext, produtor: EntityId, indice: number): void {
  const producer = getComponent(ctx.state, produtor, 'producer')!;
  const item = producer.fila[indice];
  if (!item) return;
  if (item.obra !== null && isAlive(ctx.state, item.obra)) {
    removerObra(ctx, item.obra);
    return;
  }
  producer.fila.splice(indice, 1);
  reembolsar(ctx, getComponent(ctx.state, produtor, 'owner')!.nacao, item.pago);
}

/** Jazida sob o ponto (para o hover recém-impresso começar a minerar, PRD-08). */
function jazidaEm(ctx: SystemContext, d: Vec3): EntityId | null {
  for (const id of todasAsJazidas(ctx)) {
    const dj = direcaoDe(getComponent(ctx.state, id, 'position')!);
    const raio = getComponent(ctx.state, id, 'obstacle')?.raio ?? 0;
    if (distanciaM(ctx, d, dj) <= raio + param('distancia_mineracao_m')) return id;
  }
  return null;
}

/**
 * PRD-08/D-29: cria a unidade na borda do produtor e a manda ao ponto de encontro. `impresso`:
 * emite o evento de impressão (o hover inicial, REG-04, não é impresso).
 */
export function nascer(
  ctx: SystemContext,
  produtor: EntityId,
  tipo: MoveisId,
  impresso = true,
): EntityId | null {
  const { state } = ctx;
  const nacao = getComponent(state, produtor, 'owner')!.nacao;
  const d0 = direcaoDe(getComponent(state, produtor, 'position')!);
  const encontro = getComponent(state, produtor, 'producer')!.pontoDeEncontro;
  // Sem ponto de encontro: a rampa da Nave (sul local) ou a frente da Impressora.
  const frente = getComponent(state, produtor, 'structure')
    ? escalar(norteEm(d0), -1)
    : getComponent(state, produtor, 'locomotion')!.rumo;
  const rumo = (encontro && tangente(d0, encontro)) || frente;
  const distancia = bordaDe(ctx, produtor) + statsMovel(tipo).raio_m + FOLGA_NASCIMENTO_M;
  const passo = avancar(d0, rumo, distancia / raioDoMundo(ctx));
  const id = criarUnidade(ctx, nacao, tipo, passo.p);
  if (id === null) return null;
  getComponent(state, id, 'locomotion')!.rumo = passo.rumo;
  if (impresso) {
    ctx.emit('impresso', { id, tipo, nacao, produtor });
    const estatisticas = state.estatisticas[nacao];
    if (estatisticas) contar(estatisticas.impressas, tipo);
  }
  if (encontro) {
    const jazida = getComponent(state, id, 'coleta') ? jazidaEm(ctx, encontro) : null;
    if (jazida !== null) designar(ctx, id, jazida, true);
    else moverPara(ctx, [id], encontro);
  }
  return id;
}

/** PRD-07: a Impressora imprime unidades só parada, sem outra tarefa e fora da recarga. */
function impressoraLivre(ctx: SystemContext, id: EntityId): boolean {
  const { state } = ctx;
  const loc = getComponent(state, id, 'locomotion')!;
  const ordem = getComponent(state, id, 'order')!.tipo;
  const recarga = getComponent(state, id, 'recarga');
  return (
    !loc.destino &&
    loc.speed < 1e-3 &&
    ordem !== 'mover' &&
    ordem !== 'patrulhar' &&
    (!recarga || recarga.estado === 'nenhuma') &&
    !getComponent(state, id, 'trabalho')
  );
}

function concluirUnidade(ctx: SystemContext, produtor: EntityId): void {
  const producer = getComponent(ctx.state, produtor, 'producer')!;
  const item = producer.fila[0]!;
  if (nascer(ctx, produtor, item.item as MoveisId) !== null) producer.fila.shift();
}

/** §13.2: `bonus_impressao_pct` da IA encurta o tempo (a energia total não muda). */
function aceleracao(ctx: SystemContext, produtor: EntityId): number {
  return (
    1 +
    bonusDaNacao(
      ctx.state,
      getComponent(ctx.state, produtor, 'owner')!.nacao,
      'bonus_impressao_pct',
    )
  );
}

/** Nave: o progresso do tick usa a energia que a rede entregou no tick anterior. */
function passoNave(ctx: SystemContext, nave: EntityId): void {
  const producer = getComponent(ctx.state, nave, 'producer')!;
  const consumidor = getComponent(ctx.state, nave, 'consumidor')!;
  const ritmo = aceleracao(ctx, nave);
  const item = producer.fila[0];
  if (item && consumidor.demanda_en_s > 0) {
    const tempo = custoDe(item.item).tempo_s;
    item.progresso = Math.min(1, item.progresso + (consumidor.atendido * ritmo * ctx.dt) / tempo);
  }
  if (item && item.progresso >= 1 - 1e-9) concluirUnidade(ctx, nave);
  const proximo = producer.fila[0];
  consumidor.demanda_en_s = proximo
    ? (custoDe(proximo.item).en_impressao / custoDe(proximo.item).tempo_s) * ritmo
    : 0;
}

/** Impressora: imprime a unidade da frente da fila com a própria bateria (PRD-06, PRD-07). */
function passoImpressora(ctx: SystemContext, impressora: EntityId): void {
  const producer = getComponent(ctx.state, impressora, 'producer')!;
  const item = producer.fila[0];
  if (!item || item.obra !== null) return;
  if (item.progresso < 1 - 1e-9) {
    if (!impressoraLivre(ctx, impressora) || emReserva(ctx, impressora)) return;
    const custo = custoDe(item.item);
    const ritmo = aceleracao(ctx, impressora);
    const pago = gastar(ctx, impressora, (custo.en_impressao / custo.tempo_s) * ritmo * ctx.dt);
    item.progresso = Math.min(1, item.progresso + (pago * ritmo * ctx.dt) / custo.tempo_s);
  }
  if (item.progresso >= 1 - 1e-9) concluirUnidade(ctx, impressora);
}

export function passoFilas(ctx: SystemContext): void {
  for (const id of entitiesWith(ctx.state, 'producer')) {
    if (getComponent(ctx.state, id, 'structure')) passoNave(ctx, id);
    else passoImpressora(ctx, id);
  }
}

export function produtoresDa(ctx: SystemContext, nacao: NacaoId, ids: unknown): EntityId[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids)]
    .filter((id): id is number => typeof id === 'number' && isAlive(ctx.state, id))
    .filter(
      (id) =>
        getComponent(ctx.state, id, 'owner')?.nacao === nacao &&
        getComponent(ctx.state, id, 'producer') !== undefined,
    )
    .sort((a, b) => a - b);
}

export const comandosDeFila: Record<string, CommandHandler> = {
  /** §12.4 (Nave E/I, Impressora U): imprime uma unidade em cada produtor. */
  imprimir: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown; item?: unknown };
    if (!ehItem(d.item) || !ehMovel(d.item)) return;
    for (const id of produtoresDa(ctx, comando.nacao, d.ids)) enfileirar(ctx, id, d.item);
  },
  /** PRD-05: cancela o item de índice `indice` da fila do produtor. */
  cancelar_impressao: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { id?: unknown; indice?: unknown };
    if (typeof d.indice !== 'number') return;
    for (const id of produtoresDa(ctx, comando.nacao, [d.id])) cancelarItem(ctx, id, d.indice);
  },
};
