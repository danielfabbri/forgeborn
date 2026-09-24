/**
 * Rede de energia de cada nação (ENE-01 a ENE-05, ENE-22): geração, capacidade do banco,
 * excedente perdido e racionamento por prioridade quando a energia disponível não cobre a
 * demanda do tick: (1) defesas, (2) satélites, (3) impressão na Nave, (4) portas de recarga,
 * divididas igualmente entre as unidades acopladas.
 */
import { entitiesWith, getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EstadoDaRede, SimState } from '../core/state';
import type { EntityId, NacaoId } from '../core/types';
import { dados } from '../data';
import { statsEstrutura } from '../units/stats';

/** Segundos da janela de consumo médio do HUD (ENE-22). */
const JANELA_CONSUMO_S = 10;

function fatorSolar(state: SimState): number {
  return dados.cenarios.find((c) => c.id === state.cenario)?.fator_solar ?? 1;
}

/** Estruturas prontas da nação: em obra não geram nem guardam energia (PRD-12). */
function estruturasDa(state: SimState, nacao: NacaoId): EntityId[] {
  return entitiesWith(state, 'structure', 'owner').filter(
    (id) => getComponent(state, id, 'owner')!.nacao === nacao && !getComponent(state, id, 'obra'),
  );
}

/** A Usina Nuclear está gerando (ligada, religada e abastecida)? */
export function reatorGerando(state: SimState, id: EntityId): boolean {
  const reator = getComponent(state, id, 'reator');
  return reator !== undefined && reator.ligado && reator.religando_s <= 0 && reator.ciclo_s > 0;
}

/** ENE-01/ENE-07: geração (EN/s) da rede da nação. */
export function geracaoDaRede(state: SimState, nacao: NacaoId): number {
  let total = 0;
  for (const id of estruturasDa(state, nacao)) {
    const tipo = getComponent(state, id, 'structure')!.tipo;
    const base = statsEstrutura(tipo).geracao_en_s;
    if (base <= 0) continue;
    if (tipo === 'solar_plant') total += base * fatorSolar(state);
    else if (tipo === 'nuclear_plant') total += reatorGerando(state, id) ? base : 0;
    else total += base;
  }
  return total;
}

/** ENE-02: capacidade do banco (EN) da nação. */
export function capacidadeDaRede(state: SimState, nacao: NacaoId): number {
  return estruturasDa(state, nacao).reduce(
    (s, id) => s + statsEstrutura(getComponent(state, id, 'structure')!.tipo).banco_en,
    0,
  );
}

interface PedidoDePorta {
  unidade: EntityId;
  /** EN que a unidade quer neste tick. */
  pedido: number;
}

/** Pedidos das unidades acopladas: até a taxa da porta, até encher a bateria. */
function pedidosDePorta(ctx: SystemContext, nacao: NacaoId): PedidoDePorta[] {
  const { state } = ctx;
  const pedidos: PedidoDePorta[] = [];
  for (const id of estruturasDa(state, nacao)) {
    const portas = getComponent(state, id, 'portas');
    if (!portas) continue;
    const taxa = statsEstrutura(getComponent(state, id, 'structure')!.tipo).taxa_porta_en_s;
    for (const unidade of portas.ocupantes) {
      if (unidade === null) continue;
      const b = getComponent(state, unidade, 'bateria');
      if (!b) continue;
      const pedido = Math.min(taxa * ctx.dt, b.max - b.en);
      if (pedido > 0) pedidos.push({ unidade, pedido });
    }
  }
  return pedidos;
}

/** Divide `disponivel` igualmente entre os pedidos, redistribuindo o que sobra dos menores. */
function dividirIgualmente(pedidos: PedidoDePorta[], disponivel: number): Map<EntityId, number> {
  const recebido = new Map<EntityId, number>();
  let restantes = [...pedidos].sort((a, b) => a.pedido - b.pedido || a.unidade - b.unidade);
  let sobra = disponivel;
  while (restantes.length > 0 && sobra > 1e-12) {
    const cota = sobra / restantes.length;
    const menor = restantes[0]!;
    if (menor.pedido <= cota) {
      recebido.set(menor.unidade, menor.pedido);
      sobra -= menor.pedido;
      restantes = restantes.slice(1);
    } else {
      for (const p of restantes) recebido.set(p.unidade, cota);
      sobra = 0;
      restantes = [];
    }
  }
  return recebido;
}

interface ConsumidorDaRede {
  prioridade: 1 | 2 | 3;
  demanda_en_s: number;
  /** Onde fica a fração atendida (e o offline dos satélites). */
  registro: { atendido: number; offline?: boolean };
}

/**
 * ENE-03: consumidores da rede na ordem de prioridade — os de `consumidor` (satélites,
 * impressão na Nave) e as armas das estruturas (Torres e defesa da Nave, prioridade 1).
 */
