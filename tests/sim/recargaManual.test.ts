import { describe, expect, it } from 'vitest';
import { getComponent, type Sim } from '../../src/sim';
import { criar, mundoLiso, ordenar, partida } from './mundo-teste';

const rodar = (sim: Sim, s: number) => {
  for (let t = 0; t < Math.round(s * sim.tickHz); t++) sim.step();
};

describe('D-50 — CTL-07: recarregar pelo clique direito numa estrutura', () => {
  it('D-50: a unidade com meia bateria vai à estrutura escolhida e sai com 100%', () => {
    const sim = partida(mundoLiso());
    // A Nave está mais perto; o jogador escolhe a Usina Solar.
    const [nave, usina] = criar(sim, [
      { estrutura: 'ship', x: 0, z: 20 },
      { estrutura: 'solar_plant', x: 40, z: -10 },
    ]);
    ordenar(sim, 'debug_encher_banco', {});
    const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    const bateria = getComponent(sim.state, ex1!, 'bateria')!;
    bateria.en = bateria.max * 0.6;
    ordenar(sim, 'recarregar', { ids: [ex1], estrutura: usina });
    sim.step();
    expect(getComponent(sim.state, ex1!, 'recarga')!.estrutura).toBe(usina);
    let acoplou = false;
    for (let s = 0; s < 120 && bateria.en < bateria.max - 1e-6; s++) {
      rodar(sim, 1);
      acoplou ||= getComponent(sim.state, ex1!, 'recarga')!.estado === 'acoplada';
    }
    expect(acoplou).toBe(true);
    expect(bateria.en).toBeCloseTo(bateria.max, 3);
    expect(getComponent(sim.state, ex1!, 'recarga')!.estrutura).not.toBe(nave);
  });

  it('D-50: estrutura de outra nação ou sem portas é ignorada (vale a de menor tempo)', () => {
    const sim = partida(mundoLiso());
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 20 }]);
    const [torre] = criar(sim, [{ estrutura: 'laser_tower', x: 30, z: 0 }]);
    const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    ordenar(sim, 'recarregar', { ids: [ex1], estrutura: torre });
    sim.step();
    expect(getComponent(sim.state, ex1!, 'recarga')!.estrutura).toBe(nave);
  });
});
