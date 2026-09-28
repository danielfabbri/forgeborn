import { describe, expect, it } from 'vitest';
import { dados, param, type Sim } from '../../src/sim';
import type { SystemContext } from '../../src/sim/core/pipeline';
import {
  alcancaAlguma,
  distanciaEntreBordas,
  ligadasComEnergia,
  naRedeComEnergia,
  redeDe,
  redePrincipal,
  tipoPrecisaDeEnergia,
} from '../../src/sim/energia/cabos';
import { ehDeposito, pontosDeEntrega } from '../../src/sim/economia/estoque';
import { ATIVAR_IA_COMMAND } from '../../src/sim/ia';
import { plantarCentral } from '../../src/sim/ia/economia';
import { montarQuadro } from '../../src/sim/ia/quadro';
import { arco } from '../../src/sim/map/esfera';
import { leituraDaRedeDe } from '../../src/sim/energia/rede';
import { criar, mundoLiso, ordenar, partida, ponto, revelar } from './mundo-teste';

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

describe('T-172 — ENE-29, IA-13, D-86: Armazém na rede e Central da IA', () => {
  it('ENE-29: Armazém fora da rede não é depósito nem abrigo; plugado na Nave, é', () => {
    const sim = partida(mundoLiso());
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [armazem] = criar(sim, [{ estrutura: 'storage', x: 40, z: 0, semCabo: true }]);
    const entregas = () => pontosDeEntrega(ctx(sim), 'bra').map((p) => p.id);
    expect(tipoPrecisaDeEnergia('storage')).toBe(true);
    expect(ehDeposito(sim.state, armazem!)).toBe(false);
    expect(entregas()).toEqual([nave]);
    plugar(sim, armazem!, nave!);
    expect(naRedeComEnergia(sim.state, armazem!)).toBe(true);
    expect(ehDeposito(sim.state, armazem!)).toBe(true);
    expect(entregas()).toContain(armazem);
  });

  it('ENE-27/ART-13: só as estruturas numa rede com energia contam como ligadas (brilho e luzes)', () => {
    const sim = partida(mundoLiso());
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [solar] = criar(sim, [{ estrutura: 'solar_plant', x: 18, z: 0 }]);
    const [sozinho] = criar(sim, [{ estrutura: 'storage', x: 0, z: 60, semCabo: true }]);
    const ligadas = ligadasComEnergia(sim.state, 'bra');
    expect(ligadas.has(nave!)).toBe(true);
    expect(ligadas.has(solar!)).toBe(true);
    expect(ligadas.has(sozinho!)).toBe(false);
  });

  it('IA-13: fora do alcance, a IA planta uma Central rumo ao alvo, ao alcance da rede', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    criar(sim, [{ unidade: 'printer', x: 12, z: 0 }]);
    ordenar(sim, ATIVAR_IA_COMMAND, { nivel: 'normal' });
    sim.step();
    revelar(sim);
    sim.state.estoques['bra'] = { fe: 9999, si: 9999, cu: 9999, li: 9999, ti: 9999, u: 9999 };
    const c = ctx(sim);
    const q = montarQuadro(c, 'bra')!;
    const antes = sim.state.commandQueue.length;
    plantarCentral(c, q, ponto(0, 200));
    const novos = sim.state.commandQueue.slice(antes);
    const pedido = novos.find((cmd) => cmd.tipo === 'posicionar_estrutura')!;
    expect((pedido.dados as { tipo: string }).tipo).toBe('power_hub');
    const d = pedido.dados as { x: number; y: number; z: number };
    expect(alcancaAlguma(c, 'power_hub', [d.x, d.y, d.z], redePrincipal(sim.state, 'bra'))).toBe(
      true,
    );
    // Rumo ao alvo: mais perto dele do que a Nave.
    const R = mundoLiso().mapa.raio_m;
    expect(R * arco([d.x, d.y, d.z], ponto(0, 200))).toBeLessThan(
      R * arco(ponto(0, 0), ponto(0, 200)),
    );
    // Com o alvo já ao alcance, não planta.
    const depois = sim.state.commandQueue.length;
    plantarCentral(c, montarQuadro(c, 'bra')!, ponto(0, 30));
    expect(sim.state.commandQueue.length).toBe(depois);
  });
});