function consumidoresDa(state: SimState, nacao: NacaoId): ConsumidorDaRede[] {
  const lista: Array<ConsumidorDaRede & { id: EntityId }> = [];
  for (const id of estruturasDa(state, nacao)) {
    const c = getComponent(state, id, 'consumidor');
    if (c) lista.push({ id, prioridade: c.prioridade, demanda_en_s: c.demanda_en_s, registro: c });
    const arma = getComponent(state, id, 'arma');
    if (arma) lista.push({ id, prioridade: 1, demanda_en_s: arma.demanda_en_s, registro: arma });
  }
  return lista.sort((a, b) => a.prioridade - b.prioridade || a.id - b.id);
}

/** Um tick da rede de cada nação (ENE-01 a ENE-05). */
export function passoRede(ctx: SystemContext): void {
  const { state, dt } = ctx;
  for (const nacao of state.nacoes) {
    const rede = state.energia[nacao]!;
    const geracao = geracaoDaRede(state, nacao);
    const capacidade = capacidadeDaRede(state, nacao);
    rede.geracao = geracao;
    // ENE-05: com estruturas a menos, o banco acima da capacidade se perde.
    rede.banco = Math.min(rede.banco, capacidade);

    const consumidores = consumidoresDa(state, nacao);
    const portas = pedidosDePorta(ctx, nacao);
    const demandaConsumidores = consumidores.reduce((s, c) => s + c.demanda_en_s * dt, 0);
    const demandaPortas = portas.reduce((s, p) => s + p.pedido, 0);
    const disponivel = rede.banco + geracao * dt;
    const demanda = demandaConsumidores + demandaPortas;

    let entregue = 0;
    let recebido: Map<EntityId, number>;
    if (demanda <= disponivel + 1e-12) {
      for (const c of consumidores) {
        c.registro.atendido = 1;
        if ('offline' in c.registro) c.registro.offline = false;
      }
      recebido = new Map(portas.map((p) => [p.unidade, p.pedido]));
      entregue = demanda;
      rede.banco = Math.min(capacidade, disponivel - demanda);
      rede.racionamento = false;
    } else {
      // ENE-04: racionamento por prioridade.
      let resta = disponivel;
      for (const prioridade of [1, 2, 3] as const) {
        const doNivel = consumidores.filter((c) => c.prioridade === prioridade);
        const pedido = doNivel.reduce((s, c) => s + c.demanda_en_s * dt, 0);
        const fracao = pedido > 0 ? Math.min(1, resta / pedido) : 1;
        for (const c of doNivel) {
          c.registro.atendido = fracao;
          if ('offline' in c.registro) c.registro.offline = prioridade === 2 && fracao < 1 - 1e-12;
        }
        resta -= pedido * fracao;
        entregue += pedido * fracao;
      }
      recebido = dividirIgualmente(portas, Math.max(0, resta));
      for (const u of recebido.values()) entregue += u;
      rede.banco = 0;
      rede.racionamento = true;
    }
    for (const [unidade, en] of recebido) {
      const b = getComponent(state, unidade, 'bateria')!;
      b.en = Math.min(b.max, b.en + en);
    }
    registrarConsumo(rede, entregue, ctx);
    // REG-23: energia gerada e consumida.
    const estatisticas = state.estatisticas[nacao];
    if (estatisticas) {
      estatisticas.energiaGerada += geracao * dt;
      estatisticas.energiaConsumida += entregue;
    }
  }
}

function registrarConsumo(rede: EstadoDaRede, en: number, ctx: SystemContext): void {
  const ticksPorSegundo = Math.round(1 / ctx.dt);
  rede.consumoNoSegundo += en;
  rede.ticksNoSegundo++;
  if (rede.ticksNoSegundo >= ticksPorSegundo) {
    rede.consumoPorSegundo.push(rede.consumoNoSegundo);
    if (rede.consumoPorSegundo.length > JANELA_CONSUMO_S) rede.consumoPorSegundo.shift();
    rede.consumoNoSegundo = 0;
    rede.ticksNoSegundo = 0;
  }
}

export interface LeituraDaRede {
  geracao: number;
  /** Consumo médio (EN/s) dos últimos 10 s. */
  consumo: number;
  banco: number;
  capacidade: number;
  indicador: 'verde' | 'amarelo' | 'vermelho';
}

/** ENE-22: leitura da rede para o HUD. */
export function leituraDaRede(state: SimState, nacao: NacaoId): LeituraDaRede {
  const rede = state.energia[nacao]!;
  const capacidade = capacidadeDaRede(state, nacao);
  const janela = rede.consumoPorSegundo;
  const consumo = janela.length > 0 ? janela.reduce((s, v) => s + v, 0) / janela.length : 0;
  const saldo = rede.geracao - consumo;
  const baixo = capacidade > 0 ? rede.banco <= 0.25 * capacidade : true;
  const indicador =
    rede.racionamento || (saldo < 0 && baixo) ? 'vermelho' : saldo < 0 ? 'amarelo' : 'verde';
  return { geracao: rede.geracao, consumo, banco: rede.banco, capacidade, indicador };
}
