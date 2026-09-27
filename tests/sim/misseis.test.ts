import { describe, expect, it } from 'vitest';
import { dados, getComponent, param, type Sim, type SimEvent } from '../../src/sim';
import { chanceDeAcerto } from '../../src/sim/combate/misseis';
import { alvo, criar, mundoLiso, ordenar, partida } from './mundo-teste';

const rodar = (sim: Sim, s: number, eventos?: SimEvent[]) => {
  for (let t = 0; t < Math.round(s * sim.tickHz); t++) {
    const novos = sim.step();
    eventos?.push(...novos);
  }
};
const custo = (id: string) => dados.custos.find((c) => c.id === id)!;
const arma = (id: string) => dados.armas.find((a) => a.id === id)!;
const muito = { fe: 5000, si: 5000, cu: 5000, li: 5000, ti: 5000, u: 500 };

/** Nave e Base de Lança-Mísseis da bra, com estoque e banco cheios. */
function base(sim: Sim) {
  const [, silo] = criar(sim, [
    { estrutura: 'ship', x: -30, z: 0 },
    { estrutura: 'missile_silo', x: 0, z: 0 },
  ]);
  ordenar(sim, 'debug_encher_banco', {});
  sim.step();
  Object.assign(sim.state.estoques.bra!, muito);
  return silo!;
}
const prontos = (sim: Sim, id: number) => getComponent(sim.state, id, 'lancador')!.prontos;

describe('T-059 — UNI-10, UNI-11, D-63: Base de Lança-Mísseis', () => {
  it('UNI-10: fabrica curtos e longos pela fila, até misseis_max_base somando prontos e fila', () => {
    const sim = partida(mundoLiso());
    const silo = base(sim);
    for (let k = 0; k < 3; k++) ordenar(sim, 'imprimir', { ids: [silo], item: 'missile_short' });
    for (let k = 0; k < 3; k++) ordenar(sim, 'imprimir', { ids: [silo], item: 'missile_long' });
    sim.step();
    expect(getComponent(sim.state, silo, 'producer')!.fila).toHaveLength(param('misseis_max_base'));
    rodar(sim, 3 * custo('missile_short').tempo_s + 2 * custo('missile_long').tempo_s + 5);
    expect(prontos(sim, silo)).toEqual([
      'missile_short',
      'missile_short',
      'missile_short',
      'missile_long',
      'missile_long',
    ]);
    ordenar(sim, 'imprimir', { ids: [silo], item: 'missile_short' });
    sim.step();
    expect(getComponent(sim.state, silo, 'producer')!.fila).toHaveLength(0);
  });

  it('UNI-10/UNI-11: lança o da frente no ponto (no escuro), espera a recarga e recusa fora do alcance', () => {
    const sim = partida(mundoLiso());
    const silo = base(sim);
    getComponent(sim.state, silo, 'lancador')!.prontos.push('missile_short', 'missile_long');
    // Um OPQ inimigo a 50 m, fora da visão da bra (no escuro): o curto o derruba.
    const [inimigo] = criar(
      sim,
      [{ unidade: 'hover_opq', x: 0, z: 50, postura: 'passiva' }],
      'usa',
    );
    const eventos: SimEvent[] = [];
    // Fora do alcance do curto: recusado, nada sai.
    ordenar(sim, 'lancar_missil', { ids: [silo], ...alvo(0, arma('missil_curto').alcance_m + 10) });
    rodar(sim, 0.1, eventos);
    expect(eventos.some((e) => e.tipo === 'missil_recusado')).toBe(true);
    expect(prontos(sim, silo)).toHaveLength(2);
    ordenar(sim, 'lancar_missil', { ids: [silo], ...alvo(0, 50) });
    sim.step();
    expect(prontos(sim, silo)).toEqual(['missile_long']);
    // Recarga: o segundo não sai logo.
    ordenar(sim, 'lancar_missil', { ids: [silo], ...alvo(0, 100) });
    sim.step();
    expect(prontos(sim, silo)).toEqual(['missile_long']);
    rodar(sim, 50 / arma('missil_curto').vel_projetil_m_s! + 1);
    expect(sim.state.entities.includes(inimigo!)).toBe(false);
    rodar(sim, arma('missil_curto').recarga_s!);
    ordenar(sim, 'lancar_missil', { ids: [silo], ...alvo(0, 100) });
    sim.step();
    expect(prontos(sim, silo)).toHaveLength(0);
  });

  it('UNI-11: o longo derruba uma estrutura (menos a Nave)', () => {
    const sim = partida(mundoLiso());
    const silo = base(sim);
    getComponent(sim.state, silo, 'lancador')!.prontos.push('missile_long', 'missile_long');
    const [armazem, nave] = criar(
      sim,
      [
        { estrutura: 'storage', x: 0, z: 200 },
        { estrutura: 'ship', x: -60, z: 200 },
      ],
      'usa',
    );
    ordenar(sim, 'lancar_missil', { ids: [silo], ...alvo(0, 200) });
    rodar(sim, 200 / arma('missil_longo').vel_projetil_m_s! + 1);
    expect(sim.state.entities.includes(armazem!)).toBe(false);
    rodar(sim, arma('missil_longo').recarga_s!);
    ordenar(sim, 'lancar_missil', { ids: [silo], ...alvo(-60, 200) });
    rodar(sim, 210 / arma('missil_longo').vel_projetil_m_s! + 1);
    expect(sim.state.entities.includes(nave!)).toBe(true);
    expect(getComponent(sim.state, nave!, 'vida')!.hp).toBeLessThan(
      getComponent(sim.state, nave!, 'vida')!.max,
    );
  });
});

