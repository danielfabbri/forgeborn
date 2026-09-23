/** Ponto do terreno sob o cursor: raio da câmera marchado contra o relevo do planeta. */
import { type PerspectiveCamera, Raycaster, Vector2 } from 'three';
import { normalizar, type Vec3 } from '../sim/map/esfera';
import { alturaEm, type Heightmap } from '../sim/map/heightmap';

const PASSO_M = 0.5;
/** Folga radial da esfera que envolve todo o relevo. */
const TETO_RELEVO_M = 60;

const raycaster = new Raycaster();
const ndc = new Vector2();

/** Ponto 3D do terreno na posição de tela (px), ou null se o raio não toca o planeta. */
export function pontoNoTerreno(
  camera: PerspectiveCamera,
  elemento: HTMLElement,
  px: number,
  py: number,
  mapa: Heightmap,
): Vec3 | null {
  const r = elemento.getBoundingClientRect();
  ndc.set(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const { origin: o, direction: d } = raycaster.ray;
  // Entrada e saída da esfera que envolve o relevo: |o + t·d| = raio + teto.
  const teto = mapa.raio_m + TETO_RELEVO_M;
  const b = o.x * d.x + o.y * d.y + o.z * d.z;
  const c = o.x * o.x + o.y * o.y + o.z * o.z - teto * teto;
  const delta = b * b - c;
  if (delta < 0) return null;
  const entrada = Math.max(0, -b - Math.sqrt(delta));
  const saida = -b + Math.sqrt(delta);
  const ponto = (t: number): Vec3 => [o.x + d.x * t, o.y + d.y * t, o.z + d.z * t];
  const abaixo = (t: number) => {
    const p = ponto(t);
    const raio = Math.hypot(p[0], p[1], p[2]);
    return raio - mapa.raio_m <= alturaEm(mapa, normalizar(p));
  };
  let anterior = entrada;
  for (let t = entrada; t <= saida; t += PASSO_M) {
    if (!abaixo(t)) {
      anterior = t;
      continue;
    }
    // bissecção entre o último ponto acima e o primeiro abaixo
    let a = anterior;
    let z = t;
    for (let k = 0; k < 14; k++) {
      const m = (a + z) / 2;
      if (abaixo(m)) z = m;
      else a = m;
    }
    return ponto(z);
  }
  return null;
}
