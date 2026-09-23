import type { EstruturasId, MoveisId } from '../data';
import type { NacaoId } from './types';

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
  order: { tipo: 'nenhuma' | 'mover' | 'patrulhar' | 'manter'; patrulha: [Ponto, Ponto] | null };
  /** Drones (MOV-07). */
  air: { estado: 'voando' | 'pousando' | 'pousado' | 'decolando'; timer_s: number };
  /** Produtores de unidades (PRD-08). */
  producer: { pontoDeEncontro: Ponto | null };
  /** Mina plantada (UNI-07); regras completas na T-064. */
  mine: { armada: boolean };
}

export type ComponentName = keyof ComponentMap;
