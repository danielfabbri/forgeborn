import { describe, expect, it } from 'vitest';
import { getComponent, param, type Sim } from '../../src/sim';
import type { SystemContext } from '../../src/sim/core/pipeline';
import { INICIAR_PARTIDA_COMMAND } from '../../src/sim/producao';
import { ESCURO, estadoEm, NEVOA, VISIVEL, visivelPara } from '../../src/sim/visao/nevoa';
import { criar, mundoLiso, ordenar, partida, ponto } from './mundo-teste';

function contexto(sim: Sim): SystemContext {
  return {
    state: sim.state,
    tick: sim.state.tick,
    dt: 1 / sim.tickHz,
    commands: [],
    mundo: mundoLiso(),
    emit: () => {},
  };
}
const atualizar = (sim: Sim) => sim.run(sim.tickHz / param('nevoa_atualizacao_hz'));
const estado = (sim: Sim, x: number, z: number) => estadoEm(contexto(sim), 'bra', ponto(x, z));
const iniciar = (sim: Sim, extra: Record<string, unknown> = {}) => {
  ordenar(sim, INICIAR_PARTIDA_COMMAND, {
    modo: 'padrao',
    nacoes: [
      { nacao: 'bra', zona: ponto(0, 0) },
      { nacao: 'usa', zona: ponto(0, 200) },
    ],
    ...extra,
  });
  sim.step();
};

describe('T-104 — FB-01, REG-12: opções de partida na simulação', () => {
  it('FB-01: "normal" começa escuro fora da área explorada inicial', () => {
    const sim = partida(mundoLiso());
    iniciar(sim);
    expect(estado(sim, 120, 0)).toBe(ESCURO);
  });

  it('FB-01: "explorado" começa todo em névoa, sem escuro absoluto', () => {
    const sim = partida(mundoLiso());
    iniciar(sim, { nevoa: 'explorado' });
    atualizar(sim);
    expect(estado(sim, 120, 0)).toBe(NEVOA);
    expect(estado(sim, 0, 3)).toBe(VISIVEL);
    expect(sim.state.nevoa.bra!.includes(ESCURO)).toBe(false);
  });

  it('FB-01/D-37: "revelado" deixa tudo visível o tempo todo, mas a camuflagem segue', () => {
    const sim = partida(mundoLiso());
    iniciar(sim, { nevoa: 'revelado' });
    const [longe] = criar(sim, [{ unidade: 'hover_explorer', x: 0, z: 120 }], 'usa');
    criar(sim, [{ mina: true, x: 100, z: 0 }], 'usa');
    atualizar(sim);
    expect(sim.state.nevoa.bra!.every((c) => c === VISIVEL)).toBe(true);
    expect(visivelPara(contexto(sim), 'bra', longe!)).toBe(true);
    const mina = sim.state.entities.find((id) => getComponent(sim.state, id, 'mine'))!;
    expect(visivelPara(contexto(sim), 'bra', mina)).toBe(false);
  });

  it('REG-12: o tempo limite vem do início da partida', () => {
    const sim = partida(mundoLiso());
    iniciar(sim, { tempoLimite_s: 1200 });
    expect(sim.state.tempoLimite_s).toBe(1200);
  });
});

describe('T-106 — REG-23: estatísticas de fim de partida', () => {
  it('REG-23: energia gerada e consumida, ações do jogador e impressas', () => {
    const sim = partida(mundoLiso());
    iniciar(sim);
    const hover = sim.state.entities.find(
      (id) =>
        getComponent(sim.state, id, 'unit')?.tipo === 'hover_explorer' &&
        getComponent(sim.state, id, 'owner')?.nacao === 'bra',
    )!;
    ordenar(sim, 'mover', {
      ids: [hover],
      ...(() => {
        const p = ponto(0, 30);
        return { x: p[0], y: p[1], z: p[2] };
      })(),
    });
    sim.run(sim.tickHz * 2);
    const e = sim.state.estatisticas.bra!;
    expect(e.energiaGerada).toBeGreaterThan(0);
    expect(e.energiaConsumida).toBeGreaterThanOrEqual(0);
    // Montagem da partida não conta; a ordem de mover conta.
    expect(e.acoes).toBe(1);
    // O hover que sai da rampa no início não foi impresso.
    expect(e.impressas).toEqual({});
  });

  it('REG-23: perdas do dono e abates de quem destruiu, por tipo', () => {
    const sim = partida(mundoLiso());
    const [alvo] = criar(sim, [{ unidade: 'hover_explorer', x: 0, z: 0 }], 'usa');
    const [torre] = criar(sim, [{ estrutura: 'storage', x: 20, z: 0 }], 'usa');
    getComponent(sim.state, alvo!, 'combate')!.ultimoDanoNacao = 'bra';
    getComponent(sim.state, alvo!, 'vida')!.hp = 0;
    getComponent(sim.state, torre!, 'vida')!.hp = 0;
    sim.step();
    expect(sim.state.estatisticas.usa!.perdidas).toEqual({ hover_explorer: 1 });
    expect(sim.state.estatisticas.usa!.estruturasPerdidas).toEqual({ storage: 1 });
    expect(sim.state.estatisticas.bra!.destruidas).toEqual({ hover_explorer: 1 });
  });
});