describe('T-059 — UNI-12, D-64: Bateria Antiaérea', () => {
  it('UNI-12: chance de acerto cheia até a zona certeira, caindo em linha até a borda', () => {
    const alcance = arma('aa_missil').alcance_m;
    const centro = param('aa_acerto_centro_pct') / 100;
    const borda = param('aa_acerto_borda_pct') / 100;
    expect(chanceDeAcerto(0, alcance)).toBeCloseTo(centro, 9);
    expect(chanceDeAcerto((alcance * param('aa_zona_certeira_pct')) / 100, alcance)).toBeCloseTo(
      centro,
      9,
    );
    expect(chanceDeAcerto(alcance, alcance)).toBeCloseTo(borda, 9);
  });

  it('UNI-12: dispara contra mísseis inimigos em voo, um por vez', () => {
    const sim = partida(mundoLiso());
    criar(sim, [
      { estrutura: 'ship', x: -40, z: 0 },
      { estrutura: 'aa_battery', x: 0, z: 0 },
    ]);
    ordenar(sim, 'debug_encher_banco', {});
    const [, silo] = criar(
      sim,
      [
        { estrutura: 'ship', x: 0, z: 150 },
        { estrutura: 'missile_silo', x: 0, z: 55 },
      ],
      'usa',
    );
    getComponent(sim.state, silo!, 'lancador')!.prontos.push('missile_short');
    const eventos: SimEvent[] = [];
    ordenar(sim, 'lancar_missil', { ids: [silo], ...alvo(0, 2) }, 'usa');
    rodar(sim, 4, eventos);
    const tiros = eventos.filter(
      (e) => e.tipo === 'disparo' && (e.dados as { arma: string }).arma === 'aa_missil',
    );
    expect(tiros.length).toBeGreaterThan(0);
    const t = tiros.map((e) => e.tick);
    for (let k = 1; k < t.length; k++) {
      expect((t[k]! - t[k - 1]!) / sim.tickHz).toBeGreaterThanOrEqual(
        arma('aa_missil').recarga_s! - 1e-9,
      );
    }
  });

  it('UNI-12: derruba drones e ignora unidades de solo', () => {
    const sim = partida(mundoLiso());
    criar(sim, [
      { estrutura: 'ship', x: -40, z: 0 },
      { estrutura: 'aa_battery', x: 0, z: 0 },
    ]);
    ordenar(sim, 'debug_encher_banco', {});
    const [drone, ex1] = criar(
      sim,
      [
        { unidade: 'drone_laser', x: 0, z: 12, postura: 'passiva' },
        { unidade: 'hover_ex1', x: 8, z: 0, postura: 'passiva' },
      ],
      'usa',
    );
    const eventos: SimEvent[] = [];
    rodar(sim, 20, eventos);
    const alvos = eventos
      .filter((e) => e.tipo === 'disparo' && (e.dados as { arma: string }).arma === 'aa_missil')
      .map((e) => (e.dados as { alvo: number }).alvo);
    expect(alvos).not.toContain(ex1);
    expect(getComponent(sim.state, ex1!, 'vida')!.hp).toBe(
      getComponent(sim.state, ex1!, 'vida')!.max,
    );
    expect(sim.state.entities.includes(drone!)).toBe(false);
  });
});

