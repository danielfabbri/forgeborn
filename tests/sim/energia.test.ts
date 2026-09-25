import { describe, expect, it } from 'vitest';
import {
  dados,
  destroyEntity,
  getComponent,
  param,
  setComponent,
  type Sim,
  type SimEvent,
} from '../../src/sim';
import { estadoDaBateria, leituraDaRede } from '../../src/sim/energia';
import { statsEstrutura, statsMovel } from '../../src/sim/units/stats';
import { alvo, criar, mundoLiso, ordenar, partida, pos, semear } from './mundo-teste';

const rede = (sim: Sim, nacao: 'bra' | 'usa' = 'bra') => sim.state.energia[nacao]!;
const bateria = (sim: Sim, id: number) => getComponent(sim.state, id, 'bateria')!;
const recarga = (sim: Sim, id: number) => getComponent(sim.state, id, 'recarga')!;
const encherBanco = (sim: Sim) => {
  ordenar(sim, 'debug_encher_banco', {});
  sim.step();
};
function rodarAte(sim: Sim, condicao: () => boolean, limite_s: number, eventos?: SimEvent[]) {
  for (let t = 0; t < limite_s * sim.tickHz; t++) {
    if (condicao()) return true;
    const novos = sim.step();
    eventos?.push(...novos);
  }
  return condicao();
}

describe('T-040 — ENE-01 a ENE-05: rede de energia', () => {
  it('ENE-01/ENE-07: geração = Nave + solares × fator_solar + nucleares abastecidas', () => {
    for (const cenario of ['lua', 'marte'] as const) {
      const sim = partida(mundoLiso(), ['bra', 'usa'], cenario);
      sim.state.estoques.bra.u = 10;
      criar(sim, [
        { estrutura: 'ship', x: 0, z: 0 },
        { estrutura: 'solar_plant', x: 30, z: 0 },
        { estrutura: 'nuclear_plant', x: -30, z: 0 },
      ]);
      sim.step();
      const fator = dados.cenarios.find((c) => c.id === cenario)!.fator_solar;
      const esperado =
        statsEstrutura('ship').geracao_en_s +
        statsEstrutura('solar_plant').geracao_en_s * fator +
        statsEstrutura('nuclear_plant').geracao_en_s;
      expect(rede(sim).geracao).toBeCloseTo(esperado, 9);
    }
  });

  it('ENE-02: capacidade = Σ banco_en; com o banco cheio, o excedente se perde', () => {
    const sim = partida(mundoLiso());
    criar(sim, [
      { estrutura: 'ship', x: 0, z: 0 },
      { estrutura: 'solar_plant', x: 30, z: 0 },
    ]);
    const capacidade = statsEstrutura('ship').banco_en + statsEstrutura('solar_plant').banco_en;
    encherBanco(sim);
    expect(rede(sim).banco).toBe(capacidade);
    sim.run(100);
    expect(rede(sim).banco).toBe(capacidade);
    expect(leituraDaRede(sim.state, 'bra').capacidade).toBe(capacidade);
  });

  it('ENE-05: destruir uma estrutura reduz geração e capacidade na hora; o excedente se perde', () => {
    const sim = partida(mundoLiso());
    const [, solar] = criar(sim, [
      { estrutura: 'ship', x: 0, z: 0 },
      { estrutura: 'solar_plant', x: 30, z: 0 },
    ]);
    encherBanco(sim);
    destroyEntity(sim.state, solar!);
    sim.step();
    expect(rede(sim).banco).toBe(statsEstrutura('ship').banco_en);
    expect(rede(sim).geracao).toBe(statsEstrutura('ship').geracao_en_s);
  });

  /** Nave sozinha (5 EN/s), banco vazio, com consumidores pendurados nela. */
  function racionando(demandas: Array<[1 | 2 | 3, number]>) {
    const sim = partida(mundoLiso());
    const ids = criar(
      sim,
      demandas.map((_, k) => ({ estrutura: 'laser_tower' as const, x: 20 + k * 8, z: 20 })),
    );
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    rede(sim).banco = 0;
    demandas.forEach(([prioridade, demanda], k) =>
      setComponent(sim.state, ids[k]!, 'consumidor', {
        prioridade,
        demanda_en_s: demanda,
        atendido: 1,
        offline: false,
      }),
    );
    sim.step();
    const atendido = (k: number) => getComponent(sim.state, ids[k]!, 'consumidor')!;
    return { sim, atendido };
  }

  it('ENE-04: sem banco, defesas primeiro, depois satélites, depois impressão na Nave', () => {
    const { sim, atendido } = racionando([
      [3, 2],
      [2, 2],
      [1, 3],
    ]);
    expect(rede(sim).racionamento).toBe(true);
    expect(atendido(2).atendido).toBe(1); // defesa: 3 de 5
    expect(atendido(1).atendido).toBeCloseTo(1, 9); // satélite: 2 dos 2 restantes
    expect(atendido(0).atendido).toBeCloseTo(0, 9); // impressão: nada
    expect(leituraDaRede(sim.state, 'bra').indicador).toBe('vermelho');
  });

  it('ENE-04: satélite atendido em parte fica offline; consumidor parcial funciona proporcionalmente', () => {
    const { atendido } = racionando([
      [1, 4],
      [2, 2],
    ]);
    expect(atendido(0).atendido).toBe(1);
    expect(atendido(1).atendido).toBeCloseTo(0.5, 9);
    expect(atendido(1).offline).toBe(true);
  });

  it('ENE-04: sem banco, as portas dividem igualmente o que sobra entre as unidades acopladas', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const unidades = criar(sim, [
      { unidade: 'hover_ex1', x: 14, z: -2 },
      { unidade: 'hover_ex1', x: 14, z: 2 },
    ]);
    for (const u of unidades) bateria(sim, u).en = 10;
    ordenar(sim, 'recarregar', { ids: unidades });
    expect(
      rodarAte(sim, () => unidades.every((u) => recarga(sim, u).estado === 'acoplada'), 10),
    ).toBe(true);
    rede(sim).banco = 0;
    const antes = unidades.map((u) => bateria(sim, u).en);
    sim.step();
    const ganho = unidades.map((u, k) => bateria(sim, u).en - antes[k]!);
    const porUnidade = statsEstrutura('ship').geracao_en_s / sim.tickHz / 2;
    for (const g of ganho) expect(g).toBeCloseTo(porUnidade, 9);
  });
});

