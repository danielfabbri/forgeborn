/**
 * CEN-04 (D-90): superfície líquida (mares e lagos). Um ponto está no líquido quando o terreno ali
 * fica abaixo do nível do líquido do mapa; mapas sem líquido não têm `mar`.
 */
import { avancar, girar, norteEm, type Vec3 } from './esfera';
import { alturaEm, type Heightmap } from './heightmap';

/** Pontos em volta de p (a `folga` metros) conferidos junto com ele. */
const RUMOS = 8;

/** O ponto p (direção) está no líquido, ou a até `folga` (m) dele? */
export function emLiquido(mapa: Heightmap, p: Vec3, folga = 0): boolean {
  const mar = mapa.mar;
  if (!mar) return false;
  if (alturaEm(mapa, p) < mar.nivel) return true;
  if (folga <= 0) return false;
  const norte = norteEm(p);
  for (let k = 0; k < RUMOS; k++) {
    const q = avancar(p, girar(norte, p, (k / RUMOS) * 2 * Math.PI), folga / mapa.raio_m).p;
    if (alturaEm(mapa, q) < mar.nivel) return true;
  }
  return false;
}
