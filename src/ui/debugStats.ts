import { signal } from '@preact/signals';

/** Métricas do overlay de depuração (TEC-26), atualizadas pelo loop principal. */
export interface DebugStats {
  fps: number;
  tickMs: number;
  entidades: number;
  tick: number;
  /** Chamadas de desenho do último quadro (orçamento da TEC-16). */
  drawCalls: number;
  triangulos: number;
}

export const debugStats = signal<DebugStats>({
  fps: 0,
  tickMs: 0,
  entidades: 0,
  tick: 0,
  drawCalls: 0,
  triangulos: 0,
});
export const debugVisible = signal(false);