describe('ENE-22: leitura da rede', () => {
  it('ENE-22: verde com saldo ≥ 0; amarelo com saldo < 0 e banco > 25%; vermelho com banco ≤ 25%', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    encherBanco(sim);
    sim.run(sim.tickHz);
    expect(leituraDaRede(sim.state, 'bra')).toMatchObject({
      geracao: statsEstrutura('ship').geracao_en_s,
      consumo: 0,
      indicador: 'verde',
    });
    // Uma porta puxando taxa_porta_en_s (> geração da Nave) deixa o saldo negativo.
    const [u] = criar(sim, [{ unidade: 'mobile_battery', x: 14, z: 0 }]);
    bateria(sim, u!).en = 0;
    ordenar(sim, 'recarregar', { ids: [u] });
    // Consumo médio dos últimos 10 s: espera a janela inteira com a porta ativa.
    sim.run(11 * sim.tickHz);
    const leitura = leituraDaRede(sim.state, 'bra');
    expect(leitura.consumo).toBeCloseTo(statsEstrutura('ship').taxa_porta_en_s, 6);
    expect(leitura.indicador).toBe('amarelo');
    rede(sim).banco = 0.25 * leitura.capacidade;
    sim.step();
    expect(leituraDaRede(sim.state, 'bra').indicador).toBe('vermelho');
  });
});

