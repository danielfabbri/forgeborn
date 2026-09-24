/**
 * Posicionamento e obra de estruturas (PRD-10 a PRD-17, D-29).
 *
 * Posicionar paga a estrutura e reserva a pegada. A Impressora vai até o local, instala o
 * canteiro (obstáculo com `hp_inicial_canteiro_pct`% do HP) e imprime; a velocidade é Σ PI ÷
 * `tempo_s`, e cada construtor paga da própria bateria a fração do seu PI. Hovers de
 * Exploração ajudam e podem continuar a obra sem a Impressora.
 */
import { contar } from '../core/estatisticas';
import {
  destroyEntity,
  entitiesWith,
  getComponent,
  isAlive,
  removeComponent,
  setComponent,
} from '../core/entities';
import type { CommandHandler, SystemContext } from '../core/pipeline';
import type { EntityId, NacaoId } from '../core/types';
import { type CustosId, dados, type EstruturasId, param } from '../data';
import { todasAsJazidas } from '../economia/jazidas';
import { emReserva, gastar } from '../energia/bateria';
import {
  avancar,
  escalar,
  normalizar,
  norteEm,
  produtoEscalar,
  produtoVetorial,
  soma,
  tangente,
  type Vec3,
} from '../map/esfera';
import { celulaDe, ehConstruivel } from '../map/grids';
import { ativarEstrutura, instalarEstrutura, reservarEstrutura } from '../units/criar';
import { ALTURA_HOVER_M, ehAerea, statsEstrutura, statsMovel } from '../units/stats';
import {
  chaoEm,
  direcaoDe,
  direcaoDoComando,
  distanciaM,
  posicionar,
  raioDoMundo,
} from '../units/superficie';
import { aproximar, bordaDe, noAlcance, pararNoLugar } from './alcance';
import { custoDe, pagar, produz, reembolsar } from './custos';
import { cabeNaFila, enfileirar } from './fila';
import { explorado } from '../visao/nevoa';
import { bonusDaNacao } from '../ia/base';
import { encerrarTrabalho } from './trabalho';

/** PRD-10: por que o local não serve (UI-08), ou null se serve. */
export type MotivoRecusa = 'inexplorado' | 'inclinacao' | 'ocupado' | 'jazida';

/** Base local (leste, norte) no plano tangente em d, alinhada ao norte local (CEN-15). */
function baseLocal(d: Vec3): { leste: Vec3; norte: Vec3 } {
  const norte = norteEm(d);
  return { leste: produtoVetorial(norte, d), norte };
}

/** Coordenadas (m) de `p` no plano tangente em `d`. */
function noPlano(R: number, d: Vec3, p: Vec3): [number, number] {
  const { leste, norte } = baseLocal(d);
  return [R * produtoEscalar(p, leste), R * produtoEscalar(p, norte)];
}

/** Metade do lado da pegada quadrada (m). */
const meiaPegada = (tipo: string): number => statsEstrutura(tipo).pegada_m / 2;

/** PRD-10: valida o local da estrutura `tipo` com centro em `d` (para `nacao`, se dada). */
export function validarPosicionamento(
  ctx: SystemContext,
  tipo: EstruturasId,
  d: Vec3,
  nacao?: NacaoId,
): MotivoRecusa | null {
  const { state } = ctx;
  const R = raioDoMundo(ctx);
  const h = meiaPegada(tipo);
  if (ctx.mundo) {
    const grade = ctx.mundo.grades.construcao;
    const { leste, norte } = baseLocal(d);
    const passo = grade.celula_m;
    const n = Math.max(1, Math.ceil((2 * h) / passo));
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const e = -h + (2 * h * i) / n;
        const s = -h + (2 * h * j) / n;
        const p = normalizar(soma(d, soma(escalar(leste, e / R), escalar(norte, s / R))));
        // Terreno explorado pela nação (VIS-01).
        if (nacao && !explorado(ctx, nacao, p)) return 'inexplorado';
        if (!ehConstruivel(grade, celulaDe(grade, p))) return 'inclinacao';
      }
    }
  }
  // Pegadas (prontas, em obra ou reservadas) não se sobrepõem.
  for (const id of entitiesWith(state, 'structure', 'position')) {
    const outra = getComponent(state, id, 'structure')!.tipo;
    const dc = direcaoDe(getComponent(state, id, 'position')!);
    const limite = h + meiaPegada(outra);
    if (distanciaM(ctx, d, dc) > limite * Math.SQRT2 + 1) continue;
    const [e, s] = noPlano(R, d, dc);
    if (Math.abs(e) < limite && Math.abs(s) < limite) return 'ocupado';
  }
  // Folga de `distancia_min_jazida_m` entre a pegada e a jazida.
  for (const id of todasAsJazidas(ctx)) {
    const dj = direcaoDe(getComponent(state, id, 'position')!);
    const raio = (getComponent(state, id, 'obstacle')?.raio ?? 0) + param('distancia_min_jazida_m');
    if (distanciaM(ctx, d, dj) > h * Math.SQRT2 + raio + 1) continue;
    const [e, s] = noPlano(R, d, dj);
    if (Math.hypot(Math.max(Math.abs(e) - h, 0), Math.max(Math.abs(s) - h, 0)) < raio) {
      return 'jazida';
    }
  }
  return null;
}

