/** Travessia do planeta M por 100 unidades (aceite de T-023). */
import { describe, expect, it } from 'vitest';
import { getComponent } from '../../src/sim';
import {
  arco,
  avancar,
  normalizar,
  norteEm,
  produtoVetorial,
  type Vec3,
} from '../../src/sim/map/esfera';
import { criar, mundoDeTeste, ordenar, partida } from './mundo-teste';
import type { MapaLunar } from '../../src/sim/map/lunar';

describe('T-023: travessia do planeta M', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])(
    'MOV-05: 100 unidades vão de uma zona de pouso a outra sem ficar presas (seed %i)',
    (seed) => {
      const mundo = mundoDeTeste(seed);
      const R = mundo.mapa.raio_m;
      const [a, , c] = (mundo.mapa as MapaLunar).zonasDePouso;
      // Grade 10 × 10 com 3 m de passo no platô da zona a, no plano tangente.
      const e1 = norteEm(a!.d);
      const e2 = produtoVetorial(a!.d, e1);
      const noPlato = (x: number, z: number): Vec3 => {
        const rumo = normalizar([
          e1[0] * x + e2[0] * z,
          e1[1] * x + e2[1] * z,
          e1[2] * x + e2[2] * z,
        ]);
        return avancar(a!.d, rumo, Math.hypot(x, z) / R).p;
      };
      const sim = partida(mundo);
      const ids = criar(
        sim,
        Array.from({ length: 100 }, (_, k) => ({
          unidade: 'hover_ex1' as const,
          d: noPlato(((k % 10) - 4.5) * 3, (Math.floor(k / 10) - 4.5) * 3),
        })),
      );
      const destino = c!.d;
      ordenar(sim, 'mover', { ids, x: destino[0], y: destino[1], z: destino[2] });
      sim.step();
      const emMovimento = () =>
        ids.filter((id) => getComponent(sim.state, id, 'order')!.tipo !== 'nenhuma');
      const limite = 240 * sim.tickHz;
      for (let t = 0; t < limite && emMovimento().length > 0; t += sim.tickHz) sim.run(sim.tickHz);
      expect(emMovimento()).toEqual([]);
      for (const id of ids) {
        const p = getComponent(sim.state, id, 'position')!;
        const d = normalizar([p.x, p.y, p.z]);
        expect(R * arco(d, destino)).toBeLessThan(40);
      }
    },
    60_000,
  );
});
