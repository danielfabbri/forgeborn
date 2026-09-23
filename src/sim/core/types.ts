import type { NacoesId } from '../data';

export type NacaoId = NacoesId;
export type EntityId = number;

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** TEC-07: toda ação do jogador ou da IA entra na simulação como Comando serializável. */
export interface Command {
  tick: number;
  nacao: NacaoId;
  tipo: string;
  dados: JsonValue;
}

/** Comando aceito na fila, com o número de chegada que desempata a ordem. */
export interface QueuedCommand extends Command {
  seq: number;
}

/** TEC-09: evento publicado pela simulação para render, UI e áudio. */
export interface SimEvent {
  tick: number;
  tipo: string;
  dados: JsonValue;
}
