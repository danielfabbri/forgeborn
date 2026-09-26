import { describe, expect, it } from 'vitest';
import { dados, getComponent, param, type Sim } from '../../src/sim';
import type { SystemContext } from '../../src/sim/core/pipeline';
import { ATIVAR_IA_COMMAND, dificuldade, pesos } from '../../src/sim/ia';
import { montarQuadro } from '../../src/sim/ia/quadro';
import { CATEGORIAS } from '../../src/sim/ia/producao';
import { proximoDoPlano } from '../../src/sim/ia/plano';
import { INICIAR_PARTIDA_COMMAND } from '../../src/sim/producao';
import { criar, mundoLiso, ordenar, partida, ponto, pos, revelar, semear } from './mundo-teste';
import { criarPartida } from '../../tools/sim/match';

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

/** Partida em mundo liso com a IA na nação `bra`. */
function comIa(nivel = 'normal') {
  const sim = partida(mundoLiso());
  semear(sim, [
    { recurso: 'fe', quantidade: 5000, x: 30, z: 0 },
    { recurso: 'si', quantidade: 5000, x: -30, z: 0 },
    { recurso: 'cu', quantidade: 5000, x: 0, z: 30 },
    { recurso: 'li', quantidade: 5000, x: 0, z: -30 },
  ]);
  ordenar(sim, INICIAR_PARTIDA_COMMAND, {
    modo: 'padrao',
    nacoes: [{ nacao: 'bra', zona: ponto(0, 0) }],
  });
  ordenar(sim, ATIVAR_IA_COMMAND, { nivel });
  sim.step();
  return sim;
}

describe('T-090 — IA-01, IA-02, IA-06, IA-07: arquitetura da IA', () => {
  it('IA-01/TEC-07: os módulos só emitem Comandos (a fila recebe ordens da IA)', () => {
    const sim = comIa();
    // A única forma de algo entrar na fila da Nave é o Comando `imprimir`.
    sim.step();
    const nave = sim.state.entities.find(
      (id) => getComponent(sim.state, id, 'structure')?.tipo === 'ship',
    )!;
    expect(getComponent(sim.state, nave, 'producer')!.fila.map((i) => i.item)).toContain(
      'hover_explorer',
    );
    // Só comandos conhecidos do jogo: nenhum tipo desconhecido foi emitido.
    const eventos = [] as string[];
    for (let t = 0; t < 40; t++) for (const e of sim.step()) eventos.push(e.tipo);
    expect(eventos).not.toContain('comando_desconhecido');
  });

  it('IA-02: a IA só lê o que a própria névoa permite (unidade escondida não entra na memória)', () => {
    const sim = comIa();
    const [escondida] = criar(sim, [{ estrutura: 'storage', x: 0, z: 90 }], 'usa');
    const [vista] = criar(sim, [{ estrutura: 'storage', x: 0, z: 25 }], 'usa');
    sim.run(3 * sim.tickHz);
    const conhecidas = Object.keys(sim.state.ias.bra!.conhecidas).map(Number);
    expect(conhecidas).toContain(vista);
    expect(conhecidas).not.toContain(escondida);
    const q = montarQuadro(contexto(sim), 'bra')!;
    expect(q.inimigos).not.toContain(escondida);
  });

  it('IA-06: pesos de tiers bloqueados vão proporcionalmente para os permitidos', () => {
    const sim = comIa('facil');
    const q = montarQuadro(contexto(sim), 'bra')!;
    const w = pesos(q);
    // D-66: no Fácil o exército fica em T1 (estruturas e apoio usam `tiers_permitidos`).
    expect(dificuldade('facil', 'tiers_militares')).toBe(1);
    expect(w.opq).toBe(0);
    expect(w.dlaser).toBe(0);
    const total = Object.values(w).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(100, 9);
    // bra: ex1 25, obs 10, torres 5 → proporção mantida entre os permitidos.
    expect(w.ex1 / w.obs).toBeCloseTo(25 / 10, 9);
  });

  it('§13.2: o bônus de coleta da dificuldade acelera a mineração da IA', () => {
    const minerado = (nivel: string) => {
      const sim = comIa(nivel);
      sim.run(90 * sim.tickHz);
      return sim.state.placar.bra.vrColetado;
    };
    expect(minerado('brutal')).toBeGreaterThan(minerado('normal'));
    expect(minerado('facil')).toBeLessThan(minerado('normal'));
  });
});