/** PRD-10: unidades próprias de solo dentro da pegada saem para a borda. */
function empurrarUnidades(ctx: SystemContext, obra: EntityId): void {
  const { state } = ctx;
  const nacao = getComponent(state, obra, 'owner')!.nacao;
  const d0 = direcaoDe(getComponent(state, obra, 'position')!);
  const borda = bordaDe(ctx, obra);
  for (const id of entitiesWith(state, 'unit', 'owner', 'position')) {
    if (getComponent(state, id, 'owner')!.nacao !== nacao) continue;
    const tipo = getComponent(state, id, 'unit')!.tipo;
    if (ehAerea(tipo)) continue;
    const pos = getComponent(state, id, 'position')!;
    const du = direcaoDe(pos);
    const fora = borda + statsMovel(tipo).raio_m;
    if (distanciaM(ctx, d0, du) >= fora) continue;
    const rumo = tangente(d0, du) ?? norteEm(d0);
    const novo = avancar(d0, rumo, fora / raioDoMundo(ctx)).p;
    posicionar(ctx, pos, novo, chaoEm(ctx, novo) + ALTURA_HOVER_M);
  }
}

/** PRD-11: instala o canteiro (só uma Impressora, PRD-16). */
export function instalarCanteiro(ctx: SystemContext, obra: EntityId): void {
  const estado = getComponent(ctx.state, obra, 'obra')!;
  if (estado.instalada) return;
  empurrarUnidades(ctx, obra);
  instalarEstrutura(ctx, obra);
  estado.instalada = true;
  ctx.emit('canteiro_instalado', { id: obra });
}

/** Encerra a obra nas filas e nos trabalhos de quem estava nela. */
function soltarConstrutores(ctx: SystemContext, obra: EntityId): void {
  const { state } = ctx;
  for (const id of entitiesWith(state, 'producer')) {
    const producer = getComponent(state, id, 'producer')!;
    const antes = producer.fila.length;
    producer.fila = producer.fila.filter((item) => item.obra !== obra);
    const ordem = getComponent(state, id, 'order');
    if (producer.fila.length !== antes && ordem?.tipo === 'tarefa') {
      ordem.tipo = 'nenhuma';
      pararNoLugar(ctx, id);
    }
  }
  for (const id of entitiesWith(state, 'trabalho')) {
    if (getComponent(state, id, 'trabalho')!.alvo === obra) encerrarTrabalho(ctx, id);
  }
}

/** Canteiro destruído (CMB-27): sai das filas e dos trabalhos, sem reembolso. */
export function abandonarObra(ctx: SystemContext, obra: EntityId): void {
  soltarConstrutores(ctx, obra);
}

/** PRD-14: cancela a obra, devolve os recursos (PRD-05) e remove o canteiro. */
export function removerObra(ctx: SystemContext, obra: EntityId): void {
  const { state } = ctx;
  const estado = getComponent(state, obra, 'obra');
  if (!estado) return;
  reembolsar(ctx, getComponent(state, obra, 'owner')!.nacao, estado.pago);
  soltarConstrutores(ctx, obra);
  if (estado.instalada) state.versaoObstaculos++;
  destroyEntity(state, obra);
}

