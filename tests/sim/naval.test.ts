import { describe, expect, it } from 'vitest';
import { dados, getComponent, param, type Sim, type SimEvent } from '../../src/sim';
import { estadoEm, VISIVEL } from '../../src/sim/visao/nevoa';
import type { SystemContext } from '../../src/sim/core/pipeline';
import { arco } from '../../src/sim/map/esfera';
import { celulaDe } from '../../src/sim/map/grids';
import { emLiquido } from '../../src/sim/map/lagos';
import type { Mundo } from '../../src/sim/map/mundo';
import { validarPosicionamento } from '../../src/sim/producao';
import { direcaoDe } from '../../src/sim/units/superficie';
import { alvo, criar, mundoComMar, ordenar, partida, ponto, revelar } from './mundo-teste';

const contexto = (sim: Sim, mundo: Mundo): SystemContext => ({
  state: sim.state,
  tick: sim.state.tick,
  dt: 1 / sim.tickHz,
  commands: [],
  mundo,
  emit: () => {},
});
const rodar = (sim: Sim, s: number, eventos?: SimEvent[]) => {
  for (let t = 0; t < Math.round(s * sim.tickHz); t++) {
    const novos = sim.step();
    eventos?.push(...novos);
  }
};
const rico = (sim: Sim) => {
  for (const r of ['fe', 'si', 'cu', 'li', 'ti', 'u'] as const) sim.state.estoques.bra![r] = 9999;
};
const onde = (sim: Sim, id: number) => direcaoDe(getComponent(sim.state, id, 'position')!);

/** Porto pronto na faixa de mar (z 20–60), perto da terra do sul, com a Nave em terra na rede. */
function comPorto(guerra = true) {
  const mundo = mundoComMar();
  const sim = partida(mundo, ['bra', 'usa'], 'tita', guerra);
  rico(sim);
  const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: -20 }]);
  const [porto] = criar(sim, [{ estrutura: 'port', x: 0, z: 28 }]);
  return { mundo, sim, nave: nave!, porto: porto! };
}

describe('T-181 — UNI-16 a UNI-19, MOV-08, PRD-10, D-90: Porto e embarcações', () => {
  it('PRD-10: o Porto só no líquido e perto da terra; as outras estruturas, fora dele', () => {
    const mundo = mundoComMar();
    const sim = partida(mundo, ['bra', 'usa'], 'tita');
    const ctx = contexto(sim, mundo);
    expect(validarPosicionamento(ctx, 'port', ponto(0, 28))).toBeNull();
    expect(validarPosicionamento(ctx, 'port', ponto(0, -10))).toBe('terra');
    // Centro a 20 m da terra dos dois lados: longe demais.
    expect(validarPosicionamento(ctx, 'port', ponto(0, 40))).toBe('longe_da_borda');
    expect(param('porto_distancia_borda_m')).toBeLessThan(20);
    expect(validarPosicionamento(ctx, 'storage', ponto(0, 28))).toBe('lago');
  });

  it(
    'UNI-16: a Impressora imprime o Porto da terra, sem entrar no líquido',
    { timeout: 60_000 },
    () => {
      const mundo = mundoComMar();
      const sim = partida(mundo, ['bra', 'usa'], 'tita');
      rico(sim);
      revelar(sim, 'bra', mundo);
      const [impressora] = criar(sim, [{ unidade: 'printer', x: 0, z: 5 }]);
      ordenar(sim, 'posicionar_estrutura', { id: impressora, tipo: 'port', ...alvo(0, 28) });
      let entrou = false;
      for (let t = 0; t < 60 * sim.tickHz; t++) {
        sim.step();
        if (emLiquido(mundo.mapa, onde(sim, impressora!))) entrou = true;
      }
      const porto = sim.state.entities.find(
        (id) => getComponent(sim.state, id, 'structure')?.tipo === 'port',
      );
      expect(porto).toBeDefined();
      expect(getComponent(sim.state, porto!, 'obra')).toBeUndefined();
      expect(entrou).toBe(false);
    },
  );

  it(
    'UNI-16/MOV-08: o Porto imprime embarcações que nascem e andam só no líquido',
    { timeout: 60_000 },
    () => {
      const { mundo, sim, porto } = comPorto();
      ordenar(sim, 'imprimir', { ids: [porto], item: 'boat_antenna' });
      rodar(sim, 30);
      const barco = sim.state.entities.find(
        (id) => getComponent(sim.state, id, 'unit')?.tipo === 'boat_antenna',
      );
      expect(barco).toBeDefined();
      expect(emLiquido(mundo.mapa, onde(sim, barco!))).toBe(true);
      // Mandado para a terra, para na borda; nunca sai das células de líquido (MOV-08).
      ordenar(sim, 'mover', { ids: [barco], ...alvo(0, -30) });
      const nav = mundo.grades.navegacao;
      let saiu = false;
      for (let t = 0; t < 20 * sim.tickHz; t++) {
        sim.step();
        if (nav.liquido![celulaDe(nav, onde(sim, barco!))] !== 1) saiu = true;
      }
      expect(saiu).toBe(false);
      expect(mundo.mapa.raio_m * arco(onde(sim, barco!), ponto(0, 20))).toBeLessThan(8);
    },
  );

  it('UNI-18: a Artilharia atira com boat_laser em corpo de solo na terra', () => {
    const { sim } = comPorto();
    const [barco] = criar(sim, [{ unidade: 'boat_artillery', x: 0, z: 34 }]);
    // Hover inimigo na terra do norte, a menos de alcance_m do barco.
    const [alvoEmTerra] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 46 + 1 }], 'usa');
    const eventos: SimEvent[] = [];
    ordenar(sim, 'atacar', { ids: [barco], alvo: alvoEmTerra });
    rodar(sim, 5, eventos);
    expect(
      eventos.some(
        (e) => e.tipo === 'disparo' && (e.dados as { atirador: number }).atirador === barco,
      ),
    ).toBe(true);
  });

  it(
    'UNI-16/ENE-12: embarcação recarrega no Porto; unidade de solo não vai ao Porto',
    { timeout: 60_000 },
    () => {
      const { sim, porto, nave } = comPorto(false);
      const [barco] = criar(sim, [{ unidade: 'boat_transport', x: 0, z: 40 }]);
      const [hover] = criar(sim, [{ unidade: 'hover_ex1', x: 5, z: 0 }]);
      getComponent(sim.state, barco!, 'bateria')!.en = 10;
      getComponent(sim.state, hover!, 'bateria')!.en = 10;
      ordenar(sim, 'recarregar', { ids: [barco, hover] });
      rodar(sim, 1);
      expect(getComponent(sim.state, barco!, 'recarga')!.estrutura).toBe(porto);
      expect(getComponent(sim.state, hover!, 'recarga')!.estrutura).toBe(nave);
      rodar(sim, 30);
      expect(getComponent(sim.state, barco!, 'bateria')!.en).toBeGreaterThan(10);
    },
  );

  it('UNI-19: a Embarcação Antena enxerga visao_m em volta, bem além do Hover de Observação', () => {
    const { mundo, sim } = comPorto();
    criar(sim, [{ unidade: 'boat_antenna', x: 0, z: 40 }]);
    sim.run(10);
    const visao = dados.moveis.find((m) => m.id === 'boat_antenna')!.visao_m;
    expect(visao).toBeGreaterThan(dados.moveis.find((m) => m.id === 'hover_scout')!.visao_m * 2);
    const ctx = { state: sim.state, mundo } as never;
    // CEN-02: em Titã a visão é multiplicada por `mult_visao`.
    const mult = dados.cenarios.find((c) => c.id === 'tita')!.mult_visao;
    expect(estadoEm(ctx, 'bra', ponto(visao * mult - 5, 40))).toBe(VISIVEL);
  });
});

