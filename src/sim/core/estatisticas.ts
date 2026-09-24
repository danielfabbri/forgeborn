/**
 * REG-23: estatísticas de fim de partida de cada nação, acumuladas pela simulação.
 * O % do mapa explorado sai da grade de névoa na hora de mostrar (não é acumulado).
 */
import type { NacaoId } from './types';

export interface EstatisticasDaNacao {
  /** Unidades de recurso descarregadas, por recurso (ECO-14). */
  coletado: Record<string, number>;
  energiaGerada: number;
  energiaConsumida: number;
  /** Por tipo de unidade móvel. */
  impressas: Record<string, number>;
  perdidas: Record<string, number>;
  destruidas: Record<string, number>;
  /** Por tipo de estrutura. */
  construidas: Record<string, number>;
  estruturasPerdidas: Record<string, number>;
  /** Comandos dados pela nação (ações por minuto). */
  acoes: number;
}

/** Comandos de montagem da partida e de depuração: não contam como ações do jogador. */
export const COMANDOS_DE_SISTEMA: ReadonlySet<string> = new Set([
  'iniciar_partida',
  'semear_jazidas',
  'ativar_ia',
]);

export function novasEstatisticas(): EstatisticasDaNacao {
  return {
    coletado: {},
    energiaGerada: 0,
    energiaConsumida: 0,
    impressas: {},
    perdidas: {},
    destruidas: {},
    construidas: {},
    estruturasPerdidas: {},
    acoes: 0,
  };
}

export function contar(tabela: Record<string, number>, chave: string, n = 1): void {
  tabela[chave] = (tabela[chave] ?? 0) + n;
}

export type EstatisticasDaPartida = Record<NacaoId, EstatisticasDaNacao>;
