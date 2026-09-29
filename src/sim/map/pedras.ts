/**
 * CEN-17 (D-86): pedras neutras. Cada pedra é um círculo na superfície (centro e raio),
 * indestrutível: bloqueia hovers e construção; os drones passam por cima.
 */
import { arco, type Vec3 } from './esfera';

export interface Pedra {
  d: Vec3;
  raio: number;
}

/** O ponto p (direção) está numa pedra, com `folga` (m) além da borda? */
export function emPedra(
  mapa: { raio_m: number; pedras?: readonly Pedra[] },
  p: Vec3,
  folga = 0,
): boolean {
  if (!mapa.pedras || mapa.pedras.length === 0) return false;
  return mapa.pedras.some((s) => mapa.raio_m * arco(s.d, p) < s.raio + folga);
}