describe('T-041 — ENE-08 a ENE-11: baterias e estados', () => {
  it('ENE-08: sai cheia; a Bateria Móvel sai com bateria_movel_carga_inicial_pct%', () => {
    const sim = partida(mundoLiso());
    const [ex1, bm] = criar(sim, [
      { unidade: 'hover_ex1', x: 0, z: 0 },
      { unidade: 'mobile_battery', x: 10, z: 0 },
    ]);
    expect(bateria(sim, ex1!).en).toBe(statsMovel('hover_ex1').bateria_en);
    expect(bateria(sim, bm!).en).toBeCloseTo(
      (statsMovel('mobile_battery').bateria_en * param('bateria_movel_carga_inicial_pct')) / 100,
      9,
    );
  });

  it('ENE-09/ENE-10: mover gasta mov_en_s por segundo; parado no solo gasta 0', () => {
    const sim = partida(mundoLiso());
    const [u] = criar(sim, [{ unidade: 'hover_opq', x: 0, z: -60 }]);
    const cheia = bateria(sim, u!).en;
    sim.run(40);
    expect(bateria(sim, u!).en).toBe(cheia);
    ordenar(sim, 'mover', { ids: [u], ...alvo(0, 60) });
    sim.step();
    sim.run(5 * sim.tickHz);
    expect(cheia - bateria(sim, u!).en).toBeCloseTo(statsMovel('hover_opq').mov_en_s * 5, 1);
  });

  it('ENE-09: drone parado no ar paga pairar_en_s; pousado, 0', () => {
    const sim = partida(mundoLiso());
    const [d] = criar(sim, [{ unidade: 'drone_laser', x: 0, z: 0 }]);
    const inicio = bateria(sim, d!).en;
    sim.run(2 * sim.tickHz);
    expect(inicio - bateria(sim, d!).en).toBeCloseTo(statsMovel('drone_laser').pairar_en_s * 2, 2);
    sim.run(Math.round((param('pouso_automatico_s') + param('tempo_pouso_s')) * sim.tickHz) + 5);
    expect(getComponent(sim.state, d!, 'air')!.estado).toBe('pousado');
    const pousado = bateria(sim, d!).en;
    sim.run(40);
    expect(bateria(sim, d!).en).toBe(pousado);
  });

  it('ENE-10: minerar gasta en_minerar_s', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [j] = semear(sim, [{ recurso: 'fe', quantidade: 1000, x: 30, z: 0 }]);
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 25, z: -6 }]);
    ordenar(sim, 'coletar', { ids: [h], jazida: j });
    expect(
      rodarAte(sim, () => getComponent(sim.state, h!, 'coleta')!.estado === 'minerando', 20),
    ).toBe(true);
    // Mede com o hover já parado na vaga: enquanto freia, ele paga o movimento (ENE-09).
    rodarAte(sim, () => getComponent(sim.state, h!, 'locomotion')!.speed === 0, 5);
    const antes = bateria(sim, h!).en;
    sim.run(10);
    expect(getComponent(sim.state, h!, 'coleta')!.estado).toBe('minerando');
    expect(antes - bateria(sim, h!).en).toBeCloseTo((param('en_minerar_s') * 10) / sim.tickHz, 9);
  });

  it('ENE-11: estados Normal, Baixa e Reserva; na Reserva anda a modo_reserva_vel_pct% e não minera', () => {
    const b = { en: 100, max: 100 };
    expect(estadoDaBateria(b)).toBe('normal');
    expect(estadoDaBateria({ en: param('limiar_bateria_baixa_pct'), max: 100 })).toBe('baixa');
    expect(estadoDaBateria({ en: 0, max: 100 })).toBe('reserva');

    const sim = partida(mundoLiso());
    const [u] = criar(sim, [{ unidade: 'hover_scout', x: 0, z: -60 }]);
    bateria(sim, u!).en = 0;
    bateria(sim, u!).autoRecarga = false;
    ordenar(sim, 'mover', { ids: [u], ...alvo(0, 60) });
    sim.run(3 * sim.tickHz);
    const vel = getComponent(sim.state, u!, 'locomotion')!.speed;
    expect(vel).toBeCloseTo(
      (statsMovel('hover_scout').vel_m_s * param('modo_reserva_vel_pct')) / 100,
      6,
    );

    const sim2 = partida(mundoLiso());
    criar(sim2, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [j] = semear(sim2, [{ recurso: 'fe', quantidade: 1000, x: 30, z: 0 }]);
    const [h] = criar(sim2, [{ unidade: 'hover_explorer', x: 25, z: -6 }]);
    bateria(sim2, h!).autoRecarga = false;
    ordenar(sim2, 'coletar', { ids: [h], jazida: j });
    rodarAte(sim2, () => getComponent(sim2.state, h!, 'coleta')!.estado === 'minerando', 20);
    bateria(sim2, h!).en = 0;
    const carga = getComponent(sim2.state, h!, 'coleta')!.carga;
    sim2.run(40);
    expect(getComponent(sim2.state, h!, 'coleta')!.carga).toBe(carga);
  });

  it('D-28: drone em voo que chega a 0 EN pousa onde está e só decola com energia', () => {
    const sim = partida(mundoLiso());
    const [d] = criar(sim, [{ unidade: 'drone_laser', x: 0, z: 0 }]);
    bateria(sim, d!).autoRecarga = false;
    ordenar(sim, 'mover', { ids: [d], ...alvo(0, 80) });
    sim.run(20);
    bateria(sim, d!).en = 0;
    sim.run(Math.round(param('tempo_pouso_s') * sim.tickHz) + 3);
    expect(getComponent(sim.state, d!, 'air')!.estado).toBe('pousado');
    const onde = pos(sim, d!);
    sim.run(40);
    expect(pos(sim, d!).z).toBeCloseTo(onde.z, 6);
    bateria(sim, d!).en = 50;
    sim.run(2);
    expect(getComponent(sim.state, d!, 'air')!.estado).toBe('decolando');
  });
});