function concluirObra(ctx: SystemContext, obra: EntityId): void {
  removeComponent(ctx.state, obra, 'obra');
  ativarEstrutura(ctx, obra);
  soltarConstrutores(ctx, obra);
  const tipo = getComponent(ctx.state, obra, 'structure')!.tipo;
  ctx.emit('estrutura_concluida', { id: obra, tipo });
  const estatisticas = ctx.state.estatisticas[getComponent(ctx.state, obra, 'owner')!.nacao];
  if (estatisticas) contar(estatisticas.construidas, tipo);
}

/** A Impressora pode ir à obra (sem ordem manual, recarga ou outro trabalho)? */
function impressoraDisponivel(ctx: SystemContext, id: EntityId): boolean {
  const ordem = getComponent(ctx.state, id, 'order')!.tipo;
  const recarga = getComponent(ctx.state, id, 'recarga');
  return (
    (ordem === 'nenhuma' || ordem === 'tarefa') &&
    (!recarga || recarga.estado === 'nenhuma') &&
    !getComponent(ctx.state, id, 'trabalho')
  );
}

/** Impressoras com uma estrutura na frente da fila vão até ela e instalam o canteiro. */
function passoImpressorasNaObra(ctx: SystemContext): void {
  const { state } = ctx;
  for (const id of entitiesWith(state, 'producer', 'unit')) {
    const producer = getComponent(state, id, 'producer')!;
    const item = producer.fila[0];
    if (!item || item.obra === null) continue;
    if (!isAlive(state, item.obra) || !getComponent(state, item.obra, 'obra')) {
      producer.fila.shift();
      continue;
    }
    if (!impressoraDisponivel(ctx, id)) continue;
    const loc = getComponent(state, id, 'locomotion')!;
    if (noAlcance(ctx, id, item.obra)) {
      if (loc.destino) pararNoLugar(ctx, id);
      getComponent(state, id, 'order')!.tipo = 'tarefa';
      instalarCanteiro(ctx, item.obra);
    } else if (!loc.destino) {
      aproximar(ctx, id, item.obra);
    }
  }
}

/** PRD-15: Poder de Impressão da unidade. */
function piDe(ctx: SystemContext, id: EntityId): number {
  return getComponent(ctx.state, id, 'unit')!.tipo === 'printer'
    ? param('pi_impressora')
    : param('pi_hover');
}

/** Construtores ativos da obra: Impressoras primeiro (a principal), depois por ID. */
function construtoresDe(ctx: SystemContext, obra: EntityId): EntityId[] {
  const { state } = ctx;
  const nacao = getComponent(state, obra, 'owner')!.nacao;
  const trabalhando = (id: EntityId): boolean => {
    const producer = getComponent(state, id, 'producer');
    if (producer?.fila[0]?.obra === obra && impressoraDisponivel(ctx, id)) return true;
    const trabalho = getComponent(state, id, 'trabalho');
    return trabalho?.tipo === 'construir' && trabalho.alvo === obra;
  };
  return entitiesWith(state, 'unit', 'owner', 'position')
    .filter((id) => {
      if (getComponent(state, id, 'owner')!.nacao !== nacao) return false;
      const recarga = getComponent(state, id, 'recarga');
      if (recarga && recarga.estado !== 'nenhuma') return false;
      if (getComponent(state, id, 'locomotion')!.destino) return false;
      return trabalhando(id) && !emReserva(ctx, id) && noAlcance(ctx, id, obra);
    })
    .sort((a, b) => {
      const ia = getComponent(state, a, 'unit')!.tipo === 'printer' ? 0 : 1;
      const ib = getComponent(state, b, 'unit')!.tipo === 'printer' ? 0 : 1;
      return ia - ib || a - b;
    })
    .slice(0, 1 + param('max_assistentes'));
}

