import { describe, expect, it } from 'vitest';
import { getComponent, type Sim } from '../../src/sim';
import { arco, normalizar } from '../../src/sim/map/esfera';
import { alvo, criar, mundoLiso, ordenar, partida, ponto, pos } from './mundo-teste';

const ordem = (sim: Sim, id: number) => getComponent(sim.state, id, 'order')!;

describe('TEC-07/CTL-07: ordens de movimento por Comando serializável', () => {
  it('mover leva a unidade ao ponto clicado', () => {
    const sim = partida(mundoLiso());
    const [id] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    ordenar(sim, 'mover', { ids: [id], ...alvo(30, -20) });
    sim.run(20 * sim.tickHz);
    expect(Math.hypot(pos(sim, id!).x - 30, pos(sim, id!).z + 20)).toBeLessThan(0.5);
  });

  it('o alvo é uma direção: qualquer comprimento de (x, y, z) serve', () => {
    const sim = partida(mundoLiso());
    const [id] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    const d = ponto(30, -20);
    ordenar(sim, 'mover', { ids: [id], x: d[0] * 500, y: d[1] * 500, z: d[2] * 500 });
    sim.run(20 * sim.tickHz);
    expect(Math.hypot(pos(sim, id!).x - 30, pos(sim, id!).z + 20)).toBeLessThan(0.5);
  });

  it('parar interrompe o deslocamento', () => {
    const sim = partida(mundoLiso());
    const [id] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    ordenar(sim, 'mover', { ids: [id], ...alvo(100, 0) });
    sim.run(40);
    ordenar(sim, 'parar', { ids: [id] });
    sim.run(40);
    const antes = pos(sim, id!);
    sim.run(40);
    expect(pos(sim, id!).x).toBe(antes.x);
    expect(ordem(sim, id!).tipo).toBe('nenhuma');
  });

  it('CMB-13: manter posição para e ignora a rota', () => {
    const sim = partida(mundoLiso());
    const [id] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    ordenar(sim, 'manter_posicao', { ids: [id] });
    sim.run(40);
    expect(ordem(sim, id!).tipo).toBe('manter');
    expect(Math.abs(pos(sim, id!).x)).toBeLessThan(1e-9);
  });

  it('patrulhar vai e volta entre a posição inicial e o destino', () => {
    const sim = partida(mundoLiso());
    const [id] = criar(sim, [{ unidade: 'hover_scout', x: -20, z: 0 }]);
    ordenar(sim, 'patrulhar', { ids: [id], ...alvo(20, 0) });
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
    const sim = partida(mundoLiso());
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    ordenar(sim, 'ponto_de_encontro', { ids: [nave], ...alvo(25, 10) });
    sim.step();
    const guardado = getComponent(sim.state, nave!, 'producer')!.pontoDeEncontro!;
    expect(arco(normalizar(guardado), ponto(25, 10))).toBeLessThan(1e-12);
  });

  it('ordens a corpos de outra nação são ignoradas; alvos inválidos também', () => {
    const sim = partida(mundoLiso());
    const [inimigo] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }], 'usa');
    const [meu] = criar(sim, [{ unidade: 'hover_ex1', x: 10, z: 0 }]);
    ordenar(sim, 'mover', { ids: [inimigo], ...alvo(50, 0) }, 'bra');
    ordenar(sim, 'mover', { ids: [meu], x: 0, y: 0, z: 0 });
    sim.run(40);
    expect(Math.abs(pos(sim, inimigo!).x)).toBeLessThan(1e-9);
    expect(ordem(sim, inimigo!).tipo).toBe('nenhuma');
    expect(ordem(sim, meu!).tipo).toBe('nenhuma');
  });
});
