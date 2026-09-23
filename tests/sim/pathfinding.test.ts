import { describe, expect, it } from 'vitest';
import { getComponent, param, type Sim } from '../../src/sim';
import { celulaDe, ehPassavel } from '../../src/sim/map/grids';
import { aEstrela, type Navegavel } from '../../src/sim/map/pathfinding';
import { statsMovel } from '../../src/sim/units/stats';
import { criar, mundoPlano, ordenar, partida } from './mundo-teste';

const pos = (sim: Sim, id: number) => getComponent(sim.state, id, 'position')!;

describe('MOV-05: A* e campo de fluxo', () => {
  it('A* contorna o paredão sem atravessar células bloqueadas nem cortar quinas', () => {
    const mundo = mundoPlano(128, (x, z) => Math.abs(x) <= 4 && z < 30);
    const g: Navegavel = { nav: mundo.grades.navegacao, bloqueado: null };
    const rota = aEstrela(g, [-30, 0], [30, 0])!;
    expect(rota.at(-1)).toEqual([30, 0]);
    let de: [number, number] = [-30, 0];
    for (const ponto of rota) {
      // cada trecho da rota suavizada é caminhável
      for (let t = 0; t <= 1; t += 0.02) {
        const x = de[0] + (ponto[0] - de[0]) * t;
        const z = de[1] + (ponto[1] - de[1]) * t;
        expect(ehPassavel(g.nav, ...celulaDe(g.nav, x, z)!)).toBe(true);
      }
      de = ponto;
    }
  });

  it('sem caminho, A* devolve null', () => {
    const mundo = mundoPlano(128, (x) => Math.abs(x) <= 4);
    const g: Navegavel = { nav: mundo.grades.navegacao, bloqueado: null };
    expect(aEstrela(g, [-30, 0], [30, 0])).toBeNull();
  });

  it(`grupos com flow_field_min_unidades ou mais usam campo de fluxo; menores, A*`, () => {
    const sim = partida(mundoPlano(256));
    const n = param('flow_field_min_unidades');
    const grande = criar(
      sim,
      Array.from({ length: n }, (_, k) => ({
        unidade: 'hover_ex1' as const,
        x: -60 + k * 3,
        z: 0,
      })),
    );
    const pequeno = criar(
      sim,
      Array.from({ length: n - 1 }, (_, k) => ({
        unidade: 'hover_ex1' as const,
        x: -60 + k * 3,
        z: 30,
      })),
    );
    ordenar(sim, 'mover', { ids: grande, x: 60, z: 0 });
    ordenar(sim, 'mover', { ids: pequeno, x: 60, z: 30 });
    sim.step();
    for (const id of grande)
      expect(getComponent(sim.state, id, 'locomotion')!.fluxo).not.toBeNull();
    for (const id of pequeno) expect(getComponent(sim.state, id, 'locomotion')!.fluxo).toBeNull();
  });
});

describe('MOV-06: formação e velocidade do grupo', () => {
  it('o grupo anda na velocidade do mais lento e chega na mesma disposição', () => {
    const sim = partida(mundoPlano(320));
    const ids = criar(sim, [
      { unidade: 'hover_ex1', x: -100, z: -6 },
      { unidade: 'hover_opq', x: -100, z: 0 },
      { unidade: 'printer', x: -100, z: 6 },
      { unidade: 'hover_scout', x: -106, z: 0 },
    ]);
    const antes = ids.map((id) => ({ ...pos(sim, id) }));
    ordenar(sim, 'mover', { ids, x: 100, z: 0 });
    const lento = Math.min(
      ...(['hover_ex1', 'hover_opq', 'printer', 'hover_scout'] as const).map(
        (t) => statsMovel(t).vel_m_s,
      ),
    );
    let maior = 0;
    for (let t = 0; t < 60 * sim.tickHz; t++) {
      sim.step();
      for (const id of ids)
        maior = Math.max(maior, getComponent(sim.state, id, 'locomotion')!.speed);
    }
    expect(maior).toBeLessThanOrEqual(lento + 1e-9);
    // o centro do grupo vai ao ponto clicado e cada um mantém o desvio em relação a ele
    const centro = (ps: { x: number; z: number }[]) => [
      ps.reduce((s, p) => s + p.x, 0) / ps.length,
      ps.reduce((s, p) => s + p.z, 0) / ps.length,
    ];
    const depois = ids.map((id) => pos(sim, id));
    const [c0x, c0z] = centro(antes);
    const [c1x, c1z] = centro(depois);
    expect(Math.hypot(c1x! - 100, c1z!)).toBeLessThan(0.5);
    ids.forEach((_, k) => {
      expect(depois[k]!.x - c1x!).toBeCloseTo(antes[k]!.x - c0x!, 0);
      expect(depois[k]!.z - c1z!).toBeCloseTo(antes[k]!.z - c0z!, 0);
    });
  });

  it('"mover livre" desliga a velocidade de grupo', () => {
    const sim = partida(mundoPlano(320));
    const ids = criar(sim, [
      { unidade: 'hover_scout', x: -100, z: 0 },
      { unidade: 'printer', x: -100, z: 6 },
    ]);
    ordenar(sim, 'mover', { ids, x: 100, z: 0, livre: true });
    sim.run(3 * sim.tickHz);
    expect(getComponent(sim.state, ids[0]!, 'locomotion')!.speed).toBeCloseTo(
      statsMovel('hover_scout').vel_m_s,
      6,
    );
  });
});
