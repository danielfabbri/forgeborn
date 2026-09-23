import type { Mundo } from '../map/mundo';
import type { SimState } from './state';
import type { JsonValue, QueuedCommand } from './types';

/**
 * TEC-06: ordem fixa dos sistemas em cada tick. `comandos` e `eventos` são do núcleo;
 * os demais são plugáveis e começam vazios até suas tarefas (IA, produção, energia...).
 */
export const SYSTEM_ORDER = [
  'comandos',
  'ia',
  'producao',
  'energia',
  'movimento',
  'economia',
  'combate',
  'projeteis',
  'morte',
  'visao',
  'eventos',
] as const;

export type SystemId = (typeof SYSTEM_ORDER)[number];
export type GameSystemId = Exclude<SystemId, 'comandos' | 'eventos'>;

export interface SystemContext {
  readonly state: SimState;
  /** Tick em execução. */
  readonly tick: number;
  /** Duração de um tick em segundos (1 / tick_hz). */
  readonly dt: number;
  /** Comandos deste tick, já na ordem de execução. */
  readonly commands: readonly QueuedCommand[];
  /** Mapa e grades da partida (derivados da seed; fora do snapshot). Null em testes sem mapa. */
  readonly mundo: Mundo | null;
  emit(tipo: string, dados: JsonValue): void;
}

export type SystemFn = (ctx: SystemContext) => void;
export type CommandHandler = (ctx: SystemContext, command: QueuedCommand) => void;
