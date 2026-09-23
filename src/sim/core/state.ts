import { dados, param, type RecursosId } from '../data';
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
}

function porRecurso(valor: (recurso: RecursosId) => number): Record<RecursosId, number> {
  return Object.fromEntries(dados.recursos.map((r) => [r.id, valor(r.id)])) as Record<
    RecursosId,
    number
  >;
}

export function createInitialState(seed: number, nacoes: NacaoId[]): SimState {
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
    diretivas: Object.fromEntries(
      nacoes.map((n) => [n, porRecurso((r) => param(`diretiva_${r}_pct` as never))]),
    ) as SimState['diretivas'],
  };
}