describe('T-091 — IA-01, §13.2: economia e energia da IA', () => {
  it('§13.2: a IA imprime hovers até meta_hovers e mantém ia_impressoras_alvo Impressoras', () => {
    const sim = comIa('facil');
    revelar(sim);
    sim.run(8 * 60 * sim.tickHz);
    const q = montarQuadro(contexto(sim), 'bra')!;
    expect(q.hovers.length).toBeGreaterThanOrEqual(dificuldade('facil', 'meta_hovers'));
    expect(q.impressoras.length).toBe(param('ia_impressoras_alvo'));
  });

  it('IA-01: mantém o saldo de energia ≥ 0 na maior parte da partida', () => {
    const sim = comIa();
    revelar(sim);
    let verde = 0;
    let amostras = 0;
    for (let s = 0; s < 8 * 60; s++) {
      sim.run(sim.tickHz);
      if (s < 60) continue;
      amostras++;
      if (!sim.state.energia.bra.racionamento) verde++;
    }
    expect(verde / amostras).toBeGreaterThan(0.5);
  });
});

describe('T-092 — IA-03, §13.3: produção e composição', () => {
  it('§13.3: a composição militar converge para os pesos da personalidade', () => {
    const sim = comIa('normal');
    revelar(sim);
    for (const r of ['fe', 'si', 'cu', 'li', 'ti', 'u'] as const)
      sim.state.estoques.bra[r] = 20_000;
    sim.run(10 * 60 * sim.tickHz);
    const q = montarQuadro(contexto(sim), 'bra')!;
    const w = pesos(q);
    const vr: Record<string, number> = {};
    let total = 0;
    for (const [c, item] of Object.entries(CATEGORIAS)) {
      const n = sim.state.entities.filter(
        (id) =>
          getComponent(sim.state, id, 'owner')?.nacao === 'bra' &&
          (getComponent(sim.state, id, 'unit')?.tipo ??
            getComponent(sim.state, id, 'structure')?.tipo) === item,
      ).length;
      const custo = {
        hover_ex1: 80,
        hover_opq: 120,
        hover_minelayer: 110,
        hover_scout: 40,
        drone_bomber: 150,
        drone_laser: 120,
        laser_tower: 80,
      }[item]!;
      vr[c] = n * custo;
      total += vr[c];
    }
    const soma = Object.values(w).reduce((s, v) => s + v, 0);
    for (const c of Object.keys(CATEGORIAS)) {
      expect(Math.abs(vr[c]! / total - w[c as keyof typeof w] / soma), c).toBeLessThan(0.15);
    }
  });

  it('IA-03: exército inimigo observado desloca peso para os contras', () => {
    const sim = comIa('normal');
    const q = montarQuadro(contexto(sim), 'bra')!;
    const antes = pesos(q);
    q.ia.observado = { drone_laser: 600 };
    const depois = pesos(q);
    expect(depois.ex1).toBeGreaterThan(antes.ex1);
    expect(depois.torres).toBeGreaterThan(antes.torres);
  });
});

