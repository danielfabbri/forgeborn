import type { GradesDoMapa } from './grids';
import type { Heightmap } from './heightmap';

/** Mapa e grades de uma partida: derivados da seed, recalculáveis, fora do snapshot. */
export interface Mundo {
  mapa: Heightmap;
  grades: GradesDoMapa;
}
