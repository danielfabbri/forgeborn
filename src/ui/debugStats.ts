import { signal } from '@preact/signals';
import type { LeituraDaRede } from '../sim/energia';

/** Métricas do overlay de depuração (TEC-26), atualizadas pelo loop principal. */
export interface DebugStats {
  fps: number;
  tickMs: number;
  entidades: number;
  tick: number;
  /** Chamadas de desenho do último quadro (orçamento da TEC-16). */
  drawCalls: number;
  triangulos: number;
  /** ECO-14/ECO-15: estoque e material em trânsito do jogador, por recurso. */
  estoque: Record<string, number>;
  transito: Record<string, number>;
  /** ENE-22: leitura da rede do jogador (até o HUD da T-047). */
  energia: LeituraDaRede | null;
}

export const debugStats = signal<DebugStats>({
  fps: 0,
  tickMs: 0,
  entidades: 0,
  tick: 0,
  drawCalls: 0,
  triangulos: 0,
  estoque: {},
  transito: {},
  energia: null,
});
export const debugVisible = signal(false);