describe('T-042 — ENE-12 a ENE-14: portas de recarga', () => {
  it('ENE-12/ENE-13: 1 unidade por porta; fila por ordem de chegada', () => {
    const sim = partida(mundoLiso());
    const [solar] = criar(sim, [{ estrutura: 'solar_plant', x: 0, z: 0 }]);
    encherBanco(sim);
    const [a, b] = criar(sim, [
      { unidade: 'hover_scout', x: 8, z: 0 },
      { unidade: 'hover_scout', x: 16, z: 0 },
    ]);
    for (const u of [a, b]) bateria(sim, u!).en = 20;
    ordenar(sim, 'recarregar', { ids: [a, b] });
    expect(rodarAte(sim, () => recarga(sim, b!).estado === 'fila', 10)).toBe(true);
    expect(getComponent(sim.state, solar!, 'portas')!.ocupantes).toEqual([a]);
    expect(rodarAte(sim, () => recarga(sim, b!).estado === 'acoplada', 60)).toBe(true);
    expect(bateria(sim, a!).en).toBe(bateria(sim, a!).max);
  });

  it('ENE-13: escolhe o menor tempo estimado (deslocamento + fila)', () => {
    const sim = partida(mundoLiso());
    const [solar, nave] = criar(sim, [
      { estrutura: 'solar_plant', x: 0, z: 0 },
      { estrutura: 'ship', x: 0, z: 60 },
    ]);
    encherBanco(sim);
    // A porta da solar está ocupada por quem precisa de muita energia.
    const [gulosa] = criar(sim, [{ unidade: 'mobile_battery', x: 7, z: 0 }]);
    bateria(sim, gulosa!).en = 0;
    ordenar(sim, 'recarregar', { ids: [gulosa] });
    expect(rodarAte(sim, () => recarga(sim, gulosa!).estado === 'acoplada', 10)).toBe(true);
    const [u] = criar(sim, [{ unidade: 'hover_scout', x: 10, z: 5 }]);
    bateria(sim, u!).en = 10;
    ordenar(sim, 'recarregar', { ids: [u] });
    sim.step();
    expect(recarga(sim, u!).estrutura).toBe(nave);
    expect(recarga(sim, u!).estrutura).not.toBe(solar);
  });

  it('ENE-12: a recarga tira energia do banco', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    encherBanco(sim);
    const [u] = criar(sim, [{ unidade: 'hover_opq', x: 14, z: 0 }]);
    bateria(sim, u!).en = 20;
    ordenar(sim, 'recarregar', { ids: [u] });
    expect(rodarAte(sim, () => recarga(sim, u!).estado === 'acoplada', 10)).toBe(true);
    const banco = rede(sim).banco;
    const en = bateria(sim, u!).en;
    sim.step();
    const recebido = bateria(sim, u!).en - en;
    expect(recebido).toBeCloseTo(statsEstrutura('ship').taxa_porta_en_s / sim.tickHz, 9);
    // A geração do tick cobre parte; o resto sai do banco.
    const geracaoDoTick = statsEstrutura('ship').geracao_en_s / sim.tickHz;
    expect(banco - rede(sim).banco).toBeCloseTo(recebido - geracaoDoTick, 9);
  });

  it('ENE-14: desacopla com 100% ou ao receber outra ordem', () => {
    const sim = partida(mundoLiso());
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    encherBanco(sim);
    const [u] = criar(sim, [{ unidade: 'hover_opq', x: 14, z: 0 }]);
    bateria(sim, u!).en = 20;
    ordenar(sim, 'recarregar', { ids: [u] });
    expect(rodarAte(sim, () => recarga(sim, u!).estado === 'acoplada', 10)).toBe(true);
    ordenar(sim, 'mover', { ids: [u], ...alvo(40, 0) });
    sim.step();
    expect(recarga(sim, u!).estado).toBe('nenhuma');
    expect(getComponent(sim.state, nave!, 'portas')!.ocupantes).toEqual([null, null]);
  });
});

