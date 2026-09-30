import { describe, expect, it } from 'vitest';
import { dados, getComponent, type Sim, type SimEvent } from '../../src/sim';
import { produz } from '../../src/sim/producao/custos';
import { criar, mundoLiso, ordenar, partida } from './mundo-teste';

const rodar = (sim: Sim, s: number, eventos?: SimEvent[]) => {
  for (let t = 0; t < Math.round(s * sim.tickHz); t++) {
    const novos = sim.step();
    eventos?.push(...novos);
  }
};
const custo = (id: string) => dados.custos.find((c) => c.id === id)!;
const muito = { fe: 5000, si: 5000, cu: 5000, li: 5000, ti: 5000, u: 500 };

/** Nave e Fábrica de Artilharia da bra, ligadas e com o banco cheio. */
function base(sim: Sim) {
  const [, arsenal] = criar(sim, [
    { estrutura: 'ship', x: -30, z: 0 },
    { estrutura: 'arsenal', x: 0, z: 0 },
  ]);
  ordenar(sim, 'debug_encher_banco', {});
  sim.step();
  Object.assign(sim.state.estoques.bra!, muito);
  return arsenal!;
}

describe('T-188 — PRD-01, UNI-22, D-92: Fábrica de Artilharia', () => {
  it('PRD-01: a Impressora não produz mais EX1/OPQ (só a Fábrica); as outras unidades continuam', () => {
    expect(produz('printer', 'hover_ex1')).toBe(false);
    expect(produz('printer', 'hover_opq')).toBe(false);
    expect(produz('printer', 'siege_tank')).toBe(false);
    expect(produz('printer', 'hover_scout')).toBe(true);
    expect(produz('arsenal', 'hover_ex1')).toBe(true);
    expect(produz('arsenal', 'hover_opq')).toBe(true);
    expect(produz('arsenal', 'siege_tank')).toBe(true);

    const sim = partida(mundoLiso());
    Object.assign(sim.state.estoques.bra!, muito);
    const [impressora] = criar(sim, [{ unidade: 'printer', x: 10, z: 0 }]);
    ordenar(sim, 'imprimir', { ids: [impressora], item: 'hover_ex1' });
    sim.step();
    expect(getComponent(sim.state, impressora!, 'producer')!.fila).toEqual([]);
  });

  it('UNI-22: a Fábrica pronta e na rede imprime as 3 unidades pela própria fila', () => {
    const sim = partida(mundoLiso());
    const arsenal = base(sim);
    for (const item of ['hover_ex1', 'hover_opq', 'siege_tank'] as const) {
      ordenar(sim, 'imprimir', { ids: [arsenal], item });
    }
    sim.step();
    expect(getComponent(sim.state, arsenal, 'producer')!.fila.map((i) => i.item)).toEqual([
      'hover_ex1',
      'hover_opq',
      'siege_tank',
    ]);
    rodar(
      sim,
      custo('hover_ex1').tempo_s + custo('hover_opq').tempo_s + custo('siege_tank').tempo_s + 5,
    );
    expect(getComponent(sim.state, arsenal, 'producer')!.fila).toEqual([]);
    const tipos = (t: string) =>
      sim.state.entities.filter((id) => getComponent(sim.state, id, 'unit')?.tipo === t).length;
    expect(tipos('hover_ex1')).toBe(1);
    expect(tipos('hover_opq')).toBe(1);
    expect(tipos('siege_tank')).toBe(1);
  });

  it('ENE-28: sem rede, a Fábrica não avança a impressão', () => {
    const sim = partida(mundoLiso());
    const [arsenal] = criar(sim, [{ estrutura: 'arsenal', x: 0, z: 0, semCabo: true }]);
    Object.assign(sim.state.estoques.bra!, muito);
    ordenar(sim, 'imprimir', { ids: [arsenal], item: 'hover_ex1' });
    rodar(sim, custo('hover_ex1').tempo_s + 5);
    const item = getComponent(sim.state, arsenal!, 'producer')!.fila[0];
    expect(item?.item).toBe('hover_ex1');
    expect(item?.progresso).toBe(0);
  });
});

describe('T-189 — UNI-22, D-92: Tanque de Cerco', () => {
  it('martela o alvo repetidamente (sem se destruir) e não atinge alvos aéreos', () => {
    const sim = partida(mundoLiso());
    const [siege] = criar(sim, [{ unidade: 'siege_tank', x: 0, z: 0 }]);
    const [alvo] = criar(sim, [{ estrutura: 'storage', x: 10, z: 0 }], 'usa');
    ordenar(sim, 'atacar', { ids: [siege], alvo });
    const eventos: SimEvent[] = [];
    rodar(sim, 12, eventos);
    const golpes = eventos.filter(
      (e) => e.tipo === 'dano' && (e.dados as { alvo: number }).alvo === alvo,
    );
    // Corpo a corpo martelando: mais de um golpe na mesma estrutura.
    expect(golpes.length).toBeGreaterThan(1);
    expect(sim.state.entities).toContain(siege);
    const vidaAlvo = getComponent(sim.state, alvo!, 'vida')!;
    expect(vidaAlvo.hp).toBeLessThan(dados.estruturas.find((e) => e.id === 'storage')!.hp);

    // Um drone aéreo por perto nunca é escolhido nem atingido (arma só contra solo).
    const [drone] = criar(sim, [{ unidade: 'drone_laser', x: 1, z: 1 }], 'usa');
    ordenar(sim, 'atacar', { ids: [siege], alvo: drone });
    const eventos2: SimEvent[] = [];
    rodar(sim, 5, eventos2);
    expect(
      eventos2.some((e) => e.tipo === 'dano' && (e.dados as { alvo: number }).alvo === drone),
    ).toBe(false);
  });
});