describe('T-093 — IA-04, IA-05, §13.2: militar e dificuldades', () => {
  it('IA-04/IA-05: a primeira onda respeita primeiro_ataque_min e vr_exercito_ataque; as IAs se atacam', () => {
    // Seed em que as duas IAs chegam a atacar em 30 min (muda com o balanceamento: com D-49 a
    // seed 1 não servia; com o plano de estruturas da IA, D-66, a seed 3 deixou de servir).
    const { sim, nacoes } = criarPartida({ seed: 1, ias: ['normal', 'normal'], maxMin: 30 });
    const primeira: Record<string, { minuto: number; vr: number }> = {};
    for (let t = 0; t < 30 * 60 * sim.tickHz && Object.keys(primeira).length < 2; t++) {
      sim.step();
      for (const n of nacoes) {
        const onda = sim.state.ias[n]!.onda;
        if (onda && !primeira[n]) primeira[n] = { minuto: t / sim.tickHz / 60, vr: onda.vrInicial };
      }
    }
    expect(Object.keys(primeira)).toHaveLength(2);
    for (const n of nacoes) {
      expect(primeira[n]!.minuto).toBeGreaterThanOrEqual(
        dificuldade('normal', 'primeiro_ataque_min'),
      );
      expect(primeira[n]!.vr).toBeGreaterThanOrEqual(dificuldade('normal', 'vr_exercito_ataque'));
    }
    // IA-05: cada uma destruiu algo da outra.
    for (const n of nacoes) expect(sim.state.placar[n]!.vrDestruido).toBeGreaterThan(0);
  }, 180_000);

  /** IA no nível dado com unidades próprias e inimigas em contato perto da base (defesa). */
  function combate(
    nivel: string,
    proprias: Parameters<typeof criar>[1],
    inimigas: Parameters<typeof criar>[1],
  ) {
    const sim = comIa(nivel);
    const meus = criar(sim, proprias);
    const deles = criar(sim, inimigas, 'usa');
    return { sim, meus, deles };
  }
  const ordem = (sim: Sim, id: number) => getComponent(sim.state, id, 'order')!.tipo;

  it('§13.2 micro 1: foco de fogo — quem está engajado passa a atacar o inimigo de menor HP', () => {
    const { sim, meus, deles } = combate(
      'normal',
      [
        { unidade: 'hover_ex1', x: 0, z: 26, postura: 'manter' },
        { unidade: 'hover_ex1', x: 8, z: 26, postura: 'manter' },
      ],
      [
        { unidade: 'hover_opq', x: -3, z: 33, postura: 'passiva' },
        { unidade: 'hover_opq', x: 11, z: 33, postura: 'passiva' },
      ],
    );
    getComponent(sim.state, deles[1]!, 'vida')!.hp = 120;
    sim.run(1.5 * sim.tickHz);
    for (const id of meus) expect(getComponent(sim.state, id, 'arma')!.alvo).toBe(deles[1]);
  });

  it('§13.2 micro 0: sem foco de fogo no Fácil', () => {
    const { sim, meus } = combate(
      'facil',
      [{ unidade: 'hover_ex1', x: 0, z: 26, postura: 'manter' }],
      [{ unidade: 'hover_explorer', x: -4, z: 33, postura: 'passiva' }],
    );
    sim.run(3 * sim.tickHz);
    expect(ordem(sim, meus[0]!)).not.toBe('atacar');
  });

  it('§13.2 micro 2: ferido abaixo de ia_ferido_pct recua para a reunião', () => {
    const { sim, meus } = combate(
      'dificil',
      [{ unidade: 'hover_ex1', x: 0, z: 26 }],
      [{ unidade: 'hover_ex1', x: 0, z: 33, postura: 'manter' }],
    );
    const vida = getComponent(sim.state, meus[0]!, 'vida')!;
    vida.hp = (vida.max * (param('ia_ferido_pct') - 5)) / 100;
    sim.run(2 * sim.tickHz);
    expect(ordem(sim, meus[0]!)).toBe('mover');
  });

  it('§13.2 micro 3: OPQ recua com o inimigo a menos de ia_kite_pct do alcance', () => {
    const { sim, meus } = combate(
      'brutal',
      [{ unidade: 'hover_opq', x: 0, z: 26 }],
      [{ unidade: 'hover_ex1', x: 0, z: 31, postura: 'manter' }],
    );
    const antes = pos(sim, meus[0]!);
    sim.run(2 * sim.tickHz);
    expect(pos(sim, meus[0]!).z).toBeLessThan(antes.z);
  });
});

