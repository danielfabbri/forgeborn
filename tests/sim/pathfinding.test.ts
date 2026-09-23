import { describe, expect, it } from 'vitest';
import { getComponent, param, type Sim } from '../../src/sim';
import { arco, interpolarArco, normalizar, type Vec3 } from '../../src/sim/map/esfera';
import { celulaDe, ehPassavel } from '../../src/sim/map/grids';
import { aEstrela, type Navegavel } from '../../src/sim/map/pathfinding';
import { statsMovel } from '../../src/sim/units/stats';
import { alvo, criar, local, mundoLiso, ordenar, partida, ponto, RAIO } from './mundo-teste';

const direcao = (sim: Sim, id: number): Vec3 => {
  const p = getComponent(sim.state, id, 'position')!;
  return normalizar([p.x, p.y, p.z]);
};

describe('MOV-05: A* e campo de fluxo', () => {
  it('A* contorna o paredão pelo grande círculo sem atravessar células bloqueadas', () => {
    const mundo = mundoLiso((x, z) => Math.abs(x) <= 4 && z < 30 && z > -90);
    const g: Navegavel = { nav: mundo.grades.navegacao, bloqueado: null };
    const origem = ponto(-30, 0);
    const destino = ponto(30, 0);
    const rota = aEstrela(g, origem, destino)!;
    expect(rota.at(-1)).toEqual(destino);
    let de = origem;
    for (const p of rota) {
      // cada trecho da rota suavizada é caminhável
      for (let t = 0; t <= 1; t += 0.02) {
        expect(ehPassavel(g.nav, celulaDe(g.nav, interpolarArco(de, p, t)))).toBe(true);
      }
      de = p;
    }
  });

  it('sem caminho, A* devolve null', () => {
    // Anel intransponível em volta da BASE.
    const mundo = mundoLiso((x, z) => Math.hypot(x, z) > 20 && Math.hypot(x, z) < 28);
    const g: Navegavel = { nav: mundo.grades.navegacao, bloqueado: null };
    expect(aEstrela(g, ponto(0, 0), ponto(40, 0))).toBeNull();
  });

  it('grupos com flow_field_min_unidades ou mais usam campo de fluxo; menores, A*', () => {
    const sim = partida(mundoLiso());
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
    ordenar(sim, 'mover', { ids: grande, ...alvo(60, 0) });
    ordenar(sim, 'mover', { ids: pequeno, ...alvo(60, 30) });
    sim.step();
    for (const id of grande) {
      expect(getComponent(sim.state, id, 'locomotion')!.fluxo).not.toBeNull();
    }
    for (const id of pequeno) expect(getComponent(sim.state, id, 'locomotion')!.fluxo).toBeNull();
  });
});

describe('MOV-06: formação e velocidade do grupo', () => {
  it('o grupo anda na velocidade do mais lento e chega na mesma disposição', () => {
    const sim = partida(mundoLiso());
    const tipos = ['hover_ex1', 'hover_opq', 'printer', 'hover_scout'] as const;
    const ids = criar(sim, [
      { unidade: tipos[0], x: -100, z: -6 },
      { unidade: tipos[1], x: -100, z: 0 },
      { unidade: tipos[2], x: -100, z: 6 },
      { unidade: tipos[3], x: -106, z: 0 },
    ]);
    const distanciasEntre = () =>
      ids.flatMap((a, i) =>
        ids.slice(i + 1).map((b) => RAIO * arco(direcao(sim, a), direcao(sim, b))),
      );
    const antes = distanciasEntre();
    ordenar(sim, 'mover', { ids, ...alvo(100, 0) });
    const lento = Math.min(...tipos.map((t) => statsMovel(t).vel_m_s));
    let maior = 0;
    for (let t = 0; t < 70 * sim.tickHz; t++) {
      sim.step();
      for (const id of ids) {
        maior = Math.max(maior, getComponent(sim.state, id, 'locomotion')!.speed);
      }
    }
    expect(maior).toBeLessThanOrEqual(lento + 1e-9);
    // o centro do grupo vai ao ponto clicado e as distâncias entre as unidades se mantêm
    const centro = normalizar(
      ids.reduce<Vec3>(
        (s, id) => {
          const d = direcao(sim, id);
          return [s[0] + d[0], s[1] + d[1], s[2] + d[2]];
        },
        [0, 0, 0],
      ),
    );
    const { x, z } = local(centro);
    expect(Math.hypot(x - 100, z)).toBeLessThan(0.5);
    distanciasEntre().forEach((d, k) => expect(d).toBeCloseTo(antes[k]!, 0));
  });

  it('"mover livre" desliga a velocidade de grupo', () => {
    const sim = partida(mundoLiso());
    const ids = criar(sim, [
      { unidade: 'hover_scout', x: 0, z: -100 },
      { unidade: 'printer', x: 6, z: -100 },
    ]);
    ordenar(sim, 'mover', { ids, ...alvo(0, 100), livre: true });
    sim.run(3 * sim.tickHz);
    expect(getComponent(sim.state, ids[0]!, 'locomotion')!.speed).toBeCloseTo(
      statsMovel('hover_scout').vel_m_s,
      6,
    );
  });
});
