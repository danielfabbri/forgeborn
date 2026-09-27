import { describe, expect, it } from 'vitest';
import { dados, getComponent, param, type Sim, type SimEvent } from '../../src/sim';
import type { SystemContext } from '../../src/sim/core/pipeline';
import { navegavelDa } from '../../src/sim/units/navegacao';
import { celulaDe } from '../../src/sim/map/grids';
import { estadoEm, VISIVEL, visivelPara } from '../../src/sim/visao/nevoa';
import { rumoDe } from '../../src/sim/visao/sentinela';
import { armaDe } from '../../src/sim/combate/armas';
import { entitiesWith } from '../../src/sim/core/entities';
import { alvo, criar, mundoLiso, ordenar, partida, ponto, pos } from './mundo-teste';

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
const rodar = (sim: Sim, s: number, eventos?: SimEvent[]) => {
  for (let t = 0; t < Math.round(s * sim.tickHz); t++) {
    const novos = sim.step();
    eventos?.push(...novos);
  }
};
const satelitesDe = (sim: Sim, nacao: 'bra' | 'usa') =>
  entitiesWith(sim.state, 'satelite', 'owner').filter(
    (id) => getComponent(sim.state, id, 'owner')!.nacao === nacao,
  );
function minaDe(sim: Sim, x: number, z: number, nacao: 'bra' | 'usa' = 'usa'): number {
  criar(sim, [{ mina: true, x, z }], nacao);
  return sim.state.entities.filter((id) => getComponent(sim.state, id, 'mine')).at(-1)!;
}

describe('T-065 — VIS-05, CMB-19, CMB-20, CMB-22: detecção e camuflagem', () => {
  it('CMB-19/VIS-05: mina inimiga só aparece dentro de deteccao_m de um detector', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 0, postura: 'passiva' }]);
    const mina = minaDe(sim, 0, 6);
    rodar(sim, 0.3);
    // O EX1 vê o ponto, mas não detecta.
    expect(estadoEm(contexto(sim), 'bra', ponto(0, 6))).toBe(VISIVEL);
    expect(visivelPara(contexto(sim), 'bra', mina)).toBe(false);
    criar(sim, [{ unidade: 'hover_scout', x: 0, z: -5 }]);
    rodar(sim, 0.3);
    expect(visivelPara(contexto(sim), 'bra', mina)).toBe(true);
  });

  it('CMB-20: mina revelada vira alvo (HP mina_hp) e é destruída', () => {
    const sim = partida(mundoLiso());
    const mina = minaDe(sim, 0, 6);
    expect(getComponent(sim.state, mina, 'vida')!.hp).toBe(param('mina_hp'));
    criar(sim, [
      { unidade: 'hover_scout', x: 0, z: -3 },
      { unidade: 'hover_ex1', x: 0, z: 0, postura: 'manter' },
    ]);
    rodar(sim, 4);
    expect(sim.state.entities.includes(mina)).toBe(false);
  });

  it('CMB-20: o pathfinding da nação que revelou a mina a evita; o dos outros, não', () => {
    const sim = partida(mundoLiso());
    const mina = minaDe(sim, 0, 20);
    criar(sim, [{ unidade: 'hover_scout', x: 0, z: 10 }]);
    rodar(sim, 0.3);
    const ctx = contexto(sim);
    const celula = celulaDe(mundoLiso().grades.navegacao, ponto(0, 20));
    expect(navegavelDa(ctx, 'bra')!.bloqueado![celula]).toBe(1);
    expect(navegavelDa(ctx, 'usa')!.bloqueado?.[celula] ?? 0).toBe(0);
    expect(mina).toBeGreaterThan(0);
  });

  it('CMB-22: Sentinela é invisível além de sentinela_camuflagem_m, exceto para detectores', () => {
    const sim = partida(mundoLiso());
    const [s] = criar(sim, [{ unidade: 'hover_scout', x: 0, z: 0 }], 'usa');
    ordenar(sim, 'sentinela', { ids: [s] }, 'usa');
    rodar(sim, param('tempo_implantar_sentinela_s') + 0.2);
    const [perto] = criar(sim, [{ unidade: 'hover_ex1', x: 0, z: 15, postura: 'passiva' }]);
    rodar(sim, 0.3);
    expect(visivelPara(contexto(sim), 'bra', s!)).toBe(false);
    getComponent(sim.state, perto!, 'order')!.tipo = 'manter';
    const p = getComponent(sim.state, perto!, 'position')!;
    const d = ponto(0, param('sentinela_camuflagem_m') - 2);
    const r = Math.hypot(p.x, p.y, p.z);
    Object.assign(p, { x: d[0] * r, y: d[1] * r, z: d[2] * r });
    rodar(sim, 0.3);
    expect(visivelPara(contexto(sim), 'bra', s!)).toBe(true);
  });
});

