import { describe, expect, it } from 'vitest';
import { createSim, param } from '../../src/sim';
import { comandosDeMacete, MACETE_COMMAND } from '../../src/sim/debug/macete';

describe('T-136 — TEC-27, D-76: macetes', () => {
  it('TEC-27: o Comando de macete soma macete_quantidade ao estoque de quem envia', () => {
    const sim = createSim(1, ['bra', 'usa'], { commandHandlers: comandosDeMacete });
    const antes = { ...sim.state.estoques.bra };
    const deles = { ...sim.state.estoques.usa };
    const tick = sim.state.tick;
    sim.enqueue({ tick, nacao: 'bra', tipo: MACETE_COMMAND, dados: { recurso: 'cu' } });
    sim.enqueue({ tick, nacao: 'bra', tipo: MACETE_COMMAND, dados: { recurso: 'nada' } });
    sim.step();
    expect(sim.state.estoques.bra.cu).toBe(antes.cu + param('macete_quantidade'));
    expect(sim.state.estoques.bra.fe).toBe(antes.fe);
    expect(sim.state.estoques.usa).toEqual(deles);
  });

  it('TEC-27/D-83: "maistudo" soma macete_quantidade a todos os recursos', () => {
    const sim = createSim(1, ['bra', 'usa'], { commandHandlers: comandosDeMacete });
    const antes = { ...sim.state.estoques.bra };
    sim.enqueue({
      tick: sim.state.tick,
      nacao: 'bra',
      tipo: MACETE_COMMAND,
      dados: { recurso: 'todos' },
    });
    sim.step();
    for (const [r, v] of Object.entries(antes)) {
      expect(sim.state.estoques.bra[r as keyof typeof antes]).toBe(v + param('macete_quantidade'));
    }
  });
});
