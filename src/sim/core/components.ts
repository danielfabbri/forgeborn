import type { NacaoId } from './types';

/**
 * Componentes conhecidos da simulação (ECS leve, TEC-06): dados simples e serializáveis.
 * Outros módulos PODEM acrescentar componentes por declaration merging nesta interface.
 */
export interface ComponentMap {
  /** Posição no mundo, em metros; y é a altura. */
  position: { x: number; y: number; z: number };
  /** Nação dona do corpo. */
  owner: { nacao: NacaoId };
}

export type ComponentName = keyof ComponentMap;
