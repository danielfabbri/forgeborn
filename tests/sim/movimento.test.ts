import { describe, expect, it } from 'vitest';
import { getComponent, param, restoreSim, type Sim } from '../../src/sim';
import { celulaDe, ehPassavel } from '../../src/sim/map/grids';
import { comandosDoJogo, sistemasDoJogo } from '../../src/sim/units';
import { statsMovel } from '../../src/sim/units/stats';
import { criar, mundoPlano, ordenar, partida } from './mundo-teste';

const pos = (sim: Sim, id: number) => getComponent(sim.state, id, 'position')!;
const loc = (sim: Sim, id: number) => getComponent(sim.state, id, 'locomotion')!;

describe('MOV-03: aceleração e giro', () => {
  it('chega à velocidade máxima em aceleracao_solo_s', () => {
    const sim = partida(mundoPlano(256));
    const [id] = criar(sim, [{ unidade: 'hover_ex1', x: -100, z: 0 }]);
    ordenar(sim, 'mover', { ids: [id], x: 100, z: 0 });
    const vel = statsMovel('hover_ex1').vel_m_s;
    const ticks = Math.round(param('aceleracao_solo_s') * sim.tickHz);
    sim.run(ticks - 1);
    expect(loc(sim, id!).speed).toBeLessThan(vel);
    sim.run(1);
    expect(loc(sim, id!).speed).toBeCloseTo(vel, 6);
  });

  it('gira no máximo giro_graus_s', () => {
    const sim = partida(mundoPlano(256));
    const [id] = criar(sim, [{ unidade: 'hover_opq', x: 0, z: 0 }]);
    ordenar(sim, 'mover', { ids: [id], x: -50, z: 0.01 });
    sim.run(5);
    const giro = (statsMovel('hover_opq').giro_graus_s * Math.PI) / 180;
    expect(Math.abs(loc(sim, id!).heading)).toBeCloseTo((giro * 5) / sim.tickHz, 6);
  });

  it('para no destino com frenagem, sem passar dele', () => {
    const sim = partida(mundoPlano(256));
    const [id] = criar(sim, [{ unidade: 'hover_explorer', x: -40, z: 0 }]);
    ordenar(sim, 'mover', { ids: [id], x: 20, z: 0 });
    let maiorX = -Infinity;
    for (let t = 0; t < 400; t++) {
      sim.step();
      maiorX = Math.max(maiorX, pos(sim, id!).x);
    }
    expect(pos(sim, id!).x).toBeCloseTo(20, 0);
    expect(maiorX).toBeLessThan(20.5);
    expect(getComponent(sim.state, id!, 'order')!.tipo).toBe('nenhuma');
  });
});

describe('MOV-01/MOV-04: terreno, estruturas e separação', () => {
  it('não atravessa terreno intransponível: contorna o paredão pela brecha', () => {
    // Paredão em x ∈ [-4, 4], com uma brecha em z ∈ [30, 44].
    const mundo = mundoPlano(128, (x, z) => Math.abs(x) <= 4 && !(z >= 30 && z <= 44));
    const sim = partida(mundo);
    const [id] = criar(sim, [{ unidade: 'hover_ex1', x: -30, z: 0 }]);
    ordenar(sim, 'mover', { ids: [id], x: 30, z: 0 });
    const nav = mundo.grades.navegacao;
    for (let t = 0; t < 900; t++) {
      sim.step();
      const p = pos(sim, id!);
      expect(ehPassavel(nav, ...celulaDe(nav, p.x, p.z)!)).toBe(true);
    }
    expect(Math.hypot(pos(sim, id!).x - 30, pos(sim, id!).z)).toBeLessThan(1);
  });

  it('não atravessa estruturas: contorna a Nave no caminho', () => {
    const sim = partida(mundoPlano(256));
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [id] = criar(sim, [{ unidade: 'hover_ex1', x: -60, z: 0 }]);
    ordenar(sim, 'mover', { ids: [id], x: 60, z: 0 });
    const minimo =
      getComponent(sim.state, nave!, 'obstacle')!.raio + statsMovel('hover_ex1').raio_m;
    for (let t = 0; t < 900; t++) {
      sim.step();
      expect(Math.hypot(pos(sim, id!).x, pos(sim, id!).z)).toBeGreaterThanOrEqual(minimo - 0.01);
    }
    expect(Math.hypot(pos(sim, id!).x - 60, pos(sim, id!).z)).toBeLessThan(1);
  });

  it('50 unidades paradas no mesmo ponto se separam e ficam quietas (sem tremer)', () => {
    const sim = partida(mundoPlano(256));
    const ids = criar(
      sim,
      Array.from({ length: 50 }, () => ({ unidade: 'hover_explorer' as const, x: 0, z: 0 })),
    );
    sim.run(10 * sim.tickHz);
    const r = statsMovel('hover_explorer').raio_m;
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const [p, q] = [pos(sim, ids[a]!), pos(sim, ids[b]!)];
        expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(2 * r - 0.02);
      }
    }
    const antes = ids.map((id) => ({ ...pos(sim, id) }));
    sim.run(2 * sim.tickHz);
    const deslocamentos = ids.map((id, k) =>
      Math.hypot(pos(sim, id).x - antes[k]!.x, pos(sim, id).z - antes[k]!.z),
    );
    expect(Math.max(...deslocamentos)).toBeLessThan(0.01);
  });

  it('CMB-13: quem mantém posição não é empurrado', () => {
    const sim = partida(mundoPlano(256));
    const [firme] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    ordenar(sim, 'manter_posicao', { ids: [firme] });
    sim.step();
    const [outro] = criar(sim, [{ unidade: 'hover_ex1', x: 0.5, z: 0 }]);
    sim.run(40);
    expect(pos(sim, firme!).x).toBe(0);
    expect(pos(sim, outro!).x).toBeGreaterThanOrEqual(2 * statsMovel('hover_ex1').raio_m - 0.02);
  });

  it('TEC-08: snapshot no meio do trajeto restaura o mesmo resultado (caches derivados)', () => {
    const mundo = mundoPlano(256, (x, z) => Math.abs(x) <= 4 && z < 20);
    const a = partida(mundo);
    const ids = criar(
      a,
      Array.from({ length: 8 }, (_, k) => ({
        unidade: 'hover_ex1' as const,
        x: -40 + (k % 4) * 3,
        z: -10 + Math.floor(k / 4) * 3,
      })),
    );
    ordenar(a, 'mover', { ids, x: 40, z: -10 });
    a.run(100);
    const b = restoreSim(a.snapshot(), {
      mundo,
      systems: sistemasDoJogo,
      commandHandlers: comandosDoJogo,
    });
    a.run(300);
    b.run(300);
    expect(b.hash()).toBe(a.hash());
  });
});

