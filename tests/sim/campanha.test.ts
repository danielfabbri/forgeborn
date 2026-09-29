import { describe, expect, it } from 'vitest';
import { getComponent, type Sim } from '../../src/sim';
import { INICIAR_PARTIDA_COMMAND, MONTAR_SEM_NAVE_COMMAND } from '../../src/sim/producao/inicio';
import { alvo, criar, mundoLiso, ordenar, partida, ponto } from './mundo-teste';

const rodar = (sim: Sim, s: number) => {
  for (let t = 0; t < Math.round(s * sim.tickHz); t++) sim.step();
};

describe('T-133 — CAM-02, D-73: liberação progressiva', () => {
  it('CAM-02: item não liberado é recusado na fila e no posicionamento, para qualquer nação', () => {
    const sim = partida(mundoLiso());
    ordenar(sim, INICIAR_PARTIDA_COMMAND, {
      modo: 'padrao',
      nacoes: [{ nacao: 'bra', zona: ponto(0, 0) }],
      liberados: ['hover_explorer', 'printer', 'solar_plant'],
    });
    sim.step();
    Object.assign(sim.state.estoques.bra!, { fe: 900, si: 900, cu: 900, li: 900, ti: 900 });
    const [impressora] = criar(sim, [{ unidade: 'printer', x: 20, z: 0 }]);
    ordenar(sim, 'imprimir', { ids: [impressora], item: 'hover_ex1' });
    ordenar(sim, 'imprimir', { ids: [impressora], item: 'hover_explorer' });
    ordenar(sim, 'posicionar_estrutura', {
      id: impressora,
      tipo: 'storage',
      ...alvo(40, 0),
    });
    sim.step();
    const fila = getComponent(sim.state, impressora!, 'producer')!.fila.map((i) => i.item);
    expect(fila).toEqual(['hover_explorer']);
  });
});

describe('T-134 — CAM-06, D-73: oponentes sem Nave', () => {
  it('CAM-06: o posto é montado, só se defende e sai eliminado quando perde tudo (vitória)', () => {
    const sim = partida(mundoLiso());
    ordenar(sim, INICIAR_PARTIDA_COMMAND, {
      modo: 'padrao',
      nacoes: [{ nacao: 'bra', zona: ponto(0, 0) }],
    });
    ordenar(sim, MONTAR_SEM_NAVE_COMMAND, { tipo: 'posto_passivo', centro: ponto(0, 120) }, 'usa');
    sim.step();
    const doPosto = () =>
      sim.state.entities.filter(
        (id) =>
          getComponent(sim.state, id, 'owner')?.nacao === 'usa' &&
          (getComponent(sim.state, id, 'structure') || getComponent(sim.state, id, 'unit')),
      );
    const tipos = doPosto().map(
      (id) =>
        getComponent(sim.state, id, 'structure')?.tipo ?? getComponent(sim.state, id, 'unit')!.tipo,
    );
    expect(tipos.sort()).toEqual(
      [
        'hover_ex1',
        'hover_ex1',
        'hover_ex1',
        'laser_tower',
        'laser_tower',
        'solar_plant',
        'storage',
      ].sort(),
    );
    rodar(sim, 2);
    expect(sim.state.placar.usa!.eliminada).toBe(false);
    for (const id of doPosto()) getComponent(sim.state, id, 'vida')!.hp = 0;
    rodar(sim, 7);
    expect(sim.state.placar.usa!.eliminada).toBe(true);
    expect(sim.state.resultado?.vencedor).toBe('bra');
  });

  it('CAM-06: os alvos de treino nunca disparam', () => {
    const sim = partida(mundoLiso());
    ordenar(sim, MONTAR_SEM_NAVE_COMMAND, { tipo: 'alvos_treino', centro: ponto(0, 0) }, 'usa');
    sim.step();
    const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 8, postura: 'passiva' }]);
    rodar(sim, 5);
    const vida = getComponent(sim.state, ex1!, 'vida')!;
    expect(vida.hp).toBe(vida.max);
  });
});
