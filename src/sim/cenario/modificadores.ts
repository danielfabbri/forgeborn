/** CEN-02: modificadores fixos do cenário que multiplicam os valores-base das tabelas. */
import type { SimState } from '../core/state';
import { type CenariosId, type CenariosRow, dados } from '../data';

/** As linhas de `dados:cenarios` por id (busca feita a cada movimento). */
const POR_ID = new Map<CenariosId, CenariosRow>(dados.cenarios.map((c) => [c.id, c]));

export function cenarioDe(state: SimState): CenariosRow | undefined {
  return POR_ID.get(state.cenario);
}

/** `mult_en_drone`: multiplica `mov_en_s` e `pairar_en_s` dos drones (aéreos). */
export function multEnDrone(state: SimState, aerea: boolean): number {
  if (!aerea) return 1;
  return cenarioDe(state)?.mult_en_drone ?? 1;
}