/** PRD-11, PRD-15, PRD-17: avança as obras instaladas. */
function passoObras(ctx: SystemContext): void {
  const { state, dt } = ctx;
  for (const obra of entitiesWith(state, 'obra', 'structure')) {
    const estado = getComponent(state, obra, 'obra')!;
    estado.construtores = [];
    if (!estado.instalada) continue;
    const custo = custoDe(getComponent(state, obra, 'structure')!.tipo as EstruturaImpressa);
    // §13.2: `bonus_impressao_pct` da IA acelera a obra (a energia total não muda).
    const nacao = getComponent(state, obra, 'owner')!.nacao;
    const ritmo = 1 + bonusDaNacao(state, nacao, 'bonus_impressao_pct');
    let avanco = 0;
    for (const id of construtoresDe(ctx, obra)) {
      const pi = piDe(ctx, id) * ritmo;
      const pago = gastar(ctx, id, ((custo.en_impressao * pi) / custo.tempo_s) * dt);
      if (pago <= 0) continue;
      avanco += (pi * pago * dt) / custo.tempo_s;
      estado.construtores.push(id);
    }
    avanco = Math.min(avanco, 1 - estado.progresso);
    estado.progresso += avanco;
    // O HP cresce com o progresso; o dano sofrido fica descontado (PRD-11).
    const vida = getComponent(state, obra, 'vida')!;
    vida.hp = Math.min(
      vida.max,
      vida.hp + vida.max * (1 - param('hp_inicial_canteiro_pct') / 100) * avanco,
    );
    if (estado.progresso >= 1 - 1e-9) concluirObra(ctx, obra);
  }
}

export function passoConstrucao(ctx: SystemContext): void {
  passoImpressorasNaObra(ctx);
  passoObras(ctx);
}

function impressoraDa(ctx: SystemContext, nacao: NacaoId, id: unknown): EntityId | null {
  if (typeof id !== 'number' || !isAlive(ctx.state, id)) return null;
  if (getComponent(ctx.state, id, 'owner')?.nacao !== nacao) return null;
  return getComponent(ctx.state, id, 'unit')?.tipo === 'printer' ? id : null;
}

/** Estrutura que a Impressora imprime (a Nave não é impressa). */
type EstruturaImpressa = Extract<CustosId, EstruturasId>;

function ehEstrutura(tipo: unknown): tipo is EstruturaImpressa {
  return tipo !== 'ship' && dados.estruturas.some((e) => e.id === tipo);
}

export const comandosDeObra: Record<string, CommandHandler> = {
  /**
   * PRD-04/PRD-10: posiciona a estrutura na fila da Impressora. Local inválido emite
   * `posicionamento_recusado` com o motivo (UI-08).
   */
  posicionar_estrutura: (ctx, comando) => {
    const d = (comando.dados ?? {}) as {
      id?: unknown;
      tipo?: unknown;
      x?: unknown;
      y?: unknown;
      z?: unknown;
    };
    const impressora = impressoraDa(ctx, comando.nacao, d.id);
    const alvo = direcaoDoComando(d);
    if (impressora === null || !alvo || !ehEstrutura(d.tipo) || !produz('printer', d.tipo)) return;
    if (!cabeNaFila(ctx, impressora, d.tipo)) return;
    const motivo = validarPosicionamento(ctx, d.tipo, alvo, comando.nacao);
    if (motivo) {
      ctx.emit('posicionamento_recusado', { nacao: comando.nacao, tipo: d.tipo, motivo });
      return;
    }
    const obra = reservarEstrutura(ctx, comando.nacao, d.tipo, alvo);
    if (obra === null) return;
    const pago = pagar(ctx, comando.nacao, d.tipo);
    if (!pago) {
      destroyEntity(ctx.state, obra);
      return;
    }
    setComponent(ctx.state, obra, 'obra', {
      progresso: 0,
      instalada: false,
      pago,
      construtores: [],
    });
    enfileirar(ctx, impressora, d.tipo, obra, pago);
  },
  /** PRD-14: cancela estruturas em construção (ou só reservadas). */
  cancelar_obra: (ctx, comando) => {
    const d = (comando.dados ?? {}) as { ids?: unknown };
    if (!Array.isArray(d.ids)) return;
    for (const id of [...new Set(d.ids)].sort((a, b) => Number(a) - Number(b))) {
      if (typeof id !== 'number' || !isAlive(ctx.state, id)) continue;
      if (getComponent(ctx.state, id, 'owner')?.nacao !== comando.nacao) continue;
      removerObra(ctx, id);
    }
  },
};
