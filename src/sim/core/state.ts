import { type CenariosId, dados, param, type RecursosId } from '../data';
import type { ComponentMap, ComponentName } from './components';
import { type RngState, seedRng } from './rng';
import type { EntityId, NacaoId, QueuedCommand } from './types';

export type ComponentStores = { [K in ComponentName]?: Record<EntityId, ComponentMap[K]> };

/** Estado completo da simulação. Tudo aqui é serializável em JSON (TEC-08). */
export interface SimState {
  /** Próximo tick a executar; igual ao número de ticks já simulados. */
  tick: number;
  seed: number;
  /** Nações participantes, na ordem que desempata comandos do mesmo tick. */
  nacoes: NacaoId[];
  rng: RngState;
  nextEntityId: EntityId;
  /** IDs vivos em ordem crescente: a ordem estável de iteração (TEC-05). */
  entities: EntityId[];
  components: ComponentStores;
  commandQueue: QueuedCommand[];
  nextCommandSeq: number;
  /** Sobe quando um obstáculo rígido surge, some ou muda de tamanho; invalida caches de navegação. */
  versaoObstaculos: number;
  /** ECO-14: estoque global de cada nação (recurso utilizável). */
  estoques: Record<NacaoId, Record<RecursosId, number>>;
  /** ECO-18: Diretiva de Coleta de cada nação (% de hovers por recurso). */
  diretivas: Record<NacaoId, Record<RecursosId, number>>;
  /** Cenário da partida (§14.1). */
  cenario: CenariosId;
  /** §6.2: rede de energia de cada nação. */
  energia: Record<NacaoId, EstadoDaRede>;
  /** REG-09 a REG-12, REG-22: placar e situação de cada nação. */
  placar: Record<NacaoId, PlacarDaNacao>;
  /** UI-02: chaves globais das Diretivas. */
  chaves: Record<NacaoId, ChavesDaNacao>;
  /** REG-12: tempo limite (s) da partida, ou null. */
  tempoLimite_s: number | null;
  /**
   * VIS-01: grade de névoa de cada nação (0 escuro, 1 névoa, 2 visível), uma posição por célula
   * de `celula_nevoa_m`. Vazia até o primeiro passo de visão (ou sem mapa).
   */
  nevoa: Record<NacaoId, number[]>;
  /** REG-11/REG-12: fim da partida, ou null. */
  resultado: { vencedor: NacaoId | null; motivo: 'eliminacao' | 'tempo'; tick: number } | null;
}

export interface PlacarDaNacao {
  /** VR descarregado (REG-22). */
  vrColetado: number;
  /** VR inimigo destruído (REG-22). */
  vrDestruido: number;
  navesDestruidas: number;
  /** Já teve Nave ou Impressora (só assim pode ser eliminada). */
  presente: boolean;
  eliminada: boolean;
}

export interface ChavesDaNacao {
  /** ECO-13: fuga de hovers. */
  fuga: boolean;
  /** UNI-01: fabricação automática de minas. */
  fabricarMinas: boolean;
}

export interface EstadoDaRede {
  /** EN no banco. */
  banco: number;
  /** ENE-22: consumo (EN) de cada um dos últimos 10 segundos completos. */
  consumoPorSegundo: number[];
  /** Consumo acumulado no segundo corrente e quantos ticks ele já tem. */
  consumoNoSegundo: number;
  ticksNoSegundo: number;
  /** Geração (EN/s) no último tick. */
  geracao: number;
  /** ENE-04: racionamento ativo no último tick. */
  racionamento: boolean;
}

function porRecurso(valor: (recurso: RecursosId) => number): Record<RecursosId, number> {
  return Object.fromEntries(dados.recursos.map((r) => [r.id, valor(r.id)])) as Record<
    RecursosId,
    number
  >;
}

export function createInitialState(
  seed: number,
  nacoes: NacaoId[],
  cenario: CenariosId = 'lua',
): SimState {
  if (nacoes.length === 0) throw new Error('A partida precisa de ao menos uma nação');
  if (new Set(nacoes).size !== nacoes.length) throw new Error('Nação repetida na partida');
  return {
    tick: 0,
    seed,
    nacoes: [...nacoes],
    rng: seedRng(seed),
    nextEntityId: 1,
    entities: [],
    components: {},
    commandQueue: [],
    nextCommandSeq: 0,
    versaoObstaculos: 0,
    estoques: Object.fromEntries(
      nacoes.map((n) => [n, porRecurso(() => 0)]),
    ) as SimState['estoques'],
    cenario,
    energia: Object.fromEntries(
      nacoes.map((n): [NacaoId, EstadoDaRede] => [
        n,
        {
          banco: 0,
          consumoPorSegundo: [] as number[],
          consumoNoSegundo: 0,
          ticksNoSegundo: 0,
          geracao: 0,
          racionamento: false,
        },
      ]),
    ) as SimState['energia'],
    diretivas: Object.fromEntries(
      nacoes.map((n) => [n, porRecurso((r) => param(`diretiva_${r}_pct` as never))]),
    ) as SimState['diretivas'],
    placar: Object.fromEntries(
      nacoes.map((n): [NacaoId, PlacarDaNacao] => [
        n,
        { vrColetado: 0, vrDestruido: 0, navesDestruidas: 0, presente: false, eliminada: false },
      ]),
    ) as SimState['placar'],
    chaves: Object.fromEntries(
      nacoes.map((n): [NacaoId, ChavesDaNacao] => [n, { fuga: true, fabricarMinas: true }]),
    ) as SimState['chaves'],
    tempoLimite_s: null,
    nevoa: Object.fromEntries(nacoes.map((n) => [n, [] as number[]])) as SimState['nevoa'],
    resultado: null,
  };
}
