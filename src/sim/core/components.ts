import type { EstruturasId, MoveisId, RecursosId } from '../data';
import type { EntityId, NacaoId } from './types';

/** Direção unitária a partir do centro do planeta (CEN-14): um ponto da superfície. */
export type Ponto = [number, number, number];

/**
 * Componentes conhecidos da simulação (ECS leve, TEC-06): dados simples e serializáveis.
 * Outros módulos PODEM acrescentar componentes por declaration merging nesta interface.
 */
export interface ComponentMap {
  /** Posição no mundo, em metros, com o centro do planeta na origem (CEN-14). */
  position: { x: number; y: number; z: number };
  /** Nação dona do corpo. */
  owner: { nacao: NacaoId };
  /** Unidade móvel e seu tipo (linha de `dados:moveis`). */
  unit: { tipo: MoveisId };
  /** Estrutura e seu tipo (linha de `dados:estruturas`). */
  structure: { tipo: EstruturasId };
  /** Obstáculo rígido circular (MOV-04): estruturas e jazidas. */
  obstacle: { raio: number };
  /** Estado de deslocamento de uma unidade móvel. */
  locomotion: {
    /** Rumo: vetor unitário tangente à superfície na posição atual (CEN-14). */
    rumo: [number, number, number];
    speed: number;
    /** Pontos de passagem restantes (direções). */
    rota: Ponto[];
    /** Posição final da ordem atual (o lugar da unidade na formação). */
    destino: Ponto | null;
    /** Alvo do campo de fluxo compartilhado do grupo (MOV-05), ou null para A*. */
    fluxo: Ponto | null;
    /** Teto de velocidade do grupo (MOV-06), ou null. */
    limiteVel: number | null;
    /** Segundos sem ordem de deslocamento. */
    ocioso_s: number;
    /** Segundos tentando andar sem se afastar da âncora (dispara nova rota). */
    travado_s: number;
    /** Onde a unidade estava quando começou a contar o travamento. */
    ancora: Ponto | null;
  };
  /** Ordem corrente de movimento (CTL-07, CMB-13). */
  order: {
    /** `tarefa`: movimento conduzido por uma tarefa automática (coleta, ciclo do silo). */
    tipo: 'nenhuma' | 'mover' | 'patrulhar' | 'manter' | 'tarefa';
    patrulha: [Ponto, Ponto] | null;
  };
  /** Drones (MOV-07). */
  air: { estado: 'voando' | 'pousando' | 'pousado' | 'decolando'; timer_s: number };
  /** Produtores de unidades (PRD-08). */
  producer: { pontoDeEncontro: Ponto | null };
  /** Mina plantada (UNI-07); regras completas na T-064. */
  mine: { armada: boolean };
  /**
   * Jazida de recurso (ECO-04, ECO-05). `vagas` tem `slots_por_jazida` posições fixas em volta da
   * jazida, com o hover designado (indo ou minerando) ou null.
   */
  jazida: {
    recurso: RecursosId;
    quantidade: number;
    inicial: number;
    vagas: Array<EntityId | null>;
    fila: EntityId[];
  };
  /** Ciclo de coleta do Hover de Exploração (ECO-09 a ECO-12, ECO-19, ECO-20). */
  coleta: {
    estado:
      'ocioso' | 'indo_jazida' | 'esperando' | 'minerando' | 'indo_entregar' | 'descarregando';
    jazida: EntityId | null;
    /** Recurso que o hover está coletando (ou vai coletar). */
    recurso: RecursosId | null;
    /** Carga a bordo e o recurso dela (ECO-15: em trânsito). */
    carga: number;
    cargaRecurso: RecursosId | null;
    /** Ponto de entrega escolhido (Nave, Armazém ou Silo ancorado). */
    entrega: EntityId | null;
    timer_s: number;
    /** ECO-20: designado pelo jogador (fica na jazida até esgotar). */
    manual: boolean;
  };
  /** Silo Móvel (ECO-22 a ECO-25). */
  silo: {
    estado:
      | 'solto'
      | 'ancorando'
      | 'ancorado'
      | 'desancorando'
      | 'indo_descarregar'
      | 'descarregando'
      | 'voltando';
    timer_s: number;
    carga: Partial<Record<RecursosId, number>>;
    /** Onde voltar a ancorar depois do ciclo (ECO-24). */
    ancora: Ponto | null;
    cicloAutomatico: boolean;
    limiar_pct: number;
    entrega: EntityId | null;
  };
}

export type ComponentName = keyof ComponentMap;
