import { describe, expect, it } from 'vitest';
import { dados, param, type Sim } from '../../src/sim';
import type { SystemContext } from '../../src/sim/core/pipeline';
import { distanciaEntreBordas, redeDe } from '../../src/sim/energia/cabos';
import { leituraDaRedeDe } from '../../src/sim/energia/rede';
import { criar, mundoLiso, ordenar, partida } from './mundo-teste';

const ctx = (sim: Sim): SystemContext => ({
  state: sim.state,
  tick: sim.state.tick,
  dt: 1 / sim.tickHz,
  commands: [],
  mundo: mundoLiso(),
  emit: () => {},
});
const geracao = (tipo: string) => dados.estruturas.find((e) => e.id === tipo)!.geracao_en_s;
const plugar = (sim: Sim, de: number, para: number) => {
  ordenar(sim, 'ligar_cabo', { de, para });
  sim.step();
};

describe('T-170 — ENE-25 a ENE-28, UNI-15, D-85: rede por cabos', () => {
  it('ENE-25: estrutura sem cabo não entrega energia; plugada, soma na rede da Nave', () => {
    const sim = partida(mundoLiso());
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [solar] = criar(sim, [{ estrutura: 'solar_plant', x: 18, z: 0, semCabo: true }]);
    sim.step();
    expect(leituraDaRedeDe(sim.state, nave!)!.geracao).toBeCloseTo(geracao('ship'), 9);
    expect(redeDe(sim.state, solar!)).toEqual([solar]);
    plugar(sim, solar!, nave!);
    expect(leituraDaRedeDe(sim.state, nave!)!.geracao).toBeCloseTo(
      geracao('ship') + geracao('solar_plant'),
      9,
    );
  });

  it('ENE-26: o cabo só alcança cabo_alcance_m entre as bordas (a Central, cabo_alcance_central_m)', () => {
    const sim = partida(mundoLiso());
    const [a] = criar(sim, [{ estrutura: 'solar_plant', x: 0, z: 0, semCabo: true }]);
    const [b] = criar(sim, [{ estrutura: 'solar_plant', x: 50, z: 0, semCabo: true }]);
    expect(distanciaEntreBordas(ctx(sim), a!, b!)).toBeGreaterThan(param('cabo_alcance_m'));
    plugar(sim, a!, b!);
    expect(redeDe(sim.state, a!)).toEqual([a]);
    // A Central alcança mais longe e junta as duas.
    const [c] = criar(sim, [{ estrutura: 'power_hub', x: 25, z: 60, semCabo: true }]);
    expect(distanciaEntreBordas(ctx(sim), c!, a!)).toBeGreaterThan(param('cabo_alcance_m'));
    expect(distanciaEntreBordas(ctx(sim), c!, a!)).toBeLessThanOrEqual(
      param('cabo_alcance_central_m'),
    );
    plugar(sim, c!, a!);
    plugar(sim, c!, b!);
    expect(redeDe(sim.state, a!)).toEqual([a, b, c].sort((x, y) => x! - y!));
  });

  it('ENE-25: uma expansão isolada com Usina Solar é uma rede própria, com o próprio banco', () => {
    const sim = partida(mundoLiso());
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [s1] = criar(sim, [{ estrutura: 'solar_plant', x: 100, z: 0, semCabo: true }]);
    const [s2] = criar(sim, [{ estrutura: 'solar_plant', x: 108, z: 0, semCabo: true }]);
    plugar(sim, s1!, s2!);
    sim.run(5 * sim.tickHz);
    const isolada = leituraDaRedeDe(sim.state, s1!)!;
    expect(isolada.membros).toBe(2);
    expect(isolada.geracao).toBeCloseTo(2 * geracao('solar_plant'), 9);
    expect(isolada.banco).toBeGreaterThan(0);
    expect(redeDe(sim.state, nave!)).not.toContain(s1);
  });

  it('ENE-27: destruir a estrutura do meio parte a rede (o banco fica com cada parte)', () => {
    const sim = partida(mundoLiso());
    const [a] = criar(sim, [{ estrutura: 'solar_plant', x: 0, z: 0, semCabo: true }]);
    const [hub] = criar(sim, [{ estrutura: 'power_hub', x: 25, z: 0, semCabo: true }]);
    const [b] = criar(sim, [{ estrutura: 'solar_plant', x: 50, z: 0, semCabo: true }]);
    plugar(sim, a!, hub!);
    plugar(sim, hub!, b!);
    sim.run(3 * sim.tickHz);
    expect(redeDe(sim.state, a!)).toContain(b);
    ordenar(sim, 'debug_destruir', { id: hub });
    sim.run(2);
    expect(redeDe(sim.state, a!)).toEqual([a]);
    expect(redeDe(sim.state, b!)).toEqual([b]);
    expect(sim.state.cabos).toEqual([]);
    expect(leituraDaRedeDe(sim.state, a!)!.banco).toBeGreaterThan(0);
  });

  it('ENE-26: Desplugar tira todos os cabos da estrutura', () => {
    const sim = partida(mundoLiso());
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [solar] = criar(sim, [{ estrutura: 'solar_plant', x: 18, z: 0 }]);
    expect(redeDe(sim.state, nave!)).toContain(solar);
    ordenar(sim, 'desligar_cabos', { ids: [solar] });
    sim.step();
    expect(redeDe(sim.state, nave!)).not.toContain(solar);
  });

  it('ENE-28: a Torre fora da rede não tem energia para disparar', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [torre] = criar(sim, [{ estrutura: 'laser_tower', x: 60, z: 0, semCabo: true }]);
    criar(sim, [{ unidade: 'hover_explorer', x: 68, z: 0 }], 'usa');
    const eventos: string[] = [];
    for (let t = 0; t < 3 * sim.tickHz; t++) {
      for (const e of sim.step()) {
        if (e.tipo === 'disparo' && (e.dados as { atirador: number }).atirador === torre) {
          eventos.push(e.tipo);
        }
      }
    }
    expect(eventos).toEqual([]);
  });
});
