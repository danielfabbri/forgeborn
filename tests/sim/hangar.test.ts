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

/** Nave e Hangar da bra, ligados e com o banco cheio. */
function base(sim: Sim) {
  const [, hangar] = criar(sim, [
    { estrutura: 'ship', x: -30, z: 0 },
    { estrutura: 'hangar', x: 0, z: 0 },
  ]);
  ordenar(sim, 'debug_encher_banco', {});
  sim.step();
  Object.assign(sim.state.estoques.bra!, muito);
  return hangar!;
}

describe('T-185 — PRD-01, UNI-21, D-91: Hangar de Drones', () => {
  it('PRD-01: a Impressora não produz mais os drones (só o Hangar); as outras unidades continuam', () => {
    expect(produz('printer', 'drone_bomber')).toBe(false);
    expect(produz('printer', 'drone_laser')).toBe(false);
    expect(produz('printer', 'drone_kamikaze')).toBe(false);
    // D-92: EX1 saiu da Impressora também (agora é a Fábrica de Artilharia); Observação não.
    expect(produz('printer', 'hover_scout')).toBe(true);
    expect(produz('hangar', 'drone_bomber')).toBe(true);
    expect(produz('hangar', 'drone_laser')).toBe(true);
    expect(produz('hangar', 'drone_kamikaze')).toBe(true);

    const sim = partida(mundoLiso());
    Object.assign(sim.state.estoques.bra!, muito);
    const [impressora] = criar(sim, [{ unidade: 'printer', x: 10, z: 0 }]);
    ordenar(sim, 'imprimir', { ids: [impressora], item: 'drone_laser' });
    sim.step();
    expect(getComponent(sim.state, impressora!, 'producer')!.fila).toEqual([]);
  });

  it('UNI-21: o Hangar pronto e na rede imprime os 3 drones pela própria fila', () => {
    const sim = partida(mundoLiso());
    const hangar = base(sim);
    for (const item of ['drone_bomber', 'drone_laser', 'drone_kamikaze'] as const) {
      ordenar(sim, 'imprimir', { ids: [hangar], item });
    }
    sim.step();
    expect(getComponent(sim.state, hangar, 'producer')!.fila.map((i) => i.item)).toEqual([
      'drone_bomber',
      'drone_laser',
      'drone_kamikaze',
    ]);
    rodar(
      sim,
      custo('drone_bomber').tempo_s +
        custo('drone_laser').tempo_s +
        custo('drone_kamikaze').tempo_s +
        5,
    );
    expect(getComponent(sim.state, hangar, 'producer')!.fila).toEqual([]);
    const tipos = (t: string) =>
      sim.state.entities.filter((id) => getComponent(sim.state, id, 'unit')?.tipo === t).length;
    expect(tipos('drone_bomber')).toBe(1);
    expect(tipos('drone_laser')).toBe(1);
    expect(tipos('drone_kamikaze')).toBe(1);
  });

  it('ENE-28: sem rede, o Hangar não avança a impressão', () => {
    const sim = partida(mundoLiso());
    const [hangar] = criar(sim, [{ estrutura: 'hangar', x: 0, z: 0, semCabo: true }]);
    Object.assign(sim.state.estoques.bra!, muito);
    ordenar(sim, 'imprimir', { ids: [hangar], item: 'drone_laser' });
    rodar(sim, custo('drone_laser').tempo_s + 5);
    const item = getComponent(sim.state, hangar!, 'producer')!.fila[0];
    expect(item?.item).toBe('drone_laser');
    expect(item?.progresso).toBe(0);
  });
});

describe('T-186 — CMB-30, UNI-12, D-91: Drone Kamikaze', () => {
  it('CMB-30: persegue o alvo, explode ao encostar (dano em área) e sempre se destrói', () => {
    const sim = partida(mundoLiso());
    const [kamikaze] = criar(sim, [{ unidade: 'drone_kamikaze', x: 0, z: 0 }]);
    // Dentro do visao_m=16 do próprio Kamikaze, sem depender de revelar() (que só marca
    // memória de terreno, não visão ao vivo — alvoValido() exige visão ao vivo).
    // Dois inimigos próximos um do outro: um é o alvo, o outro pega o splash.
    const [alvoPrincipal, vizinho] = criar(
      sim,
      [
        { unidade: 'hover_ex1', x: 10, z: 0 },
        { unidade: 'hover_ex1', x: 10, z: 1.5 },
      ],
      'usa',
    );
    ordenar(sim, 'atacar', { ids: [kamikaze], alvo: alvoPrincipal });
    const eventos: SimEvent[] = [];
    rodar(sim, 15, eventos);
    expect(sim.state.entities).not.toContain(kamikaze);
    expect(
      eventos.some(
        (e) => e.tipo === 'dano' && (e.dados as { alvo: number }).alvo === alvoPrincipal,
      ),
    ).toBe(true);
    expect(
      eventos.some((e) => e.tipo === 'dano' && (e.dados as { alvo: number }).alvo === vizinho),
    ).toBe(true);
  });

  it('CMB-30: o Kamikaze se destrói ao explodir mesmo sem mais ninguém por perto', () => {
    const sim = partida(mundoLiso());
    const [kamikaze] = criar(sim, [{ unidade: 'drone_kamikaze', x: 0, z: 0 }]);
    const [alvoIsolado] = criar(sim, [{ unidade: 'hover_ex1', x: 12, z: 0 }], 'usa');
    ordenar(sim, 'atacar', { ids: [kamikaze], alvo: alvoIsolado });
    rodar(sim, 8);
    expect(sim.state.entities).not.toContain(kamikaze);
    expect(getComponent(sim.state, alvoIsolado!, 'vida')!.hp).toBeLessThan(
      dados.moveis.find((m) => m.id === 'hover_ex1')!.hp,
    );
  });

  it('UNI-12: a Antiaérea derruba o Kamikaze como qualquer drone no ar', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: -20, z: 0 }]);
    const [aa] = criar(sim, [{ estrutura: 'aa_battery', x: 0, z: 0 }]);
    const [kamikaze] = criar(sim, [{ unidade: 'drone_kamikaze', x: 0, z: 20 }], 'usa');
    const eventos: SimEvent[] = [];
    rodar(sim, 20, eventos);
    expect(
      eventos.some(
        (e) => e.tipo === 'disparo' && (e.dados as { atirador: number }).atirador === aa,
      ),
    ).toBe(true);
    expect(sim.state.entities).not.toContain(kamikaze);
  });
});