describe('MOV-02/MOV-07: drones', () => {
  it('voam a altitude_drone_m em linha reta, ignorando o relevo', () => {
    const sim = partida(mundoPlano(256, (x) => Math.abs(x) <= 10));
    const [id] = criar(sim, [{ unidade: 'drone_laser', x: -60, z: 0 }]);
    ordenar(sim, 'mover', { ids: [id], x: 60, z: 0 });
    for (let t = 0; t < 300; t++) {
      sim.step();
      expect(pos(sim, id!).y).toBe(param('altitude_drone_m'));
      expect(Math.abs(pos(sim, id!).z)).toBeLessThan(0.01);
    }
    expect(pos(sim, id!).x).toBeCloseTo(60, 0);
  });

  it('pousam após pouso_automatico_s ociosos e ficam no chão', () => {
    const sim = partida(mundoPlano(256));
    const [id] = criar(sim, [{ unidade: 'drone_bomber', x: 0, z: 0 }]);
    const ar = () => getComponent(sim.state, id!, 'air')!;
    const ocioso = Math.round(param('pouso_automatico_s') * sim.tickHz);
    sim.run(ocioso - 2);
    expect(ar().estado).toBe('voando');
    sim.run(3);
    expect(ar().estado).toBe('pousando');
    sim.run(Math.round(param('tempo_pouso_s') * sim.tickHz) + 1);
    expect(ar().estado).toBe('pousado');
    expect(pos(sim, id!).y).toBeCloseTo(0.6, 6);
  });

  it('decolam ao receber ordem e esperam tempo_decolagem_s para andar', () => {
    const sim = partida(mundoPlano(256));
    const [id] = criar(sim, [{ unidade: 'drone_laser', x: 0, z: 0 }]);
    sim.run(Math.round((param('pouso_automatico_s') + param('tempo_pouso_s')) * sim.tickHz) + 5);
    expect(getComponent(sim.state, id!, 'air')!.estado).toBe('pousado');
    ordenar(sim, 'mover', { ids: [id], x: 50, z: 0 });
    sim.run(2);
    expect(getComponent(sim.state, id!, 'air')!.estado).toBe('decolando');
    expect(pos(sim, id!).x).toBe(0);
    sim.run(Math.round(param('tempo_decolagem_s') * sim.tickHz) + 2);
    expect(getComponent(sim.state, id!, 'air')!.estado).toBe('voando');
    sim.run(20);
    expect(pos(sim, id!).x).toBeGreaterThan(1);
  });

  it('decolam quando há inimigo ao alcance da visão', () => {
    const sim = partida(mundoPlano(256));
    const [id] = criar(sim, [{ unidade: 'drone_laser', x: 0, z: 0 }]);
    sim.run(Math.round((param('pouso_automatico_s') + param('tempo_pouso_s')) * sim.tickHz) + 5);
    criar(sim, [{ unidade: 'hover_ex1', x: statsMovel('drone_laser').visao_m - 1, z: 0 }], 'usa');
    sim.run(2);
    expect(getComponent(sim.state, id!, 'air')!.estado).toBe('decolando');
  });

  it('MOV-04: drones em voo não colidem com hovers', () => {
    const sim = partida(mundoPlano(256));
    const [drone, hover] = criar(sim, [
      { unidade: 'drone_laser', x: 0, z: 0 },
      { unidade: 'hover_ex1', x: 0, z: 0 },
    ]);
    sim.run(10);
    expect(pos(sim, drone!).x).toBe(0);
    expect(pos(sim, hover!).x).toBe(0);
  });
});
