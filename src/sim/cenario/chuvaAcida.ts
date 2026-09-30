/**
 * CEN-18: chuva ácida (Vênus, D-97). O intervalo até a próxima é sorteado pela seed entre
 * `venus_chuva_intervalo_min_s` e `venus_chuva_intervalo_max_s` (contado do início da partida e,
 * depois, do fim da anterior); ela dura `venus_chuva_duracao_s`. O AL-24 sai `venus_chuva_aviso_s`
 * antes para todas as nações. Durante o evento, a visão e a geração solar caem (mesmo formato de
 * CEN-03/tempestade.ts), e toda unidade e estrutura sofre `venus_chuva_dano_hp_s` de dano
 * contínuo (CMB-01), uniforme pelo planeta inteiro.
 */
import { aplicarDano } from '../combate/dano';
import { entitiesWith } from '../core/entities';
import { nextInt } from '../core/rng';
import type { SystemContext } from '../core/pipeline';
import type { SimState } from '../core/state';
import { param } from '../data';
import { cenarioDe } from './modificadores';

export interface EstadoDaChuva {
  /** Tick em que a próxima (ou a atual) começa. */
  inicio: number;
  /** Tick em que ela termina. */
  fim: number;
  /** O AL-24 desta chuva já saiu. */
  avisada: boolean;
}

export function temChuva(state: SimState): boolean {
  return cenarioDe(state)?.evento === 'chuva_acida';
}

export function chuvaAtiva(state: SimState): boolean {
  const c = state.chuva;
  return c != null && state.tick >= c.inicio && state.tick < c.fim;
}

/** CEN-18: multiplicador da visão de todos os corpos por causa da chuva ácida agora. */
export function multVisaoDaChuva(state: SimState): number {
  return chuvaAtiva(state) ? param('venus_chuva_mult_visao') : 1;
}

/** CEN-18: multiplicador temporário da geração solar (ENE-07) por causa da chuva ácida. */
export function multSolarDaChuva(state: SimState): number {
  return chuvaAtiva(state) ? param('venus_chuva_mult_solar') : 1;
}

function agendar(state: SimState, aPartirDe: number, tickHz: number): EstadoDaChuva {
  const intervalo = nextInt(
    state.rng,
    Math.round(param('venus_chuva_intervalo_min_s') * tickHz),
    Math.round(param('venus_chuva_intervalo_max_s') * tickHz),
  );
  const inicio = aPartirDe + intervalo;
  return {
    inicio,
    fim: inicio + Math.round(param('venus_chuva_duracao_s') * tickHz),
    avisada: false,
  };
}

/** Roda antes da energia e da visão do tick, como a tempestade de poeira (CEN-03). */
export function sistemaChuvaAcida(ctx: SystemContext): void {
  const { state } = ctx;
  if (!temChuva(state)) return;
  const tickHz = Math.round(1 / ctx.dt);
  state.chuva ??= agendar(state, state.tick, tickHz);
  let c = state.chuva;
  if (state.tick >= c.fim) {
    ctx.emit('chuva_acida', { ativa: false });
    c = state.chuva = agendar(state, c.fim, tickHz);
  }
  if (!c.avisada && state.tick >= c.inicio - Math.round(param('venus_chuva_aviso_s') * tickHz)) {
    c.avisada = true;
    for (const nacao of state.nacoes) ctx.emit('alerta', { id: 'AL-24', nacao });
  }
  if (state.tick === c.inicio) ctx.emit('chuva_acida', { ativa: true });
  if (!chuvaAtiva(state)) return;
  // CEN-18: dano contínuo, uniforme pelo planeta inteiro (sem centro nem borda, ao contrário da
  // área de CMB-26) — atinge toda unidade e estrutura, de qualquer nação.
  const danoDoTick = param('venus_chuva_dano_hp_s') * ctx.dt;
  for (const id of entitiesWith(state, 'vida')) {
    aplicarDano(ctx, id, danoDoTick, 'ambiental', null, null, true);
  }
}
