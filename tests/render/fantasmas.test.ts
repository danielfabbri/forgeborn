import { describe, expect, it } from 'vitest';
import { getComponent, type Sim } from '../../src/sim';
import type { SystemContext } from '../../src/sim/core/pipeline';
import { MemoriaDeFantasmas } from '../../src/render/fantasmas';
import { NevoaRender } from '../../src/render/nevoa';
import { criar, mundoLiso, partida } from '../sim/mundo-teste';

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
const rodar = (sim: Sim, s: number) => {
  for (let t = 0; t < Math.round(s * sim.tickHz); t++) sim.step();
};

describe('T-071 — VIS-04: fantasmas de estruturas', () => {
  it('VIS-04: fora da visão, a estrutura vista fica como fantasma com tipo e HP da última observação', () => {
    const sim = partida(mundoLiso());
    const [olheiro] = criar(sim, [{ unidade: 'hover_explorer', x: 0, z: 0 }]);
    const [torre] = criar(sim, [{ estrutura: 'storage', x: 0, z: 12 }], 'usa');
    rodar(sim, 0.3);
    const memoria = new MemoriaDeFantasmas();
    memoria.atualizar(contexto(sim), 'bra');
    expect(memoria.visiveis(contexto(sim), 'bra')).toEqual([]);
    const hp = getComponent(sim.state, torre!, 'vida')!.hp;

    // O olheiro sai; a estrutura perde HP longe da vista.
    getComponent(sim.state, olheiro!, 'vida')!.hp = 0;
    rodar(sim, 0.3);
    getComponent(sim.state, torre!, 'vida')!.hp = hp / 2;
    memoria.atualizar(contexto(sim), 'bra');
    const [fantasma] = memoria.visiveis(contexto(sim), 'bra');
    expect(fantasma).toMatchObject({ id: torre, tipo: 'storage', nacao: 'usa', hp });
  });

  it('VIS-04: o fantasma some quando a área é revista e a estrutura não existe mais', () => {
    const sim = partida(mundoLiso());
    const [olheiro] = criar(sim, [{ unidade: 'hover_explorer', x: 0, z: 0 }]);
    const [torre] = criar(sim, [{ estrutura: 'storage', x: 0, z: 12 }], 'usa');
    rodar(sim, 0.3);
    const memoria = new MemoriaDeFantasmas();
    memoria.atualizar(contexto(sim), 'bra');
    getComponent(sim.state, olheiro!, 'vida')!.hp = 0;
    rodar(sim, 0.3);
    getComponent(sim.state, torre!, 'vida')!.hp = 0;
    rodar(sim, 0.3);
    memoria.atualizar(contexto(sim), 'bra');
    expect(memoria.visiveis(contexto(sim), 'bra')).toHaveLength(1);

    criar(sim, [{ unidade: 'hover_explorer', x: 0, z: 0 }]);
    rodar(sim, 0.3);
    memoria.atualizar(contexto(sim), 'bra');
    expect(memoria.visiveis(contexto(sim), 'bra')).toEqual([]);
  });
});

describe('T-071 — TEC-17: textura da névoa', () => {
  it('TEC-17: a grade do jogador vira a textura (escuro 0, névoa ½, visível 1), na ordem das células', () => {
    const nevoa = new NevoaRender(2);
    const estados = Array.from({ length: 24 }, (_, c) => c % 3);
    nevoa.atualizar(estados);
    const texels = nevoa.textura.image.data as Uint8Array;
    expect([...texels.slice(0, 3)]).toEqual([0, 127, 255]);
    expect(nevoa.textura.image.width).toBe(2);
    expect(nevoa.textura.image.height).toBe(12);
    nevoa.atualizar(undefined);
    expect(texels.every((v) => v === 255)).toBe(true);
  });
});
