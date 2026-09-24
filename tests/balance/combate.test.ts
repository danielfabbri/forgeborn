import { describe, expect, it } from 'vitest';
import { getComponent, type EntityId, type Sim } from '../../src/sim';
import type { MoveisId } from '../../src/sim/data';
import { alvo, criar, mundoLiso, ordenar, partida, type Criacao } from '../sim/mundo-teste';

const vivos = (sim: Sim, ids: EntityId[]) => ids.filter((id) => sim.state.entities.includes(id));
const hpTotal = (sim: Sim, ids: EntityId[]) =>
  vivos(sim, ids).reduce((s, id) => s + getComponent(sim.state, id, 'vida')!.hp, 0);
const hpMax = (sim: Sim, ids: EntityId[]) =>
  ids.reduce((s, id) => s + getComponent(sim.state, id, 'vida')!.max, 0);

/** Linha de `n` unidades em x, centrada, na altura z. */
function linha(tipo: MoveisId, n: number, z: number, espaco = 3): Criacao[] {
  return Array.from({ length: n }, (_, k) => ({
    unidade: tipo,
    x: (k - (n - 1) / 2) * espaco,
    z,
  }));
}

interface Resultado {
  vencedor: 'bra' | 'usa' | null;
  /** Fração do HP total do vencedor que sobrou. */
  restante: number;
  perdas: number;
  segundos: number;
}

/** Batalha em campo aberto até um lado acabar (ou `limite_s`). */
function batalha(
  bra: Criacao[],
  usa: Criacao[],
  limite_s = 180,
  preparar?: (sim: Sim, a: EntityId[], b: EntityId[]) => void,
): Resultado {
  const sim = partida(mundoLiso());
  const a = criar(sim, bra);
  const b = criar(sim, usa, 'usa');
  // Os dois lados avançam um contra o outro (ataque-movimento, CMB-14).
  const zDe = (lista: Criacao[]) => ('z' in lista[0]! ? lista[0].z : 0);
  ordenar(sim, 'atacar_mover', { ids: a, ...alvo(0, zDe(usa)) });
  ordenar(sim, 'atacar_mover', { ids: b, ...alvo(0, zDe(bra)) }, 'usa');
  preparar?.(sim, a, b);
  const maxA = hpMax(sim, a);
  const maxB = hpMax(sim, b);
  let t = 0;
  for (; t < limite_s * sim.tickHz; t++) {
    if (vivos(sim, a).length === 0 || vivos(sim, b).length === 0) break;
    sim.step();
  }
  const [va, vb] = [vivos(sim, a).length, vivos(sim, b).length];
  const vencedor = va > 0 && vb === 0 ? 'bra' : vb > 0 && va === 0 ? 'usa' : null;
  return {
    vencedor,
    restante:
      vencedor === 'bra' ? hpTotal(sim, a) / maxA : vencedor === 'usa' ? hpTotal(sim, b) / maxB : 0,
    perdas: vencedor === 'bra' ? a.length - va : vencedor === 'usa' ? b.length - vb : 0,
    segundos: t / sim.tickHz,
  };
}

describe('§21.3 — invariantes de combate', () => {
  it('INV-03: 4 OPQ vencem 6 EX1 (mesmo VR) a 25 m, com 20%–60% do HP total restante', () => {
    const r = batalha(linha('hover_opq', 4, 0), linha('hover_ex1', 6, 25));
    expect(r.vencedor).toBe('bra');
    expect(r.restante).toBeGreaterThanOrEqual(0.2);
    expect(r.restante).toBeLessThanOrEqual(0.6);
  });

  it('INV-04: 6 EX1 vencem 4 Drones Laser (mesmo VR) com 40%–80% do HP total restante', () => {
    const r = batalha(linha('hover_ex1', 6, 0), linha('drone_laser', 4, 20));
    expect(r.vencedor).toBe('bra');
    expect(r.restante).toBeGreaterThanOrEqual(0.4);
    expect(r.restante).toBeLessThanOrEqual(0.8);
  });

  it('INV-05: 4 Drones Laser vencem 4 OPQ sem perdas', () => {
    const r = batalha(linha('drone_laser', 4, 0), linha('hover_opq', 4, 20));
    expect(r.vencedor).toBe('bra');
    expect(r.perdas).toBe(0);
  });

  /** Torre com a rede cheia e uma Nave longe (a defesa da Nave fora do alcance). */
  function comTorre(sim: Sim): void {
    criar(sim, [{ estrutura: 'ship', x: 0, z: -90 }], 'usa');
    ordenar(sim, 'debug_encher_banco', {}, 'usa');
    sim.step();
  }
  const torre: Criacao[] = [{ estrutura: 'laser_tower', x: 0, z: 30 }];

  it('INV-06: 1 Torre vence 1 EX1; 3 EX1 destroem 1 Torre com pelo menos 1 sobrevivente', () => {
    const um = batalha(linha('hover_ex1', 1, 0), torre, 120, (sim) => comTorre(sim));
    expect(um.vencedor).toBe('usa');
    const tres = batalha(linha('hover_ex1', 3, 0), torre, 120, (sim) => comTorre(sim));
    expect(tres.vencedor).toBe('bra');
    expect(3 - tres.perdas).toBeGreaterThanOrEqual(1);
  });

  it('INV-07: 3 Bombardeiros destroem 1 Torre sem perdas; 2 Drones Laser perdem para 1 Torre', () => {
    const bombas = batalha(linha('drone_bomber', 3, 0), torre, 120, (sim) => comTorre(sim));
    expect(bombas.vencedor).toBe('bra');
    expect(bombas.perdas).toBe(0);
    const lasers = batalha(linha('drone_laser', 2, 0), torre, 120, (sim) => comTorre(sim));
    expect(lasers.vencedor).toBe('usa');
  });

  it('INV-08: 1 mina (dano cheio) destrói 1 EX1 com HP cheio; 1 OPQ com HP cheio sobrevive', () => {
    for (const [tipo, sobrevive] of [
      ['hover_ex1', false],
      ['hover_opq', true],
    ] as const) {
      const sim = partida(mundoLiso());
      criar(sim, [{ mina: true, x: 0, z: 0 }]);
      const mina = sim.state.entities.find((id) => getComponent(sim.state, id, 'mine'))!;
      getComponent(sim.state, mina, 'mine')!.armada = true;
      const [u] = criar(sim, [{ unidade: tipo, x: 0, z: 0.1, postura: 'passiva' }], 'usa');
      sim.run(5);
      expect(sim.state.entities.includes(mina), tipo).toBe(false);
      expect(sim.state.entities.includes(u!), tipo).toBe(sobrevive);
    }
  });

  it('INV-11: EX1 contra EX1 (1 contra 1): tempo de abate entre 10 s e 20 s', () => {
    const r = batalha(linha('hover_ex1', 1, 0), linha('hover_ex1', 1, 8), 60);
    expect(r.segundos).toBeGreaterThanOrEqual(10);
    expect(r.segundos).toBeLessThanOrEqual(20);
  });

  it('INV-13: um OPQ no alcance máximo destrói 1 Torre sem sofrer dano', () => {
    let opq: EntityId | null = null;
    let alvo: EntityId | null = null;
    const r = batalha(linha('hover_opq', 1, 0), torre, 120, (sim, a, b) => {
      comTorre(sim);
      opq = a[0]!;
      alvo = b[0]!;
      ordenar(sim, 'atacar', { ids: [opq], alvo });
    });
    expect(r.vencedor).toBe('bra');
    expect(r.restante).toBe(1);
    expect(opq).not.toBeNull();
  });
});
