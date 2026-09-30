import { type EstatisticasDaPartida, novasEstatisticas } from './estatisticas';
import { type CenariosId, dados, param, type RecursosId } from '../data';
import type { ComponentMap, ComponentName } from './components';
import { type RngState, seedRng } from './rng';
import type { EntityId, NacaoId, QueuedCommand } from './types';
import type { EstadoDaTempestade } from '../cenario/tempestade';
import type { EstadoDaChuva } from '../cenario/chuvaAcida';
import type { Relacao } from '../relacoes/temperamento';

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
  /** FB-01: névoa normal, explorada (começa em névoa) ou revelada (sempre visível). */
  modoNevoa: ModoNevoa;
  /** REG-23: estatísticas de fim de partida. */
  estatisticas: EstatisticasDaPartida;
  /**
   * VIS-01: grade de névoa de cada nação (0 escuro, 1 névoa, 2 visível), uma posição por célula
   * de `celula_nevoa_m`. Vazia até o primeiro passo de visão (ou sem mapa).
   */
  nevoa: Record<NacaoId, number[]>;
  /** VIS-06: sinais de radar (posições sem tipo) que cada nação vê. */
  sinais: Record<NacaoId, [number, number, number][]>;
  /** VIS-07: quem estava no radar de cada Sentinela na última varredura (para o AL-03). */
  radar: Record<string, number[]>;
  /** §13: estado de cada nação controlada pela IA. */
  ias: Partial<Record<NacaoId, EstadoDaIa>>;
  /** CAM-02 (D-73): itens liberados na missão (todas as nações), ou null fora da campanha. */
  liberados: string[] | null;
  /** CAM-06 (D-73): nações sem Nave, eliminadas ao perder todas as estruturas e unidades. */
  semForja: NacaoId[];
  /** ENE-25 (D-85): cabos entre estruturas, pares [a, b] com a < b, em ordem. */
  cabos: Array<[EntityId, EntityId]>;
  /** ENE-02 (D-85): banco (EN) guardado em cada estrutura, por id. */
  bancos: Record<number, number>;
  /** REG-24 a REG-28: temperamento de cada par de nações (chave "a|b" em ordem). */
  relacoes: Record<string, Relacao>;
  /** CEN-03: próxima (ou atual) tempestade de poeira; só em cenários com o evento. */
  tempestade?: EstadoDaTempestade;
  /** CEN-18: próxima (ou atual) chuva ácida (Vênus); só em cenários com o evento. */
  chuva?: EstadoDaChuva;
  /** REG-11/REG-12: fim da partida, ou null. */
  resultado: { vencedor: NacaoId | null; motivo: 'eliminacao' | 'tempo'; tick: number } | null;
}

export type ModoNevoa = 'normal' | 'explorado' | 'revelado';

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

/** IA de uma nação (§13). */
export interface EstadoDaIa {
  nivel: 'facil' | 'normal' | 'dificil' | 'brutal';
  /** Próxima decisão (s de jogo), a cada `reacao_s`. */
  proxima_s: number;
  /** Próxima rodada do Estrategista (s de jogo), a cada `ia_intervalo_estrategista_s`. */
  proximoEstrategista_s: number;
  /** IA-01: postura global escolhida pelo Estrategista. */
  postura: 'expandir' | 'economia' | 'armar' | 'atacar' | 'defender';
  /** VIS-04: estruturas inimigas já vistas (por ID), com a última posição. */
  conhecidas: Record<
    string,
    { nacao: NacaoId; tipo: string; d: [number, number, number]; tick: number }
  >;
  /** IA-03: exército inimigo observado (VR por tipo), acumulado com decaimento. */
  observado: Record<string, number>;
  /** IA-04: onda de ataque em curso. */
  onda: {
    vrInicial: number;
    alvo: NacaoId;
    ponto: [number, number, number];
    /** Quem partiu na onda; os que nascem depois esperam a próxima. */
    membros: number[];
    /**
     * IA-14 (D-90): a onda vai pelo mar (o alvo não tem caminho por terra): embarcar nos
     * Transportes, esperar todos (até `prazo_tick`), navegar e desembarcar perto do alvo.
     */
    naval?: {
      fase: 'embarcar' | 'aguardar' | 'navegar';
      transportes: number[];
      prazo_tick: number;
    };
  } | null;
  /**
   * IA-14 (D-90): expansão pelo mar: uma Impressora vai de Transporte até a jazida `alvo` (numa
   * ilha) e ergue lá uma Usina Solar e um Armazém ligados por cabo.
   */
  expansaoNaval?: {
    alvo: [number, number, number];
    impressora: number;
    transporte: number | null;
    fase: 'transporte' | 'embarcar' | 'navegar' | 'construir';
    prazo_tick: number;
  } | null;
  /** Batedor: índices dos pontos de exploração já visitados. */
  visitados: number[];
  /** Batedor: tick-limite de cada ida (por id); quem não chega a tempo parte para o próximo ponto. */
  prazoDoBatedor?: Record<number, number>;
  /** IA-08: já viu míssil inimigo em voo (a meta de Antiaéreas sobe). */
  viuMisseis?: boolean;
  /** IA-10: último míssil longo lançado (s de jogo). */
  ultimoLongo_s?: number;
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
  /**
   * D-85: o último banco que a simulação escreveu (rede da Nave); se `banco` mudou por fora
   * (depuração, testes), o valor novo é repartido entre as estruturas dessa rede.
   */
  bancoEscrito?: number;
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
    liberados: null,
    relacoes: {},
    cabos: [],
    bancos: {},
    semForja: [],
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
    modoNevoa: 'normal',
    estatisticas: Object.fromEntries(
      nacoes.map((n) => [n, novasEstatisticas()]),
    ) as EstatisticasDaPartida,
    nevoa: Object.fromEntries(nacoes.map((n) => [n, [] as number[]])) as SimState['nevoa'],
    ias: {},
    sinais: Object.fromEntries(
      nacoes.map((n): [NacaoId, [number, number, number][]] => [n, []]),
    ) as SimState['sinais'],
    radar: {},
    resultado: null,
  };
}
