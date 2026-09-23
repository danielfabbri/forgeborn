/** Travessia do mapa M por 100 unidades (aceite de T-023). */
import { describe, expect, it } from 'vitest';
import { getComponent } from '../../src/sim';
import { criar, mundoLua, ordenar, partida } from './mundo-teste';

describe('T-023: travessia do mapa M', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])(
    'MOV-05: 100 unidades cruzam o mapa M sem ficar presas (seed %i)',
    (seed) => {
      const mundo = mundoLua(seed);
      const [a, , c] = mundo.mapa.zonasDePouso;
      const sim = partida(mundo);
      const ids = criar(
        sim,
        Array.from({ length: 100 }, (_, k) => ({
          unidade: 'hover_ex1' as const,
          x: a!.x + ((k % 10) - 4.5) * 3,
          z: a!.z + (Math.floor(k / 10) - 4.5) * 3,
        })),
      );
      ordenar(sim, 'mover', { ids, x: c!.x, z: c!.z });
      sim.step();
      const limite = 240 * sim.tickHz;
      let t = 0;
      const emMovimento = () =>
        ids.filter((id) => getComponent(sim.state, id, 'order')!.tipo !== 'nenhuma');
      for (; t < limite && emMovimento().length > 0; t += sim.tickHz) sim.run(sim.tickHz);
      expect(emMovimento()).toEqual([]);
      for (const id of ids) {
        const p = getComponent(sim.state, id, 'position')!;
        expect(Math.hypot(p.x - c!.x, p.z - c!.z)).toBeLessThan(40);
      }
    },
  );
});
