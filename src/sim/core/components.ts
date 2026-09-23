import type { EstruturasId, MoveisId } from '../data';
import type { NacaoId } from './types';

export type Ponto = [number, number];

/**
 * Componentes conhecidos da simulação (ECS leve, TEC-06): dados simples e serializáveis.
 * Outros módulos PODEM acrescentar componentes por declaration merging nesta interface.
 */
export interface ComponentMap {
  /** Posição no mundo, em metros; y é a altura. */
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
    /** Direção (rad; 0 = +x, π/2 = +z). */
    heading: number;
    speed: number;
    /** Pontos de passagem restantes (mundo). */
    rota: Ponto[];
    /** Posição final da ordem atual (o lugar da unidade na formação). */
    destino: Ponto | null;
    /** Alvo do campo de fluxo compartilhado do grupo (MOV-05), ou null para A*. */
    fluxo: Ponto | null;
    /** Teto de velocidade do grupo (MOV-06), ou null. */
    limiteVel: number | null;
    /** Segundos sem ordem de deslocamento. */
    ocioso_s: number;
    /** Segundos tentando andar sem sair do lugar (dispara nova rota). */
    travado_s: number;
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