describe('T-072 — UNI-03, VIS-06, VIS-07: Hover de Observação e Sentinela', () => {
  it('UNI-03: implanta em tempo_implantar_sentinela_s e recolhe em tempo_recolher_sentinela_s', () => {
    const sim = partida(mundoLiso());
    const [s] = criar(sim, [{ unidade: 'hover_scout', x: 0, z: 0 }]);
    ordenar(sim, 'sentinela', { ids: [s] });
    rodar(sim, param('tempo_implantar_sentinela_s') - 0.1);
    expect(getComponent(sim.state, s!, 'sentinela')!.estado).toBe('implantando');
    rodar(sim, 0.2);
    expect(getComponent(sim.state, s!, 'sentinela')!.estado).toBe('ativo');
    const en = getComponent(sim.state, s!, 'bateria')!.en;
    rodar(sim, 2);
    expect(en - getComponent(sim.state, s!, 'bateria')!.en).toBeCloseTo(
      param('en_sentinela_s') * 2,
      6,
    );
    ordenar(sim, 'sentinela', { ids: [s] });
    rodar(sim, param('tempo_recolher_sentinela_s') - 0.1);
    expect(getComponent(sim.state, s!, 'sentinela')!.estado).toBe('recolhendo');
    rodar(sim, 0.2);
    expect(getComponent(sim.state, s!, 'sentinela')).toBeUndefined();
  });

  it('UNI-03: em Sentinela fica imóvel, com visão sentinela_visao_m; ordem de mover recolhe antes', () => {
    const sim = partida(mundoLiso());
    const [s] = criar(sim, [{ unidade: 'hover_scout', x: 0, z: 0 }]);
    ordenar(sim, 'sentinela', { ids: [s] });
    rodar(sim, param('tempo_implantar_sentinela_s') + 0.3);
    expect(estadoEm(contexto(sim), 'bra', ponto(0, param('sentinela_visao_m') - 2))).toBe(VISIVEL);
    ordenar(sim, 'mover', { ids: [s], ...alvo(0, 30) });
    rodar(sim, 0.5);
    expect(pos(sim, s!).z).toBeCloseTo(0, 1);
    rodar(sim, 5);
    expect(pos(sim, s!).z).toBeGreaterThan(5);
  });

  it('VIS-06/VIS-07: sinais de radar sem tipo e AL-03 com contagem e rumo', () => {
    const sim = partida(mundoLiso());
    const [s] = criar(sim, [{ unidade: 'hover_scout', x: 0, z: 0 }]);
    ordenar(sim, 'sentinela', { ids: [s] });
    rodar(sim, param('tempo_implantar_sentinela_s') + 0.3);
    const eventos: SimEvent[] = [];
    // Dois inimigos a leste, dentro do radar e fora da visão.
    criar(
      sim,
      [
        { unidade: 'hover_ex1', x: 50, z: 0, postura: 'passiva' },
        { unidade: 'hover_ex1', x: 50, z: 2, postura: 'passiva' },
      ],
      'usa',
    );
    rodar(sim, param('radar_atualizacao_s') + 0.2, eventos);
    const al03 = eventos.find(
      (e) => e.tipo === 'alerta' && (e.dados as { id: string }).id === 'AL-03',
    );
    expect(al03?.dados).toMatchObject({ id: 'AL-03', nacao: 'bra', n: 2 });
    const direcao = (al03!.dados as { direcao: string }).direcao;
    expect(direcao).toBe(rumoDe(ponto(0, 0), ponto(50, 1)));
    expect(sim.state.sinais.bra).toHaveLength(2);
  });

  it('VIS-07: os 8 rumos seguem o norte do planeta', () => {
    const c = ponto(0, 0);
    expect(rumoDe(c, ponto(0, 20))).toBe(rumoDe(c, ponto(1, 20)));
    const rumos = new Set(
      Array.from({ length: 8 }, (_, k) => {
        const a = (k * Math.PI) / 4;
        return rumoDe(c, ponto(20 * Math.sin(a), 20 * Math.cos(a)));
      }),
    );
    expect(rumos.size).toBe(8);
  });
});