describe('T-043 — ENE-15, ENE-16, D-28: auto-recarga', () => {
  it('ENE-15: cada papel sai no próprio limiar auto_recarga_*', () => {
    const casos = [
      ['hover_scout', 'auto_recarga_trabalhador_pct'],
      ['hover_ex1', 'auto_recarga_militar_pct'],
      ['drone_laser', 'auto_recarga_drone_pct'],
      ['printer', 'auto_recarga_impressora_pct'],
      ['mobile_battery', 'auto_recarga_bateria_movel_pct'],
    ] as const;
    for (const [tipo, chave] of casos) {
      const sim = partida(mundoLiso());
      criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
      const [u] = criar(sim, [{ unidade: tipo, x: 40, z: 0 }]);
      const b = bateria(sim, u!);
      b.en = (b.max * (param(chave) + 1)) / 100;
      sim.step();
      expect(recarga(sim, u!).estado, tipo).toBe('nenhuma');
      b.en = (b.max * param(chave)) / 100;
      sim.step();
      expect(recarga(sim, u!).estado, tipo).toBe('indo');
    }
  });

  it('D-28: depois da auto-recarga, o militar volta ao lugar de onde saiu', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    encherBanco(sim);
    const [u] = criar(sim, [{ unidade: 'hover_ex1', x: 40, z: 10 }]);
    bateria(sim, u!).en = (bateria(sim, u!).max * param('auto_recarga_militar_pct')) / 100;
    expect(rodarAte(sim, () => recarga(sim, u!).estado === 'acoplada', 15)).toBe(true);
    expect(rodarAte(sim, () => recarga(sim, u!).estado === 'nenhuma', 60)).toBe(true);
    sim.run(15 * sim.tickHz);
    const p = pos(sim, u!);
    expect(Math.hypot(p.x - 40, p.z - 10)).toBeLessThan(1);
  });

  it('D-28: depois da auto-recarga, o hover volta à coleta', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    encherBanco(sim);
    const [j] = semear(sim, [{ recurso: 'fe', quantidade: 5000, x: 30, z: 0 }]);
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 25, z: -6 }]);
    ordenar(sim, 'coletar', { ids: [h], jazida: j });
    sim.step();
    bateria(sim, h!).en = (bateria(sim, h!).max * param('auto_recarga_trabalhador_pct')) / 100;
    expect(rodarAte(sim, () => recarga(sim, h!).estado === 'acoplada', 20)).toBe(true);
    expect(rodarAte(sim, () => recarga(sim, h!).estado === 'nenhuma', 60)).toBe(true);
    expect(
      rodarAte(sim, () => getComponent(sim.state, h!, 'coleta')!.estado === 'minerando', 30),
    ).toBe(true);
    expect(getComponent(sim.state, h!, 'coleta')!.jazida).toBe(j);
  });

  it('ENE-15: a auto-recarga pode ser desligada por unidade', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [u] = criar(sim, [{ unidade: 'hover_ex1', x: 40, z: 0 }]);
    ordenar(sim, 'auto_recarga', { ids: [u], ligada: false });
    sim.step();
    bateria(sim, u!).en = 1;
    sim.run(5);
    expect(recarga(sim, u!).estado).toBe('nenhuma');
  });
});

