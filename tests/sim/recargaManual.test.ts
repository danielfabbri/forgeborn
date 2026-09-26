import { describe, expect, it } from 'vitest';
import { getComponent, param, type Sim } from '../../src/sim';
import { criar, mundoLiso, ordenar, partida } from './mundo-teste';

const rodar = (sim: Sim, s: number) => {
  for (let t = 0; t < Math.round(s * sim.tickHz); t++) sim.step();
};

describe('D-50 — CTL-07: recarregar pelo clique direito numa estrutura', () => {
  it('D-50: a unidade com meia bateria vai à estrutura escolhida e sai com 100%', () => {
    const sim = partida(mundoLiso());
    // A Nave está mais perto; o jogador escolhe a Usina Solar.
    const [nave, usina] = criar(sim, [
      { estrutura: 'ship', x: 0, z: 20 },
      { estrutura: 'solar_plant', x: 40, z: -10 },
    ]);
    ordenar(sim, 'debug_encher_banco', {});
    const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    const bateria = getComponent(sim.state, ex1!, 'bateria')!;
    bateria.en = bateria.max * 0.6;
    ordenar(sim, 'recarregar', { ids: [ex1], estrutura: usina });
    sim.step();
    expect(getComponent(sim.state, ex1!, 'recarga')!.estrutura).toBe(usina);
    let acoplou = false;
    for (let s = 0; s < 120 && bateria.en < bateria.max - 1e-6; s++) {
      rodar(sim, 1);
      acoplou ||= getComponent(sim.state, ex1!, 'recarga')!.estado === 'acoplada';
    }
    expect(acoplou).toBe(true);
    expect(bateria.en).toBeCloseTo(bateria.max, 3);
    expect(getComponent(sim.state, ex1!, 'recarga')!.estrutura).not.toBe(nave);
  });

  it('D-50: estrutura de outra nação ou sem portas é ignorada (vale a de menor tempo)', () => {
    const sim = partida(mundoLiso());
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 20 }]);
    const [torre] = criar(sim, [{ estrutura: 'laser_tower', x: 30, z: 0 }]);
    const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0 }]);
    ordenar(sim, 'recarregar', { ids: [ex1], estrutura: torre });
    sim.step();
    expect(getComponent(sim.state, ex1!, 'recarga')!.estrutura).toBe(nave);
  });
});

describe('T-047 — CTL-07, ENE-18, D-57: recarregar na Bateria Móvel pelo clique direito', () => {
  it('D-57: a unidade com meia bateria (acima do limiar do suporte) vai à Bateria Móvel e enche', () => {
    const sim = partida(mundoLiso());
    const [movel, ex1] = criar(sim, [
      { unidade: 'mobile_battery', x: 40, z: 0 },
      { unidade: 'hover_ex1', x: 0, z: 0, postura: 'passiva' },
    ]);
    const bateria = getComponent(sim.state, ex1!, 'bateria')!;
    bateria.en = bateria.max * 0.6;
    getComponent(sim.state, movel!, 'bateria')!.en = getComponent(
      sim.state,
      movel!,
      'bateria',
    )!.max;
    // Sem o comando, o suporte não atende quem está acima do limiar.
    rodar(sim, 2);
    expect(bateria.en).toBeLessThan(bateria.max * 0.6 + 1e-6);
    ordenar(sim, 'recarregar_na_bateria', { ids: [ex1], bateria: movel });
    for (let s = 0; s < 120 && bateria.en < bateria.max - 1e-6; s++) rodar(sim, 1);
    expect(bateria.en).toBeCloseTo(bateria.max, 3);
    rodar(sim, 0.2);
    expect(getComponent(sim.state, ex1!, 'seguirBateria')).toBeUndefined();
  });

  it('D-57: outra ordem cancela; Bateria Móvel inimiga é ignorada', () => {
    const sim = partida(mundoLiso());
    const [ex1] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0, postura: 'passiva' }]);
    const [inimiga] = criar(sim, [{ unidade: 'mobile_battery', x: 40, z: 0 }], 'usa');
    ordenar(sim, 'recarregar_na_bateria', { ids: [ex1], bateria: inimiga });
    sim.step();
    expect(getComponent(sim.state, ex1!, 'seguirBateria')).toBeUndefined();
    const [movel] = criar(sim, [{ unidade: 'mobile_battery', x: -40, z: 0 }]);
    getComponent(sim.state, ex1!, 'bateria')!.en = 10;
    ordenar(sim, 'recarregar_na_bateria', { ids: [ex1], bateria: movel });
    sim.step();
    expect(getComponent(sim.state, ex1!, 'seguirBateria')).toBeDefined();
    ordenar(sim, 'parar', { ids: [ex1] });
    rodar(sim, 0.2);
    expect(getComponent(sim.state, ex1!, 'seguirBateria')).toBeUndefined();
  });
});

describe('T-048 — ENE-18, ENE-23, D-59: Bateria Móvel encostada e carregar unidade', () => {
  it('ENE-18 (D-71): unidade fora do raio (casco a casco) não recebe', () => {
    const sim = partida(mundoLiso());
    const [movel, ex1] = criar(sim, [
      { unidade: 'mobile_battery', x: 0, z: 0 },
      { unidade: 'hover_ex1', x: param('bateria_movel_raio_m') + 6, z: 0, postura: 'passiva' },
    ]);
    getComponent(sim.state, movel!, 'bateria')!.en = getComponent(
      sim.state,
      movel!,
      'bateria',
    )!.max;
    const b = getComponent(sim.state, ex1!, 'bateria')!;
    b.en = b.max * 0.2;
    b.autoRecarga = false;
    const antes = b.en;
    rodar(sim, 2);
    expect(b.en).toBeLessThanOrEqual(antes + 1e-9);
  });

  it('ENE-23 (D-59): a Bateria Móvel mandada a uma unidade vai até ela, enche até 100% e para', () => {
    const sim = partida(mundoLiso());
    const [movel, ex1] = criar(sim, [
      { unidade: 'mobile_battery', x: 0, z: 0 },
      { unidade: 'hover_ex1', x: 30, z: 0, postura: 'passiva' },
    ]);
    expect(getComponent(sim.state, movel!, 'bateria')!.max).toBe(2000);
    getComponent(sim.state, movel!, 'bateria')!.en = 2000;
    const b = getComponent(sim.state, ex1!, 'bateria')!;
    b.en = b.max * 0.95;
    b.autoRecarga = false;
    ordenar(sim, 'carregar_unidade', { ids: [movel], alvo: ex1 });
    for (let s = 0; s < 60 && b.en < b.max - 1e-6; s++) rodar(sim, 1);
    expect(b.en).toBeCloseTo(b.max, 3);
    rodar(sim, 0.2);
    expect(getComponent(sim.state, movel!, 'suporte')!.atender ?? null).toBeNull();
    expect(getComponent(sim.state, movel!, 'order')!.tipo).toBe('nenhuma');
  });
});