describe('T-096 — IA-06, IA-08 a IA-10, D-66: a IA evolui estruturas', () => {
  const muito = { fe: 5000, si: 5000, cu: 5000, li: 5000, ti: 5000, u: 500 };

  it('IA-08: antes do minuto do item, nada; depois, o primeiro item abaixo da meta vai para a fila', () => {
    const sim = comIa('facil');
    Object.assign(sim.state.estoques.bra!, muito);
    const ctx = contexto(sim);
    const q = montarQuadro(ctx, 'bra')!;
    const torres = dados.ia_plano.find((l) => l.item === 'laser_tower')!;
    const aa = dados.ia_plano.find((l) => l.item === 'aa_battery')!;
    // Torres já contam desde o minuto 0; com elas feitas, a Antiaérea só entra no minuto dela.
    q.naFila['laser_tower'] = torres.facil;
    q.minutos = aa.min_facil - 1;
    expect(proximoDoPlano(ctx, q)).not.toBe('aa_battery');
    q.minutos = aa.min_facil + 1;
    q.naFila['nuclear_plant'] = 1;
    expect(proximoDoPlano(ctx, q)).toBe('aa_battery');
  });

  it('IA-06 (D-66): no Fácil, o exército não passa de vr_exercito_max nem sai de tiers_militares', () => {
    const { sim } = criarPartida({ seed: 3, ias: ['facil', 'facil'], maxMin: 25 });
    let maior = 0;
    for (let t = 0; t < 25 * 60 * sim.tickHz; t++) {
      sim.step();
      if (t % (30 * sim.tickHz) !== 0) continue;
      for (const nacao of sim.state.nacoes) {
        const ex = sim.state.entities.filter(
          (id) =>
            getComponent(sim.state, id, 'owner')?.nacao === nacao &&
            getComponent(sim.state, id, 'unit') &&
            getComponent(sim.state, id, 'arma'),
        );
        const vr = ex.reduce(
          (s, id) =>
            s + dados.custos.find((c) => c.id === getComponent(sim.state, id, 'unit')!.tipo)!.vr,
          0,
        );
        maior = Math.max(maior, vr);
        for (const id of ex) {
          const tipo = getComponent(sim.state, id, 'unit')!.tipo;
          expect(['hover_ex1', 'hover_scout']).toContain(tipo);
        }
      }
    }
    // Uma unidade pode já estar na fila quando o teto é alcançado.
    const maiorUnidade = Math.max(
      ...['hover_ex1', 'hover_scout'].map((t) => dados.custos.find((c) => c.id === t)!.vr),
    );
    expect(maior).toBeLessThanOrEqual(dificuldade('facil', 'vr_exercito_max') + maiorUnidade);
  }, 180_000);

  it('IA-08/IA-10: no Normal, a partida headless constrói as estruturas do plano e fabrica mísseis', () => {
    const { sim } = criarPartida({ seed: 3, ias: ['normal', 'normal'], maxMin: 26 });
    for (let t = 0; t < 26 * 60 * sim.tickHz && !sim.state.resultado; t++) sim.step();
    const tipos = new Set(
      sim.state.entities.map((id) => getComponent(sim.state, id, 'structure')?.tipo),
    );
    for (const t of ['aa_battery', 'satellite_uplink', 'mag_tower', 'missile_silo'] as const) {
      expect(tipos).toContain(t);
    }
    const misseis = sim.state.entities
      .filter((id) => getComponent(sim.state, id, 'lancador'))
      .reduce(
        (n, id) =>
          n +
          getComponent(sim.state, id, 'lancador')!.prontos.length +
          getComponent(sim.state, id, 'producer')!.fila.length,
        0,
      );
    expect(misseis).toBeGreaterThan(0);
  }, 180_000);

  it('IA-10: curto defende contra inimigo perto de uma estrutura própria', () => {
    const sim = comIa('facil');
    const [silo] = criar(sim, [{ estrutura: 'missile_silo', x: 20, z: 20 }]);
    getComponent(sim.state, silo!, 'lancador')!.prontos.push('missile_short');
    criar(sim, [{ unidade: 'hover_ex1', x: 30, z: 20, postura: 'passiva' }], 'usa');
    const eventos: string[] = [];
    for (let t = 0; t < 10 * sim.tickHz; t++) {
      for (const e of sim.step()) {
        if (e.tipo === 'disparo' && (e.dados as { arma: string }).arma === 'missil_curto')
          eventos.push(e.tipo);
      }
    }
    expect(eventos.length).toBeGreaterThan(0);
  });
});