describe('T-044 — ENE-06, ENE-07: usinas', () => {
  it('ENE-06: a nuclear consome nuclear_consumo_u a cada nuclear_intervalo_s, mesmo com o banco cheio', () => {
    const sim = partida(mundoLiso());
    sim.state.estoques.bra.u = 10;
    criar(sim, [{ estrutura: 'nuclear_plant', x: 0, z: 0 }]);
    encherBanco(sim);
    const inicio = sim.state.estoques.bra.u;
    sim.run(Math.round(param('nuclear_intervalo_s') * 2 * sim.tickHz));
    expect(inicio - sim.state.estoques.bra.u).toBe(2 * param('nuclear_consumo_u'));
  });

  it('ENE-06: sem Urânio gera 0 e dispara AL-10; desligar e religar leva nuclear_religar_s', () => {
    const sim = partida(mundoLiso());
    sim.state.estoques.bra.u = 1;
    const [usina] = criar(sim, [{ estrutura: 'nuclear_plant', x: 0, z: 0 }]);
    const eventos: SimEvent[] = [];
    expect(rodarAte(sim, () => rede(sim).geracao === 0, 30, eventos)).toBe(true);
    expect(eventos.filter((e) => e.tipo === 'alerta')).toEqual([
      expect.objectContaining({
        dados: expect.objectContaining({ id: 'AL-10', nacao: 'bra', usina }),
      }),
    ]);
    sim.state.estoques.bra.u = 5;
    sim.step();
    expect(rede(sim).geracao).toBe(statsEstrutura('nuclear_plant').geracao_en_s);
    ordenar(sim, 'ligar_usina', { ids: [usina] });
    sim.step();
    expect(rede(sim).geracao).toBe(0);
    ordenar(sim, 'ligar_usina', { ids: [usina] });
    sim.run(Math.round(param('nuclear_religar_s') * sim.tickHz));
    expect(rede(sim).geracao).toBe(0);
    sim.run(2);
    expect(rede(sim).geracao).toBe(statsEstrutura('nuclear_plant').geracao_en_s);
  });
});

describe('T-045 — ENE-17 a ENE-20: Bateria Móvel', () => {
  it('ENE-18: até bateria_movel_max_alvos alvos, a bateria_movel_taxa_por_alvo_en_s, menor % primeiro', () => {
    const sim = partida(mundoLiso());
    const [bm] = criar(sim, [{ unidade: 'mobile_battery', x: 0, z: 0 }]);
    bateria(sim, bm!).en = bateria(sim, bm!).max;
    const alvos = criar(
      sim,
      [30, 10, 50, 20, 40, 95].map((pct, k) => ({
        unidade: 'hover_ex1' as const,
        x: 4,
        z: -6 + k * 2.6,
        pct,
      })),
    );
    const pcts = [30, 10, 50, 20, 40, 95];
    alvos.forEach((a, k) => {
      const b = bateria(sim, a);
      b.en = (b.max * pcts[k]!) / 100;
      b.autoRecarga = false;
    });
    const antes = alvos.map((a) => bateria(sim, a).en);
    sim.step();
    const ganho = alvos.map((a, k) => bateria(sim, a).en - antes[k]!);
    const taxa = param('bateria_movel_taxa_por_alvo_en_s') / sim.tickHz;
    // Os 4 de menor %: 10, 20, 30, 40. O de 50% espera; o de 95% está acima do limiar.
    expect(ganho.map((g) => (g > 1e-9 ? 1 : 0))).toEqual([1, 1, 0, 1, 1, 0]);
    for (const g of ganho) if (g > 1e-9) expect(g).toBeCloseTo(taxa, 9);
  });

  it('ENE-19/ENE-20: quem recebe não procura porta; em auto_recarga_bateria_movel_pct ela vai recarregar', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [bm] = criar(sim, [{ unidade: 'mobile_battery', x: 40, z: 0 }]);
    bateria(sim, bm!).en = bateria(sim, bm!).max;
    const [u] = criar(sim, [{ unidade: 'hover_ex1', x: 44, z: 0 }]);
    bateria(sim, u!).en = 1;
    sim.run(5);
    expect(recarga(sim, u!).estado).toBe('nenhuma');
    expect(bateria(sim, u!).en).toBeGreaterThan(1);
    bateria(sim, bm!).en = (bateria(sim, bm!).max * param('auto_recarga_bateria_movel_pct')) / 100;
    sim.step();
    expect(recarga(sim, bm!).estado).toBe('indo');
    sim.step();
    expect(getComponent(sim.state, bm!, 'suporte')!.alvos).toEqual([]);
  });
});