describe('T-073 — UNI-04 a UNI-06, VIS-08: satélite', () => {
  function base(sim: Sim) {
    const [nave, uplink] = criar(sim, [
      { estrutura: 'ship', x: -40, z: 0 },
      { estrutura: 'satellite_uplink', x: 0, z: 0, comSatelite: true },
    ]);
    ordenar(sim, 'debug_encher_banco', {});
    sim.step();
    return { nave: nave!, uplink: uplink! };
  }

  it('UNI-04/VIS-08: lança em tempo_lancamento_satelite_s (AL-12) e dá visão persistente', () => {
    const sim = partida(mundoLiso());
    const { uplink } = base(sim);
    const eventos: SimEvent[] = [];
    rodar(sim, param('tempo_lancamento_satelite_s') + 0.5, eventos);
    const sat = satelitesDe(sim, 'bra')[0]!;
    expect(getComponent(sim.state, sat, 'satelite')!.estado).toBe('orbita');
    expect(eventos).toContainEqual(
      expect.objectContaining({ dados: expect.objectContaining({ id: 'AL-12', nacao: 'bra' }) }),
    );
    // A ordem vale pela base (atalho T) ou pelo próprio satélite (clique direito).
    ordenar(sim, 'reposicionar_satelite', { ids: [uplink], ...alvo(0, 100) });
    rodar(sim, 100 / param('satelite_vel_m_s') + 1);
    expect(estadoEm(contexto(sim), 'bra', ponto(0, 100 + param('satelite_visao_m') - 5))).toBe(
      VISIVEL,
    );
    ordenar(sim, 'reposicionar_satelite', { ids: [sat], ...alvo(0, 0) });
    rodar(sim, 100 / param('satelite_vel_m_s') + 1);
    const p = getComponent(sim.state, sat, 'satelite')!.ponto;
    expect(p[2]).toBeCloseTo(ponto(0, 0)[2], 3);
  });

  it('VIS-08: Varredura revela varredura_raio_m por varredura_duracao_s, paga do banco e recarrega', () => {
    const sim = partida(mundoLiso());
    const { uplink } = base(sim);
    rodar(sim, param('tempo_lancamento_satelite_s') + 0.5);
    const sat = satelitesDe(sim, 'bra')[0]!;
    const banco = sim.state.energia.bra.banco;
    ordenar(sim, 'varredura', { ids: [uplink], ...alvo(0, -90) });
    rodar(sim, 0.3);
    // A geração da Nave repõe um pouco do banco nesses ticks.
    expect(banco - sim.state.energia.bra.banco).toBeGreaterThan(param('varredura_custo_en') - 5);
    expect(estadoEm(contexto(sim), 'bra', ponto(0, -90 - param('varredura_raio_m') + 10))).toBe(
      VISIVEL,
    );
    // Recarga: a segunda não sai.
    const antes = sim.state.energia.bra.banco;
    ordenar(sim, 'varredura', { ids: [uplink], ...alvo(0, -90) });
    rodar(sim, 0.1);
    expect(sim.state.energia.bra.banco).toBeGreaterThan(antes - param('varredura_custo_en') + 1);
    rodar(sim, param('varredura_duracao_s'));
    expect(getComponent(sim.state, sat, 'satelite')!.varredura).toBeNull();
  });

  it('UNI-04: destruir a base durante o lançamento perde o satélite', () => {
    const sim = partida(mundoLiso());
    const { uplink } = base(sim);
    rodar(sim, 5);
    getComponent(sim.state, uplink, 'vida')!.hp = 0;
    rodar(sim, param('tempo_lancamento_satelite_s'));
    expect(sim.state.entities.includes(uplink)).toBe(false);
    expect(satelitesDe(sim, 'bra')).toHaveLength(0);
  });

  it('UNI-05 (D-51): o satélite cai com a base (AL-18)', () => {
    const sim = partida(mundoLiso());
    const { uplink } = base(sim);
    rodar(sim, param('tempo_lancamento_satelite_s') + 0.5);
    expect(satelitesDe(sim, 'bra')).toHaveLength(1);
    const eventos: SimEvent[] = [];
    getComponent(sim.state, uplink, 'vida')!.hp = 0;
    rodar(sim, 1, eventos);
    expect(satelitesDe(sim, 'bra')).toHaveLength(0);
    expect(eventos).toContainEqual(
      expect.objectContaining({ dados: expect.objectContaining({ id: 'AL-18', nacao: 'bra' }) }),
    );
  });

  it('ENE-04 (D-51): o satélite não consome da rede e segue em órbita sem banco', () => {
    const sim = partida(mundoLiso());
    const { uplink } = base(sim);
    rodar(sim, param('tempo_lancamento_satelite_s') + 0.5);
    // A Base só consome da rede enquanto imprime (PRD-06); o satélite em órbita, nunca.
    expect(getComponent(sim.state, uplink, 'consumidor')!.demanda_en_s).toBe(0);
    sim.state.energia.bra.banco = 0;
    rodar(sim, 5);
    const sat = satelitesDe(sim, 'bra')[0]!;
    expect(getComponent(sim.state, sat, 'satelite')!.estado).toBe('orbita');
    expect(getComponent(sim.state, sat, 'position')).toBeUndefined();
  });

  it('UNI-05 (D-51): sat_laser só atinge satélites; só satélites atingem satélites', () => {
    const sim = partida(mundoLiso());
    criar(sim, [
      { estrutura: 'ship', x: -40, z: 0 },
      { estrutura: 'satellite_uplink', x: 0, z: 0, comSatelite: true },
      // Alvo de solo sob o satélite: nunca é atingido pelo laser orbital.
      { unidade: 'hover_ex1', x: 30, z: 30, postura: 'passiva' },
    ]);
    const [, uplinkUsa] = criar(
      sim,
      [
        { estrutura: 'ship', x: 40, z: 200 },
        { estrutura: 'satellite_uplink', x: 0, z: 200, comSatelite: true },
      ],
      'usa',
    );
    ordenar(sim, 'debug_encher_banco', {});
    rodar(sim, param('tempo_lancamento_satelite_s') + 0.5);
    const [nosso] = satelitesDe(sim, 'bra');
    const [deles] = satelitesDe(sim, 'usa');
    // O deles revida (só em satélite); o nosso aguenta para o teste ver o deles cair.
    getComponent(sim.state, nosso!, 'satelite')!.hp = 1e6;
    const doSolo = sim.state.entities.filter((id) => getComponent(sim.state, id, 'unit'));
    // Fora do alcance, nada acontece.
    rodar(sim, 2);
    expect(getComponent(sim.state, deles!, 'satelite')!.hp).toBe(param('satelite_hp'));
    const eventos: SimEvent[] = [];
    ordenar(sim, 'atacar_satelite', { ids: [nosso], alvo: deles });
    const arma = armaDe('sat_laser');
    const distancia = 200 - arma.alcance_m;
    rodar(sim, distancia / param('satelite_vel_m_s') + 2, eventos);
    const disparos = eventos.filter(
      (e) => e.tipo === 'disparo' && (e.dados as { arma: string }).arma === 'sat_laser',
    );
    expect(disparos.length).toBeGreaterThan(0);
    for (const d of disparos) expect([nosso, deles]).toContain((d.dados as { alvo: number }).alvo);
    // Ninguém no solo foi tocado; ao fim cai o deles (AL-18 do usa), mas a base segue de pé.
    for (const id of doSolo) {
      expect(getComponent(sim.state, id, 'vida')!.hp).toBe(
        getComponent(sim.state, id, 'vida')!.max,
      );
    }
    rodar(sim, (param('satelite_hp') / arma.dano) * (arma.recarga_s ?? 0) + 2, eventos);
    expect(satelitesDe(sim, 'usa')).toHaveLength(0);
    expect(sim.state.entities.includes(uplinkUsa!)).toBe(true);
    expect(eventos).toContainEqual(
      expect.objectContaining({ dados: expect.objectContaining({ id: 'AL-18', nacao: 'usa' }) }),
    );
  });
});

