import { describe, expect, it } from 'vitest';
import { getComponent, type Sim } from '../../src/sim';
import { criar, mundoPlano, ordenar, partida } from './mundo-teste';

const pos = (sim: Sim, id: number) => getComponent(sim.state, id, 'position')!;
const ordem = (sim: Sim, id: number) => getComponent(sim.state, id, 'order')!;

describe('TEC-07/CTL-07: ordens de movimento por Comando serializável', () => {
  it('mover leva a unidade ao ponto clicado', () => {
    const sim = partida(mundoPlano(256));
    const [id] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    ordenar(sim, 'mover', { ids: [id], x: 30, z: -20 });
    sim.run(20 * sim.tickHz);
    expect(Math.hypot(pos(sim, id!).x - 30, pos(sim, id!).z + 20)).toBeLessThan(0.5);
  });

  it('parar interrompe o deslocamento', () => {
    const sim = partida(mundoPlano(256));
    const [id] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    ordenar(sim, 'mover', { ids: [id], x: 100, z: 0 });
    sim.run(40);
    ordenar(sim, 'parar', { ids: [id] });
    sim.run(40);
    const x = pos(sim, id!).x;
    sim.run(40);
    expect(pos(sim, id!).x).toBe(x);
    expect(ordem(sim, id!).tipo).toBe('nenhuma');
  });

  it('CMB-13: manter posição para e ignora a rota', () => {
    const sim = partida(mundoPlano(256));
    const [id] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    ordenar(sim, 'manter_posicao', { ids: [id] });
    sim.run(40);
    expect(ordem(sim, id!).tipo).toBe('manter');
    expect(pos(sim, id!).x).toBe(0);
  });

  it('patrulhar vai e volta entre a posição inicial e o destino', () => {
    const sim = partida(mundoPlano(256));
    const [id] = criar(sim, [{ unidade: 'hover_scout', x: -20, z: 0 }]);
    ordenar(sim, 'patrulhar', { ids: [id], x: 20, z: 0 });
    const xs: number[] = [];
    for (let t = 0; t < 40 * sim.tickHz; t++) {
      sim.step();
      xs.push(pos(sim, id!).x);
    }
    expect(Math.max(...xs)).toBeGreaterThan(19.5);
    // voltou perto do início depois de chegar ao destino
    const chegada = xs.findIndex((x) => x > 19.5);
    expect(Math.min(...xs.slice(chegada))).toBeLessThan(-19.5);
    expect(ordem(sim, id!).tipo).toBe('patrulhar');
  });

  it('PRD-08: ponto de encontro fica guardado no produtor', () => {
    const sim = partida(mundoPlano(256));
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    ordenar(sim, 'ponto_de_encontro', { ids: [nave], x: 25, z: 10 });
    sim.step();
    expect(getComponent(sim.state, nave!, 'producer')!.pontoDeEncontro).toEqual([25, 10]);
  });

  it('ordens a corpos de outra nação são ignoradas', () => {
    const sim = partida(mundoPlano(256));
    const [inimigo] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }], 'usa');
    ordenar(sim, 'mover', { ids: [inimigo], x: 50, z: 0 }, 'bra');
    sim.run(40);
    expect(pos(sim, inimigo!).x).toBe(0);
    expect(ordem(sim, inimigo!).tipo).toBe('nenhuma');
  });
});
