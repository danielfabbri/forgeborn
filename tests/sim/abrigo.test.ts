import { describe, expect, it } from 'vitest';
import { getComponent, param, type Sim, type SimEvent } from '../../src/sim';
import type { SystemContext } from '../../src/sim/core/pipeline';
import { aplicarDano } from '../../src/sim/combate/dano';
import { raioDaPegada } from '../../src/sim/units/criar';
import { visivelPara } from '../../src/sim/visao/nevoa';
import { criar, mundoLiso, ordenar, partida } from './mundo-teste';

const rodar = (sim: Sim, s: number, eventos?: SimEvent[]) => {
  for (let t = 0; t < Math.round(s * sim.tickHz); t++) {
    const novos = sim.step();
    eventos?.push(...novos);
  }
};
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
const dentro = (sim: Sim, id: number) => getComponent(sim.state, id, 'abrigo')?.estado === 'dentro';

describe('T-069 — CMB-28: Recolher mineradores', () => {
  function base(sim: Sim, hovers: number) {
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const ids = criar(
      sim,
      Array.from({ length: hovers }, (_, k) => ({
        unidade: 'hover_explorer' as const,
        x: 30 + 4 * (k % 4),
        z: 4 * Math.floor(k / 4),
      })),
    );
    ordenar(sim, 'debug_encher_banco', {});
    sim.step();
    return { nave: nave!, hovers: ids };
  }

  it('CMB-28: os hovers vão à Nave, ficam fora do mapa, invisíveis e imunes', () => {
    const sim = partida(mundoLiso());
    const { hovers } = base(sim, 2);
    ordenar(sim, 'recolher_mineradores', {});
    rodar(sim, 15);
    for (const h of hovers) expect(dentro(sim, h)).toBe(true);
    const ctx = contexto(sim);
    expect(visivelPara(ctx, 'usa', hovers[0]!)).toBe(false);
    const hp = getComponent(sim.state, hovers[0]!, 'vida')!.hp;
    aplicarDano(ctx, hovers[0]!, 50, 'laser', null, 'usa');
    expect(getComponent(sim.state, hovers[0]!, 'vida')!.hp).toBe(hp);
  });

  it('CMB-28: cada abrigado soma um disparo de abrigo_laser, pago da rede', () => {
    const sim = partida(mundoLiso());
    const { nave } = base(sim, 3);
    ordenar(sim, 'recolher_mineradores', {});
    rodar(sim, 15);
    criar(
      sim,
      [{ unidade: 'hover_ex1', x: 0, z: -(raioDaPegada('ship') + 8), postura: 'passiva' }],
      'usa',
    );
    const eventos: SimEvent[] = [];
    rodar(sim, 1.05, eventos);
    const extras = eventos.filter(
      (e) => e.tipo === 'disparo' && e.dados.arma === 'abrigo_laser' && e.dados.atirador === nave,
    );
    expect(extras).toHaveLength(3);
  });

  it('CMB-28: até abrigo_vagas por abrigo; o Armazém também abriga', () => {
    const sim = partida(mundoLiso());
    const vagas = param('abrigo_vagas');
    const { hovers } = base(sim, vagas + 2);
    ordenar(sim, 'recolher_mineradores', {});
    rodar(sim, 20);
    expect(hovers.filter((h) => dentro(sim, h))).toHaveLength(vagas);
    // Com um Armazém, os que sobraram têm para onde ir.
    const sim2 = partida(mundoLiso());
    const r = base(sim2, vagas + 2);
    const [armazem] = criar(sim2, [{ estrutura: 'storage', x: 60, z: 0 }]);
    ordenar(sim2, 'recolher_mineradores', {});
    rodar(sim2, 20);
    expect(r.hovers.filter((h) => dentro(sim2, h))).toHaveLength(vagas + 2);
    expect(
      r.hovers.filter((h) => getComponent(sim2.state, h, 'abrigo')?.estrutura === armazem),
    ).not.toHaveLength(0);
  });

  it('CMB-28: o mesmo comando libera todos para a coleta', () => {
    const sim = partida(mundoLiso());
    const { hovers } = base(sim, 2);
    ordenar(sim, 'recolher_mineradores', {});
    rodar(sim, 15);
    ordenar(sim, 'recolher_mineradores', {});
    rodar(sim, 0.2);
    for (const h of hovers) {
      expect(getComponent(sim.state, h, 'abrigo')).toBeUndefined();
      expect(getComponent(sim.state, h, 'order')!.tipo).toBe('tarefa');
    }
  });

  it('CMB-28: se o abrigo cai, os abrigados saem', () => {
    const sim = partida(mundoLiso());
    base(sim, 0);
    const [armazem] = criar(sim, [{ estrutura: 'storage', x: -80, z: 0 }]);
    const [hover] = criar(sim, [{ unidade: 'hover_explorer', x: -100, z: 0 }]);
    // Só o Armazém, perto dele: a Nave fica longe demais para ser a mais próxima.
    ordenar(sim, 'recolher_mineradores', {});
    rodar(sim, 15);
    expect(getComponent(sim.state, hover!, 'abrigo')?.estrutura).toBe(armazem);
    expect(dentro(sim, hover!)).toBe(true);
    getComponent(sim.state, armazem!, 'vida')!.hp = 0;
    rodar(sim, 1);
    expect(getComponent(sim.state, hover!, 'abrigo')).toBeUndefined();
    expect(sim.state.entities.includes(hover!)).toBe(true);
  });
});