describe('T-076 — UNI-04, PRD-01, PRD-06, D-55: Satélite impresso pela Base', () => {
  it('UNI-04: a Base pronta não lança sozinha; S imprime com a rede e lança; um por base', () => {
    const sim = partida(mundoLiso());
    const [, base] = criar(sim, [
      { estrutura: 'ship', x: -40, z: 0 },
      { estrutura: 'satellite_uplink', x: 0, z: 0 },
    ]);
    ordenar(sim, 'debug_encher_banco', {});
    sim.step();
    Object.assign(sim.state.estoques.bra!, { fe: 500, si: 500, cu: 500, li: 500, ti: 500, u: 50 });
    rodar(sim, 5);
    expect(satelitesDe(sim, 'bra')).toHaveLength(0);
    const custo = dados.custos.find((c) => c.id === 'satellite')!;
    const fe = sim.state.estoques.bra!.fe;
    ordenar(sim, 'imprimir', { ids: [base], item: 'satellite' });
    // O segundo pedido é recusado (um por base de cada vez).
    ordenar(sim, 'imprimir', { ids: [base], item: 'satellite' });
    sim.step();
    expect(fe - sim.state.estoques.bra!.fe).toBe(custo.fe);
    expect(getComponent(sim.state, base!, 'producer')!.fila).toHaveLength(1);
    rodar(sim, custo.tempo_s + 1);
    const [sat] = satelitesDe(sim, 'bra');
    expect(sat).toBeDefined();
    expect(getComponent(sim.state, sat!, 'satelite')!.estado).toBe('lancando');
    rodar(sim, param('tempo_lancamento_satelite_s') + 0.5);
    expect(getComponent(sim.state, sat!, 'satelite')!.estado).toBe('orbita');
    // Com o satélite vivo, a base não imprime outro.
    ordenar(sim, 'imprimir', { ids: [base], item: 'satellite' });
    rodar(sim, 0.2);
    expect(getComponent(sim.state, base!, 'producer')!.fila).toHaveLength(0);
  });
});
