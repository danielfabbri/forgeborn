import { signal } from '@preact/signals';

/** Métricas do overlay de depuração (TEC-26), atualizadas pelo loop principal. */
export interface DebugStats {
  fps: number;
  tickMs: number;
  entidades: number;
  tick: number;
}

export const debugStats = signal<DebugStats>({ fps: 0, tickMs: 0, entidades: 0, tick: 0 });
export const debugVisible = signal(false);