describe('T-049 — UNI-13, D-65: Torre Magnética', () => {
  it('UNI-13: inimigo no campo fica mais lento e perde EN; blindado sofre menos; fora do campo, nada', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'mag_tower', x: 0, z: 0 }]);
    const [leve, blindada, longe] = criar(
      sim,
      [
        { unidade: 'hover_scout', x: 5, z: 0 },
        { unidade: 'hover_ex1', x: -5, z: 0, postura: 'passiva' },
        { unidade: 'hover_ex1', x: 0, z: param('mag_raio_m') + 3, postura: 'passiva' },
      ],
      'usa',
    );
    const en = (id: number) => getComponent(sim.state, id, 'bateria')!.en;
    const antes = [en(leve!), en(blindada!), en(longe!)];
    sim.step();
    const fLeve = getComponent(sim.state, leve!, 'lentidao')!.fator;
    const fBlindada = getComponent(sim.state, blindada!, 'lentidao')!.fator;
    expect(fLeve).toBeGreaterThan(0);
    expect(fLeve).toBeLessThanOrEqual(param('mag_lentidao_max_pct') / 100);
    expect(fBlindada).toBeCloseTo((fLeve * param('mag_fator_blindada_pct')) / 100, 3);
    expect(getComponent(sim.state, longe!, 'lentidao')).toBeUndefined();
    rodar(sim, 1);
    expect(en(leve!)).toBeLessThan(antes[0]!);
    expect(antes[0]! - en(leve!)).toBeGreaterThan(antes[1]! - en(blindada!));
    expect(en(longe!)).toBeCloseTo(antes[2]!, 6);
  });

  it('UNI-13: guarda até mag_banco_max_en, para de drenar cheia e repassa aos aliados', () => {
    const sim = partida(mundoLiso());
    const [torre] = criar(sim, [{ estrutura: 'mag_tower', x: 0, z: 0 }]);
    const [inimigo] = criar(sim, [{ unidade: 'hover_scout', x: 3, z: 0 }], 'usa');
    const mag = getComponent(sim.state, torre!, 'magnetico')!;
    mag.banco = param('mag_banco_max_en');
    const b = getComponent(sim.state, inimigo!, 'bateria')!;
    const antes = b.en;
    rodar(sim, 1);
    expect(b.en).toBeCloseTo(antes, 6);
    // Um aliado com bateria baixa no campo recebe do banco.
    const [aliado] = criar(sim, [{ unidade: 'hover_ex1', x: -4, z: 0, postura: 'passiva' }]);
    const ba = getComponent(sim.state, aliado!, 'bateria')!;
    ba.en = 10;
    ba.autoRecarga = false;
    rodar(sim, 1);
    expect(ba.en).toBeGreaterThan(10 + param('mag_repasse_en_s') * 0.9);
    expect(mag.banco).toBeLessThan(param('mag_banco_max_en'));
  });

  it('UNI-13 (D-72): repara as unidades próprias feridas no campo, as mais feridas primeiro', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'mag_tower', x: 0, z: 0 }]);
    const [a, b, fora] = criar(sim, [
      { unidade: 'hover_ex1', x: 4, z: 0, postura: 'passiva' },
      { unidade: 'hover_ex1', x: -4, z: 0, postura: 'passiva' },
      { unidade: 'hover_ex1', x: 0, z: param('mag_raio_m') + 4, postura: 'passiva' },
    ]);
    const vida = (id: number) => getComponent(sim.state, id, 'vida')!;
    for (const id of [a!, b!, fora!]) vida(id).hp = vida(id).max / 2;
    rodar(sim, 2);
    expect(vida(a!).hp).toBeCloseTo(vida(a!).max / 2 + 2 * param('mag_reparo_hp_s'), 0);
    expect(vida(b!).hp).toBeGreaterThan(vida(b!).max / 2);
    expect(vida(fora!).hp).toBeCloseTo(vida(fora!).max / 2, 6);
  });
});
