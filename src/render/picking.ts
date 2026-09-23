/** Ponto do terreno sob o cursor: raio da câmera marchado contra o heightmap. */
import { type PerspectiveCamera, Raycaster, Vector2 } from 'three';
import { alturaEm, type Heightmap } from '../sim/map/heightmap';

const PASSO_M = 1;
const ALCANCE_M = 4000;

const raycaster = new Raycaster();
const ndc = new Vector2();

/** (x, z) do terreno na posição de tela (px), ou null se o raio não toca o mapa. */
export function pontoNoTerreno(
  camera: PerspectiveCamera,
  elemento: HTMLElement,
  px: number,
  py: number,
  mapa: Heightmap,
): [number, number] | null {
  const r = elemento.getBoundingClientRect();
  ndc.set(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const { origin: o, direction: d } = raycaster.ray;
  const meio = mapa.lado_m / 2;
  const dentro = (x: number, z: number) => Math.abs(x) <= meio && Math.abs(z) <= meio;
  const acima = (t: number) => {
    const x = o.x + d.x * t;
    const z = o.z + d.z * t;
    return o.y + d.y * t > (dentro(x, z) ? alturaEm(mapa, x, z) : -Infinity);
  };
  let anterior = 0;
  for (let t = PASSO_M; t <= ALCANCE_M; t += PASSO_M) {
    const x = o.x + d.x * t;
    const z = o.z + d.z * t;
    if (!dentro(x, z)) {
      if (d.y >= 0) return null;
      anterior = t;
      continue;
    }
    if (!acima(t)) {
      // bissecção entre o último ponto acima e o primeiro abaixo
      let a = anterior;
      let b = t;
      for (let k = 0; k < 12; k++) {
        const m = (a + b) / 2;
        if (acima(m)) a = m;
        else b = m;
      }
      return [o.x + d.x * b, o.z + d.z * b];
    }
    anterior = t;
  }
  return null;
}
