import { describe, expect, it } from 'vitest';
import { getComponent, param, type Sim } from '../../src/sim';
import type { SystemContext } from '../../src/sim/core/pipeline';
import { jazidasElegiveis } from '../../src/sim/economia';
import { INICIAR_PARTIDA_COMMAND, validarPosicionamento } from '../../src/sim/producao';
import { statsMovel } from '../../src/sim/units/stats';
import { ESCURO, estadoEm, NEVOA, VISIVEL, visivelPara } from '../../src/sim/visao/nevoa';
import { alvo, criar, mundoLiso, ordenar, partida, ponto, semear } from './mundo-teste';

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
/** Um passo de visão garantido (o sistema roda a `nevoa_atualizacao_hz`). */
function atualizar(sim: Sim): void {
  sim.run(sim.tickHz / param('nevoa_atualizacao_hz'));
}
const estado = (sim: Sim, x: number, z: number, nacao: 'bra' | 'usa' = 'bra') =>
  estadoEm(contexto(sim), nacao, ponto(x, z));

describe('T-070 — VIS-01 a VIS-03: névoa na simulação', () => {
  it('VIS-01/VIS-02: o que está no raio de visão é visível; o resto começa escuro', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0, postura: 'passiva' }]);
    atualizar(sim);
    const visao = statsMovel('hover_ex1').visao_m;
    expect(estado(sim, 0, visao - 2)).toBe(VISIVEL);
    expect(estado(sim, 0, visao + 3)).toBe(ESCURO);
    expect(estado(sim, 0, 0, 'usa')).toBe(ESCURO);
  });

  it('VIS-01: o que já foi visto e deixou de ser fica em névoa', () => {
    const sim = partida(mundoLiso());
    const [u] = criar(sim, [{ unidade: 'hover_scout', x: 0, z: 0 }]);
    atualizar(sim);
    ordenar(sim, 'mover', { ids: [u], ...alvo(0, 80) });
    sim.run(20 * sim.tickHz);
    expect(estado(sim, 0, 0)).toBe(NEVOA);
    expect(estado(sim, 0, 80)).toBe(VISIVEL);
  });

  it('VIS-03/CMB-17: drones em voo enxergam em círculo; a visão é da nação inteira', () => {
    const sim = partida(mundoLiso());
    criar(sim, [
      { unidade: 'drone_laser', x: 0, z: 0, postura: 'passiva' },
      { unidade: 'hover_explorer', x: 0, z: 60 },
    ]);
    const [inimigo] = criar(sim, [{ unidade: 'hover_explorer', x: 5, z: 60 }], 'usa');
    atualizar(sim);
    expect(estado(sim, 10, 0)).toBe(VISIVEL);
    expect(visivelPara(contexto(sim), 'bra', inimigo!)).toBe(true);
  });

  it('VIS-01: corpo inimigo fora da visão não é visível; os próprios sempre são', () => {
    const sim = partida(mundoLiso());
    const [meu] = criar(sim, [{ unidade: 'hover_explorer', x: 0, z: 0 }]);
    const [escondido] = criar(sim, [{ unidade: 'hover_explorer', x: 0, z: 50 }], 'usa');
    atualizar(sim);
    expect(visivelPara(contexto(sim), 'bra', escondido!)).toBe(false);
    expect(visivelPara(contexto(sim), 'bra', meu!)).toBe(true);
  });

  it('REG-07: a área em volta da Nave começa explorada (raio_explorado_inicial_m)', () => {
    const sim = partida(mundoLiso());
    ordenar(sim, INICIAR_PARTIDA_COMMAND, {
      modo: 'padrao',
      nacoes: [{ nacao: 'bra', zona: ponto(0, 0) }],
    });
    sim.step();
    const raio = param('raio_explorado_inicial_m');
    expect(estado(sim, raio - 3, 0)).not.toBe(ESCURO);
    expect(estado(sim, raio + 4, 0)).toBe(ESCURO);
  });

  it('PRD-10: não se constrói em terreno não explorado', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ unidade: 'printer', x: 0, z: 0 }]);
    atualizar(sim);
    const ctx = contexto(sim);
    expect(validarPosicionamento(ctx, 'storage', ponto(0, 8), 'bra')).toBeNull();
    expect(validarPosicionamento(ctx, 'storage', ponto(0, 40), 'bra')).toBe('inexplorado');
  });

  it('ECO-19: jazida não explorada não é elegível para a Diretiva', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [perto, longe] = semear(sim, [
      { recurso: 'fe', quantidade: 500, x: 25, z: 0 },
      { recurso: 'fe', quantidade: 500, x: 0, z: 80 },
    ]);
    atualizar(sim);
    const elegiveis = jazidasElegiveis(contexto(sim), 'bra');
    expect(elegiveis).toContain(perto);
    expect(elegiveis).not.toContain(longe);
    expect(getComponent(sim.state, longe!, 'jazida')).toBeDefined();
  });
});
