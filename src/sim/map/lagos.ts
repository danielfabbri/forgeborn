/**
 * CEN-04 (D-78): lagos de metano de Titã. Cada lago é um círculo na superfície (centro e raio)
 * com o nível da água (altura radial, m). Hovers atravessam; nada é posicionado sobre eles.
 */
import { arco, type Vec3 } from './esfera';

export interface Lago {
  d: Vec3;
  raio: number;
  /** Altura (m, sobre `raio_m`) da superfície do lago. */
  nivel: number;
}

/** O ponto p (direção) está num lago, com `folga` (m) além da margem? */
export function emLago(
  mapa: { raio_m: number; lagos?: readonly Lago[] },
  p: Vec3,
  folga = 0,
): boolean {
  if (!mapa.lagos || mapa.lagos.length === 0) return false;
  return mapa.lagos.some((l) => mapa.raio_m * arco(l.d, p) < l.raio + folga);
}
