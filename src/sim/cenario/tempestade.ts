/**
 * CEN-03: tempestade de poeira (Marte). O intervalo até a próxima é sorteado pela seed entre
 * `tempestade_intervalo_min_s` e `tempestade_intervalo_max_s` (contado do início da partida e,
 * depois, do fim da anterior); ela dura `tempestade_duracao_s`. O AL-15 sai `tempestade_aviso_s`
 * antes para todas as nações. Durante o evento, a visão e a geração solar caem (CEN-02 aplica
 * também o `mult_visao` fixo do cenário).
 */
import type { SystemContext } from '../core/pipeline';
import { nextInt } from '../core/rng';
import type { SimState } from '../core/state';
import { dados, param } from '../data';

export interface EstadoDaTempestade {
  /** Tick em que a próxima (ou a atual) começa. */
  inicio: number;
  /** Tick em que ela termina. */
  fim: number;
  /** O AL-15 desta tempestade já saiu. */
  avisada: boolean;
}

const cenarioDe = (state: SimState) => dados.cenarios.find((c) => c.id === state.cenario);

export function temTempestade(state: SimState): boolean {
  return cenarioDe(state)?.evento === 'tempestade_poeira';
}

export function tempestadeAtiva(state: SimState): boolean {
  const t = state.tempestade;
  return t != null && state.tick >= t.inicio && state.tick < t.fim;
}

/** CEN-02/CEN-03: multiplicador da visão de todos os corpos agora. */
export function multVisao(state: SimState): number {
  const base = cenarioDe(state)?.mult_visao ?? 1;
  return tempestadeAtiva(state) ? base * param('tempestade_mult_visao') : base;
}

/** CEN-03: multiplicador temporário da geração solar (ENE-07). */
export function multSolarDoEvento(state: SimState): number {
  return tempestadeAtiva(state) ? param('tempestade_mult_solar') : 1;
}

function agendar(state: SimState, aPartirDe: number, tickHz: number): EstadoDaTempestade {
  const intervalo = nextInt(
    state.rng,
    Math.round(param('tempestade_intervalo_min_s') * tickHz),
    Math.round(param('tempestade_intervalo_max_s') * tickHz),
  );
  const inicio = aPartirDe + intervalo;
  return {
    inicio,
    fim: inicio + Math.round(param('tempestade_duracao_s') * tickHz),
    avisada: false,
  };
}

/** Roda antes da energia e da visão do tick. */
export function sistemaTempestade(ctx: SystemContext): void {
  const { state } = ctx;
  if (!temTempestade(state)) return;
  const tickHz = Math.round(1 / ctx.dt);
  state.tempestade ??= agendar(state, state.tick, tickHz);
  let t = state.tempestade;
  if (state.tick >= t.fim) {
    ctx.emit('tempestade', { ativa: false });
    t = state.tempestade = agendar(state, t.fim, tickHz);
  }
  if (!t.avisada && state.tick >= t.inicio - Math.round(param('tempestade_aviso_s') * tickHz)) {
    t.avisada = true;
    for (const nacao of state.nacoes) ctx.emit('alerta', { id: 'AL-15', nacao });
  }
  if (state.tick === t.inicio) ctx.emit('tempestade', { ativa: true });
}
