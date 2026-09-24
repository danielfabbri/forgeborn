import { describe, expect, it } from 'vitest';
import { getComponent, param, type Sim } from '../../src/sim';
import type { SystemContext } from '../../src/sim/core/pipeline';
import { ATIVAR_IA_COMMAND, dificuldade, pesos } from '../../src/sim/ia';
import { montarQuadro } from '../../src/sim/ia/quadro';
import { CATEGORIAS } from '../../src/sim/ia/producao';
import { INICIAR_PARTIDA_COMMAND } from '../../src/sim/producao';
import { criar, mundoLiso, ordenar, partida, ponto, revelar, semear } from './mundo-teste';
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
    expect(dificuldade('facil', 'tiers_permitidos')).toBe(1);
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
});
