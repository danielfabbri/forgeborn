import { describe, expect, it } from 'vitest';
import { param, type Sim, type SimEvent } from '../../src/sim';
import type { SystemContext } from '../../src/sim/core/pipeline';
import { Tutorial } from '../../src/game/tutorial';
import { INICIAR_PARTIDA_COMMAND, MONTAR_SEM_NAVE_COMMAND } from '../../src/sim/producao/inicio';
import { criar, mundoLiso, ordenar, partida, ponto, revelar, semear } from '../sim/mundo-teste';

const ctx = (sim: Sim): SystemContext => ({
  state: sim.state,
  tick: sim.state.tick,
  dt: 1 / sim.tickHz,
  commands: [],
  mundo: mundoLiso(),
  emit: () => {},
});

describe('T-134 — CAM-07: passos do tutorial', () => {
  it('CAM-07: os passos só avançam em ordem, cada um pela sua condição', () => {
    const sim = partida(mundoLiso());
    semear(sim, [{ recurso: 'cu', quantidade: 500, x: 40, z: 0 }]);
    ordenar(sim, INICIAR_PARTIDA_COMMAND, {
      modo: 'padrao',
      nacoes: [{ nacao: 'bra', zona: ponto(0, 0) }],
    });
    ordenar(sim, MONTAR_SEM_NAVE_COMMAND, { tipo: 'alvos_treino', centro: ponto(0, 90) }, 'usa');
    sim.step();
    revelar(sim);
    const tut = new Tutorial('bra', ponto(0, 60));
    const avancar = (eventos: SimEvent[] = []) => tut.atualizar(ctx(sim), eventos);
    // Uma Impressora antes da hora não pula os passos 1 e 2.
    criar(sim, [{ unidade: 'printer', x: -10, z: 0 }]);
    avancar();
    expect(tut.passo).toBe(1);
    avancar([{ tick: 0, tipo: 'entrega', dados: { nacao: 'bra', recurso: 'fe', u: 1 } }]);
    // 2º hover (o inicial + um novo); a Impressora já existe: vai direto ao 4.
    criar(sim, [{ unidade: 'hover_explorer', x: -14, z: 0 }]);
    avancar();
    expect(tut.passo).toBe(4);
    criar(sim, [{ estrutura: 'solar_plant', x: -30, z: 10 }]);
    avancar();
    expect(tut.passo).toBe(5);
    // Armazém longe do Cobre não conta; perto, conta.
    criar(sim, [{ estrutura: 'storage', x: -40, z: -30 }]);
    avancar();
    expect(tut.passo).toBe(5);
    criar(sim, [{ estrutura: 'storage', x: 40 + param('tutorial_raio_armazem_m') / 2 + 6, z: 0 }]);
    avancar();
    expect(tut.passo).toBe(6);
    criar(sim, [{ unidade: 'hover_scout', x: 0, z: 58 }]);
    sim.step();
    sim.step();
    avancar();
    expect(tut.passo).toBe(7);
    criar(sim, [
      { estrutura: 'laser_tower', x: 20, z: -20 },
      { estrutura: 'wall', x: 30, z: -30 },
      { estrutura: 'gate', x: 45, z: -30 },
    ]);
    avancar();
    expect(tut.passo).toBe(9);
  });
});