describe('T-182 — UNI-20, D-90: embarque e desembarque', () => {
  it(
    'UNI-20: unidades de solo embarcam pela borda, atravessam e desembarcam do outro lado',
    { timeout: 90_000 },
    () => {
      const { mundo, sim } = comPorto(false);
      const [transporte] = criar(sim, [{ unidade: 'boat_transport', x: 18, z: 25 }]);
      const hovers = criar(sim, [
        { unidade: 'hover_ex1', x: -3, z: 5 },
        { unidade: 'hover_ex1', x: 3, z: 5 },
      ]);
      const [drone] = criar(sim, [{ unidade: 'drone_laser', x: 0, z: 5 }]);
      ordenar(sim, 'embarcar', { ids: [...hovers, drone], transporte });
      rodar(sim, 15);
      const carga = getComponent(sim.state, transporte!, 'transporte')!;
      // Drones não embarcam.
      expect([...carga.passageiros].sort()).toEqual([...hovers].sort());
      for (const h of hovers) expect(getComponent(sim.state, h!, 'embarcado')).toBeDefined();
      // Embarcada não aparece para o inimigo nem é atingida.
      // Desembarca na terra do norte (z > 60).
      ordenar(sim, 'desembarcar', { id: transporte, ...alvo(0, 70) });
      rodar(sim, 30);
      expect(carga.passageiros).toEqual([]);
      for (const h of hovers) {
        expect(getComponent(sim.state, h!, 'embarcado')).toBeUndefined();
        const d = onde(sim, h!);
        expect(emLiquido(mundo.mapa, d)).toBe(false);
        expect(mundo.mapa.raio_m * arco(d, ponto(0, 70))).toBeLessThan(12);
      }
    },
  );

  it(
    'UNI-20: até transporte_capacidade unidades; o resto fica em terra',
    { timeout: 60_000 },
    () => {
      const { sim } = comPorto(false);
      const [transporte] = criar(sim, [{ unidade: 'boat_transport', x: 18, z: 25 }]);
      const n = param('transporte_capacidade');
      const hovers = criar(
        sim,
        Array.from({ length: n + 1 }, (_, k) => ({
          unidade: 'hover_scout' as const,
          x: -15 + (k % 6) * 6,
          z: 2 + Math.floor(k / 6) * 5,
        })),
      );
      ordenar(sim, 'embarcar', { ids: hovers, transporte });
      // Onze numa borda estreita: a fila leva um tempo.
    rodar(sim, 60);
      expect(getComponent(sim.state, transporte!, 'transporte')!.passageiros).toHaveLength(n);
      expect(hovers.filter((h) => !getComponent(sim.state, h!, 'embarcado'))).toHaveLength(1);
    },
  );

  it('UNI-20: o Transporte destruído leva as unidades embarcadas', { timeout: 60_000 }, () => {
    const { sim } = comPorto(false);
    const [transporte] = criar(sim, [{ unidade: 'boat_transport', x: 18, z: 25 }]);
    const [hover] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 5 }]);
    ordenar(sim, 'embarcar', { ids: [hover], transporte });
    rodar(sim, 10);
    expect(getComponent(sim.state, hover!, 'embarcado')).toBeDefined();
    ordenar(sim, 'debug_destruir', { id: transporte });
    rodar(sim, 1);
    expect(sim.state.entities).not.toContain(hover);
  });
});
