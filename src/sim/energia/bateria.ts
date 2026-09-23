/**
 * Baterias das unidades móveis (ENE-08 a ENE-11): estados, gasto por tarefa e o papel de cada
 * unidade para a auto-recarga (ENE-15).
 */
import { getComponent } from '../core/entities';
import type { SystemContext } from '../core/pipeline';
import type { EntityId } from '../core/types';
import { dados, type MoveisId, param } from '../data';

export type Papel = 'trabalhador' | 'impressora' | 'militar' | 'drone' | 'bateria_movel';

const PAPEIS: Record<MoveisId, Papel> = {
  hover_explorer: 'trabalhador',
  hover_scout: 'trabalhador',
  hover_minelayer: 'trabalhador',
  mobile_silo: 'trabalhador',
  printer: 'impressora',
  hover_ex1: 'militar',
  hover_opq: 'militar',
  drone_bomber: 'drone',
  drone_laser: 'drone',
  mobile_battery: 'bateria_movel',
};

export function papelDe(tipo: MoveisId): Papel {
  return PAPEIS[tipo];
}

/** ENE-15: limiar (%) de auto-recarga do papel. */
export function limiarDeRecarga(papel: Papel): number {
  switch (papel) {
    case 'trabalhador':
      return param('auto_recarga_trabalhador_pct');
    case 'impressora':
      return param('auto_recarga_impressora_pct');
    case 'militar':
      return param('auto_recarga_militar_pct');
    case 'drone':
      return param('auto_recarga_drone_pct');
    case 'bateria_movel':
      return param('auto_recarga_bateria_movel_pct');
  }
}

/** ENE-08: bateria de uma unidade recém-criada (cheia; a Bateria Móvel sai com parte). */
export function bateriaInicial(tipo: MoveisId): { en: number; max: number } {
  const max = dados.moveis.find((m) => m.id === tipo)!.bateria_en;
  const fracao = tipo === 'mobile_battery' ? param('bateria_movel_carga_inicial_pct') / 100 : 1;
  return { en: max * fracao, max };
}

export function porcentagem(b: { en: number; max: number }): number {
  return b.max > 0 ? (100 * b.en) / b.max : 100;
}

export type EstadoDeBateria = 'normal' | 'baixa' | 'reserva';

/** ENE-11. */
export function estadoDaBateria(b: { en: number; max: number }): EstadoDeBateria {
  if (b.en <= 1e-9) return 'reserva';
  return porcentagem(b) <= param('limiar_bateria_baixa_pct') ? 'baixa' : 'normal';
}

/** A unidade está em Modo Reserva (0 EN)? Sem bateria, nunca. */
export function emReserva(ctx: SystemContext, id: EntityId): boolean {
  const b = getComponent(ctx.state, id, 'bateria');
  return b !== undefined && b.en <= 1e-9;
}

/** Gasta até `en` da bateria; devolve a fração paga (0..1). Sem bateria, paga tudo. */
export function gastar(ctx: SystemContext, id: EntityId, en: number): number {
  const b = getComponent(ctx.state, id, 'bateria');
  if (!b || en <= 0) return 1;
  const pago = Math.min(b.en, en);
  b.en -= pago;
  if (b.en < 1e-12) b.en = 0;
  return pago / en;
}
