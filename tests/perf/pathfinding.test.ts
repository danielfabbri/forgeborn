/** Orçamento de pathfinding (TEC-14). Roda isolado: npm run test:perf. */
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { aEstrela, campoDeFluxo, type Navegavel } from '../../src/sim/map/pathfinding';
import { mundoLua } from '../sim/mundo-teste';

describe('TEC-14: orçamento de pathfinding', () => {
  it('TEC-14: cada ordem custa menos de 5 ms no mapa M (A* e campo de fluxo)', () => {
    const { mapa, grades } = mundoLua();
    const g: Navegavel = { nav: grades.navegacao, bloqueado: null };
    const [a, , c] = mapa.zonasDePouso;
    // aquece o JIT, como numa partida já em andamento
    for (let k = 0; k < 3; k++) {
      aEstrela(g, [a!.x, a!.z], [c!.x, c!.z]);
      campoDeFluxo(g, [c!.x, c!.z]);
    }
    // mediana de 15 medições
    const medir = (f: () => void) => {
      const tempos = Array.from({ length: 15 }, () => {
        const inicio = performance.now();
        f();
        return performance.now() - inicio;
      }).sort((x, y) => x - y);
      return tempos[7]!;
    };
    const tempoAEstrela = medir(() => aEstrela(g, [a!.x, a!.z], [c!.x, c!.z]));
    const tempoFluxo = medir(() => campoDeFluxo(g, [c!.x, c!.z]));
    expect(tempoAEstrela).toBeLessThan(5);
    expect(tempoFluxo).toBeLessThan(5);
  });
});
