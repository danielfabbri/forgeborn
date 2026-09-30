import { describe, expect, it } from 'vitest';
import {
  dados,
  getComponent,
  param,
  setComponent,
  type EntityId,
  type Sim,
  type SimEvent,
} from '../../src/sim';
import type { CustosId, RecursosId } from '../../src/sim/data';
import { custoDe, INICIAR_PARTIDA_COMMAND, validarPosicionamento } from '../../src/sim/producao';
import { statsEstrutura, statsMovel } from '../../src/sim/units/stats';
import {
  alvo,
  criar,
  mundoLiso,
  ordenar,
  partida,
  ponto,
  pos,
  revelar,
  semear,
} from './mundo-teste';
import type { SystemContext } from '../../src/sim/core/pipeline';

const RECURSOS: RecursosId[] = ['fe', 'si', 'cu', 'li', 'ti', 'u'];
const fila = (sim: Sim, id: EntityId) => getComponent(sim.state, id, 'producer')!.fila;
const bateria = (sim: Sim, id: EntityId) => getComponent(sim.state, id, 'bateria')!;
const obra = (sim: Sim, id: EntityId) => getComponent(sim.state, id, 'obra');
const vida = (sim: Sim, id: EntityId) => getComponent(sim.state, id, 'vida')!;

/** Estoque suficiente para qualquer teste. */
function rico(sim: Sim, nacao: 'bra' | 'usa' = 'bra'): void {
  for (const r of RECURSOS) sim.state.estoques[nacao][r] = 10_000;
}

function rodarAte(sim: Sim, condicao: () => boolean, limite_s: number, eventos?: SimEvent[]) {
  for (let t = 0; t < limite_s * sim.tickHz; t++) {
    if (condicao()) return true;
    const novos = sim.step();
    eventos?.push(...novos);
  }
  return condicao();
}

/** Espera as unidades pararem: enquanto freiam, pagam o movimento (ENE-09). */
function paradas(sim: Sim, ids: EntityId[]): boolean {
  return rodarAte(
    sim,
    () => ids.every((id) => getComponent(sim.state, id, 'locomotion')!.speed === 0),
    10,
  );
}

function passo(sim: Sim, eventos?: SimEvent[]): void {
  const novos = sim.step();
  eventos?.push(...novos);
}

function unidadesDo(sim: Sim, tipo: string): EntityId[] {
  return sim.state.entities.filter((id) => getComponent(sim.state, id, 'unit')?.tipo === tipo);
}

/** Contexto mínimo para chamar funções puras da simulação fora de um tick. */
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

function posicionar(sim: Sim, impressora: EntityId, tipo: CustosId, x: number, z: number) {
  ordenar(sim, 'posicionar_estrutura', { id: impressora, tipo, ...alvo(x, z) });
}

describe('T-050 — PRD-01 a PRD-06: filas e pagamento', () => {
  it('PRD-01: a Nave imprime só hover e Impressora; a Impressora não imprime Impressora', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const [nave, impressora] = criar(sim, [
      { estrutura: 'ship', x: 0, z: 0 },
      { unidade: 'printer', x: 30, z: 0 },
    ]);
    for (const item of ['hover_explorer', 'printer', 'hover_ex1'] as const) {
      ordenar(sim, 'imprimir', { ids: [nave], item });
    }
    // D-92: EX1 e OPQ também não são mais da Impressora (só a Fábrica de Artilharia).
    for (const item of ['printer', 'hover_explorer', 'hover_ex1', 'hover_opq'] as const) {
      ordenar(sim, 'imprimir', { ids: [impressora], item });
    }
    passo(sim);
    expect(fila(sim, nave!).map((i) => i.item)).toEqual(['hover_explorer', 'printer']);
    expect(fila(sim, impressora!).map((i) => i.item)).toEqual(['hover_explorer']);
  });

  it('PRD-03: a fila da Nave aceita até fila_max_nave itens', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    for (let k = 0; k < param('fila_max_nave') + 2; k++) {
      ordenar(sim, 'imprimir', { ids: [nave], item: 'hover_explorer' });
    }
    passo(sim);
    expect(fila(sim, nave!)).toHaveLength(param('fila_max_nave'));
  });

  it('PRD-04: paga por inteiro ao enfileirar; sem recursos recusa e AL-06 lista o que falta', () => {
    const sim = partida(mundoLiso());
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const custo = custoDe('hover_explorer');
    sim.state.estoques.bra.fe = custo.fe;
    sim.state.estoques.bra.si = custo.si;
    sim.state.estoques.bra.cu = custo.cu;
    ordenar(sim, 'imprimir', { ids: [nave], item: 'hover_explorer' });
    passo(sim);
    expect(fila(sim, nave!)).toHaveLength(1);
    expect(sim.state.estoques.bra).toMatchObject({ fe: 0, si: 0, cu: 0 });

    sim.state.estoques.bra.fe = 5;
    const eventos: SimEvent[] = [];
    ordenar(sim, 'imprimir', { ids: [nave], item: 'hover_explorer' });
    passo(sim, eventos);
    expect(fila(sim, nave!)).toHaveLength(1);
    expect(sim.state.estoques.bra.fe).toBe(5);
    expect(eventos).toContainEqual(
      expect.objectContaining({
        tipo: 'alerta',
        dados: {
          id: 'AL-06',
          nacao: 'bra',
          faltam: { fe: custo.fe - 5, si: custo.si, cu: custo.cu },
        },
      }),
    );
  });

  it('PRD-05: cancelar devolve reembolso_cancelamento_pct% dos recursos', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const antes = { ...sim.state.estoques.bra };
    ordenar(sim, 'imprimir', { ids: [nave], item: 'printer' });
    passo(sim);
    sim.run(40);
    ordenar(sim, 'cancelar_impressao', { id: nave, indice: 0 });
    passo(sim);
    expect(fila(sim, nave!)).toHaveLength(0);
    const pct = param('reembolso_cancelamento_pct') / 100;
    const custo = custoDe('printer');
    for (const r of RECURSOS) {
      expect(sim.state.estoques.bra[r]).toBeCloseTo(antes[r] - custo[r] + custo[r] * pct, 9);
    }
  });

  it('PRD-06: a Nave imprime com energia da rede, em en_impressao ÷ tempo_s', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    ordenar(sim, 'debug_encher_banco', {});
    passo(sim);
    ordenar(sim, 'imprimir', { ids: [nave], item: 'hover_explorer' });
    passo(sim);
    // O último segundo fechado inteiro com a impressão ativa.
    sim.run(3 * sim.tickHz);
    const leitura = sim.state.energia.bra.consumoPorSegundo;
    const custo = custoDe('hover_explorer');
    expect(leitura.at(-1)).toBeCloseTo(custo.en_impressao / custo.tempo_s, 6);
  });

  it('PRD-06: sem energia a impressão da Nave pausa e o progresso fica guardado', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const [nave, torre] = criar(sim, [
      { estrutura: 'ship', x: 0, z: 0 },
      { estrutura: 'laser_tower', x: 30, z: 0 },
    ]);
    ordenar(sim, 'imprimir', { ids: [nave], item: 'hover_explorer' });
    passo(sim);
    sim.run(sim.tickHz);
    const progresso = fila(sim, nave!)[0]!.progresso;
    expect(progresso).toBeGreaterThan(0);
    // Uma defesa (prioridade 1) consome toda a geração; o banco está vazio.
    sim.state.energia.bra.banco = 0;
    setComponent(sim.state, torre!, 'consumidor', {
      prioridade: 1,
      demanda_en_s: statsEstrutura('ship').geracao_en_s,
      atendido: 1,
      offline: false,
    });
    sim.run(2);
    const parado = fila(sim, nave!)[0]!.progresso;
    sim.run(sim.tickHz);
    expect(fila(sim, nave!)[0]!.progresso).toBeCloseTo(parado, 12);
    expect(parado).toBeGreaterThanOrEqual(progresso);
  });

  it('PRD-06: a Impressora imprime com a própria bateria (en_impressao no total)', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const [impressora] = criar(sim, [{ unidade: 'printer', x: 0, z: 0 }]);
    bateria(sim, impressora!).autoRecarga = false;
    const inicio = bateria(sim, impressora!).en;
    ordenar(sim, 'imprimir', { ids: [impressora], item: 'hover_scout' });
    expect(rodarAte(sim, () => unidadesDo(sim, 'hover_scout').length === 1, 30)).toBe(true);
    expect(inicio - bateria(sim, impressora!).en).toBeCloseTo(
      custoDe('hover_scout').en_impressao,
      6,
    );
  });
});

describe('T-051 — PRD-07 a PRD-09: impressão de unidades', () => {
  it('PRD-07: a Impressora só imprime parada e retoma ao parar', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const [impressora] = criar(sim, [{ unidade: 'printer', x: 0, z: 0 }]);
    ordenar(sim, 'imprimir', { ids: [impressora], item: 'hover_scout' });
    sim.run(sim.tickHz);
    const antes = fila(sim, impressora!)[0]!.progresso;
    expect(antes).toBeGreaterThan(0);
    ordenar(sim, 'mover', { ids: [impressora], ...alvo(0, 30) });
    sim.run(2 * sim.tickHz);
    expect(fila(sim, impressora!)[0]!.progresso).toBe(antes);
    expect(rodarAte(sim, () => fila(sim, impressora!)[0]!.progresso > antes, 30)).toBe(true);
    expect(getComponent(sim.state, impressora!, 'locomotion')!.destino).toBeNull();
  });

  it('PRD-08: a unidade nasce na borda da Nave, do lado do ponto de encontro, e vai até ele', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    ordenar(sim, 'ponto_de_encontro', { ids: [nave], ...alvo(40, 0) });
    ordenar(sim, 'imprimir', { ids: [nave], item: 'printer' });
    const eventos: SimEvent[] = [];
    expect(rodarAte(sim, () => unidadesDo(sim, 'printer').length === 1, 30, eventos)).toBe(true);
    const [nova] = unidadesDo(sim, 'printer');
    const nascimento = eventos.find((e) => e.tipo === 'impresso')!;
    expect(nascimento.dados).toMatchObject({
      id: nova,
      tipo: 'printer',
      nacao: 'bra',
      produtor: nave,
    });
    const p = pos(sim, nova!);
    const borda = getComponent(sim.state, nave!, 'obstacle')!.raio + statsMovel('printer').raio_m;
    expect(p.x).toBeGreaterThan(borda - 1);
    expect(Math.abs(p.z)).toBeLessThan(1);
    sim.run(20 * sim.tickHz);
    const fim = pos(sim, nova!);
    expect(Math.hypot(fim.x - 40, fim.z)).toBeLessThan(2);
  });

  it('D-29: sem ponto de encontro, nasce na rampa da Nave (sul local)', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    ordenar(sim, 'imprimir', { ids: [nave], item: 'hover_explorer' });
    expect(rodarAte(sim, () => unidadesDo(sim, 'hover_explorer').length === 1, 30)).toBe(true);
    const p = pos(sim, unidadesDo(sim, 'hover_explorer')[0]!);
    expect(p.z).toBeLessThan(-getComponent(sim.state, nave!, 'obstacle')!.raio);
    expect(Math.abs(p.x)).toBeLessThan(1);
  });

  it('PRD-08: hover com ponto de encontro numa jazida começa a minerar ali', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const [j] = semear(sim, [{ recurso: 'si', quantidade: 500, x: 35, z: 0 }]);
    ordenar(sim, 'ponto_de_encontro', { ids: [nave], ...alvo(35, 0) });
    ordenar(sim, 'imprimir', { ids: [nave], item: 'hover_explorer' });
    expect(rodarAte(sim, () => unidadesDo(sim, 'hover_explorer').length === 1, 30)).toBe(true);
    const [h] = unidadesDo(sim, 'hover_explorer');
    const coleta = getComponent(sim.state, h!, 'coleta')!;
    expect(coleta.jazida).toBe(j);
    expect(rodarAte(sim, () => coleta.estado === 'minerando', 20)).toBe(true);
  });

  it('PRD-09: a impressão de unidade leva tempo_s (assistência não acelera)', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    criar(sim, [
      { unidade: 'hover_explorer', x: 14, z: 0 },
      { unidade: 'hover_explorer', x: -14, z: 0 },
    ]);
    ordenar(sim, 'imprimir', { ids: [nave], item: 'printer' });
    const inicio = sim.state.tick;
    expect(rodarAte(sim, () => unidadesDo(sim, 'printer').length === 1, 60)).toBe(true);
    const ticks = sim.state.tick - inicio;
    expect(Math.abs(ticks - custoDe('printer').tempo_s * sim.tickHz)).toBeLessThanOrEqual(2);
  });
});

describe('T-052 — PRD-10, UI-08: posicionamento de estruturas', () => {
  it('PRD-10: local livre e plano é válido', () => {
    const sim = partida(mundoLiso());
    expect(validarPosicionamento(contexto(sim), 'storage', ponto(0, 0))).toBeNull();
  });

  it('PRD-10: pegada sobre outra estrutura é recusada (ocupado)', () => {
    const sim = partida(mundoLiso());
    criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    const meia = (statsEstrutura('ship').pegada_m + statsEstrutura('storage').pegada_m) / 2;
    expect(validarPosicionamento(contexto(sim), 'storage', ponto(meia - 0.5, 0))).toBe('ocupado');
    expect(validarPosicionamento(contexto(sim), 'storage', ponto(meia + 0.5, 0))).toBeNull();
  });

  it('PRD-10: folga de distancia_min_jazida_m entre a pegada e a jazida', () => {
    const sim = partida(mundoLiso());
    const [j] = semear(sim, [{ recurso: 'fe', quantidade: 500, x: 0, z: 0 }]);
    const raio = getComponent(sim.state, j!, 'obstacle')!.raio;
    const meia = statsEstrutura('storage').pegada_m / 2;
    const limite = raio + param('distancia_min_jazida_m') + meia;
    expect(validarPosicionamento(contexto(sim), 'storage', ponto(limite - 0.2, 0))).toBe('jazida');
    expect(validarPosicionamento(contexto(sim), 'storage', ponto(limite + 0.2, 0))).toBeNull();
  });

  it('PRD-10: inclinação acima de inclinacao_max_construcao_graus é recusada', () => {
    const mundo = mundoLiso((x) => x > 20);
    const sim = partida(mundo);
    const ctx = { ...contexto(sim), mundo };
    expect(validarPosicionamento(ctx, 'storage', ponto(20, 0))).toBe('inclinacao');
    expect(validarPosicionamento(ctx, 'storage', ponto(0, 0))).toBeNull();
  });

  it('D-29: a pegada reservada bloqueia outra estrutura, mas não é obstáculo', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    revelar(sim);
    const [impressora] = criar(sim, [{ unidade: 'printer', x: -60, z: 0 }]);
    const eventos: SimEvent[] = [];
    posicionar(sim, impressora!, 'storage', 0, 0);
    passo(sim, eventos);
    const reservada = fila(sim, impressora!)[0]!.obra!;
    expect(obra(sim, reservada)).toMatchObject({ instalada: false });
    expect(getComponent(sim.state, reservada, 'obstacle')).toBeUndefined();
    posicionar(sim, impressora!, 'solar_plant', 3, 0);
    passo(sim, eventos);
    expect(fila(sim, impressora!)).toHaveLength(1);
    expect(eventos).toContainEqual(
      expect.objectContaining({
        tipo: 'posicionamento_recusado',
        dados: { nacao: 'bra', tipo: 'solar_plant', motivo: 'ocupado' },
      }),
    );
  });
});

/** Impressora, estrutura posicionada e canteiro instalado; devolve os IDs. */
function canteiro(sim: Sim, tipo: CustosId = 'storage') {
  revelar(sim);
  const [impressora] = criar(sim, [{ unidade: 'printer', x: -20, z: 0 }]);
  bateria(sim, impressora!).autoRecarga = false;
  posicionar(sim, impressora!, tipo, 0, 0);
  passo(sim);
  const id = fila(sim, impressora!)[0]!.obra!;
  expect(rodarAte(sim, () => obra(sim, id)?.instalada === true, 20)).toBe(true);
  return { impressora: impressora!, obra: id };
}

describe('T-053 — PRD-11 a PRD-14: canteiro e obra', () => {
  it('PRD-11: o canteiro nasce com hp_inicial_canteiro_pct% do HP, que cresce com a obra', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const c = canteiro(sim);
    const max = statsEstrutura('storage').hp;
    const inicial = (max * param('hp_inicial_canteiro_pct')) / 100;
    expect(vida(sim, c.obra).hp).toBeLessThanOrEqual(inicial + max * 0.01);
    sim.run(5 * sim.tickHz);
    const progresso = obra(sim, c.obra)!.progresso;
    expect(progresso).toBeGreaterThan(0);
    expect(vida(sim, c.obra).hp).toBeCloseTo(inicial + (max - inicial) * progresso, 6);
  });

  it('PRD-11: dano sofrido durante a obra é descontado do HP final', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const c = canteiro(sim);
    sim.run(sim.tickHz);
    vida(sim, c.obra).hp -= 50;
    const eventos: SimEvent[] = [];
    expect(rodarAte(sim, () => !obra(sim, c.obra), 60, eventos)).toBe(true);
    expect(vida(sim, c.obra).hp).toBeCloseTo(statsEstrutura('storage').hp - 50, 6);
    expect(eventos).toContainEqual(
      expect.objectContaining({
        tipo: 'estrutura_concluida',
        dados: { id: c.obra, tipo: 'storage' },
      }),
    );
  });

  it('PRD-12: estrutura em construção não gera, não guarda energia nem recebe descargas', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const c = canteiro(sim, 'solar_plant');
    expect(sim.state.energia.bra.geracao).toBe(0);
    expect(getComponent(sim.state, c.obra, 'portas')).toBeUndefined();
    expect(rodarAte(sim, () => !obra(sim, c.obra), 60)).toBe(true);
    passo(sim);
    expect(sim.state.energia.bra.geracao).toBeGreaterThan(0);
    expect(getComponent(sim.state, c.obra, 'portas')).toBeDefined();
  });

  it('PRD-12: Armazém em obra não é ponto de entrega', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const c = canteiro(sim, 'storage');
    const [j] = semear(sim, [{ recurso: 'fe', quantidade: 500, x: 0, z: 20 }]);
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 5, z: 20 }]);
    ordenar(sim, 'coletar', { ids: [h], jazida: j });
    const coleta = () => getComponent(sim.state, h!, 'coleta')!;
    expect(rodarAte(sim, () => coleta().estado === 'indo_entregar', 60)).toBe(true);
    expect(coleta().entrega).not.toBe(c.obra);
  });

  it('PRD-13/PRD-16: sem a Impressora, hovers continuam o canteiro; só a Impressora instala', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    revelar(sim);
    const [impressora] = criar(sim, [{ unidade: 'printer', x: -60, z: 0 }]);
    posicionar(sim, impressora!, 'storage', 0, 0);
    passo(sim);
    const id = fila(sim, impressora!)[0]!.obra!;
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 14, z: 0 }]);
    // Ainda reservado: o hover não pode instalar.
    ordenar(sim, 'construir', { ids: [h], alvo: id });
    passo(sim);
    expect(getComponent(sim.state, h!, 'trabalho')).toBeUndefined();
    expect(rodarAte(sim, () => obra(sim, id)?.instalada === true, 30)).toBe(true);
    // A Impressora sai; o hover retoma a obra sozinho.
    ordenar(sim, 'mover', { ids: [impressora], ...alvo(-60, 0) });
    ordenar(sim, 'construir', { ids: [h], alvo: id });
    passo(sim);
    sim.run(10 * sim.tickHz);
    expect(obra(sim, id)!.construtores).toEqual([h]);
    const antes = obra(sim, id)!.progresso;
    sim.run(sim.tickHz);
    expect(obra(sim, id)!.progresso - antes).toBeCloseTo(
      param('pi_hover') / custoDe('storage').tempo_s,
      6,
    );
  });

  it('PRD-13: canteiro abandonado não se degrada', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const c = canteiro(sim);
    sim.run(sim.tickHz);
    ordenar(sim, 'mover', { ids: [c.impressora], ...alvo(-80, 0) });
    sim.run(2);
    const progresso = obra(sim, c.obra)!.progresso;
    const hp = vida(sim, c.obra).hp;
    sim.run(10 * sim.tickHz);
    expect(obra(sim, c.obra)!.progresso).toBe(progresso);
    expect(vida(sim, c.obra).hp).toBe(hp);
  });

  it('PRD-14: cancelar a obra devolve os recursos e remove o canteiro', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const antes = { ...sim.state.estoques.bra };
    const c = canteiro(sim);
    sim.run(sim.tickHz);
    ordenar(sim, 'cancelar_obra', { ids: [c.obra] });
    passo(sim);
    expect(sim.state.entities).not.toContain(c.obra);
    expect(fila(sim, c.impressora)).toHaveLength(0);
    const pct = param('reembolso_cancelamento_pct') / 100;
    const custo = custoDe('storage');
    for (const r of RECURSOS) {
      expect(sim.state.estoques.bra[r]).toBeCloseTo(antes[r] - custo[r] + custo[r] * pct, 9);
    }
  });

  it('PRD-10: unidades próprias dentro da pegada são empurradas para fora ao instalar', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const [dentro] = criar(sim, [{ unidade: 'hover_ex1', x: 1, z: 1 }]);
    const c = canteiro(sim);
    const p = pos(sim, dentro!);
    const borda =
      getComponent(sim.state, c.obra, 'obstacle')!.raio + statsMovel('hover_ex1').raio_m;
    expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(borda - 1e-6);
  });
});

describe('T-054 — PRD-15 a PRD-17: Poder de Impressão e assistência', () => {
  function duracao(sim: Sim, c: { obra: EntityId }): number {
    const inicio = sim.state.tick;
    expect(rodarAte(sim, () => !obra(sim, c.obra), 120)).toBe(true);
    return (sim.state.tick - inicio) / sim.tickHz;
  }

  it('PRD-15: Impressora sozinha leva tempo_s; com 2 hovers (2,0 PI), metade', () => {
    const tempo = custoDe('storage').tempo_s;
    const so = partida(mundoLiso());
    rico(so);
    expect(duracao(so, canteiro(so))).toBeCloseTo(tempo, 0);

    const sim = partida(mundoLiso());
    rico(sim);
    const c = canteiro(sim);
    const hovers = criar(sim, [
      { unidade: 'hover_explorer', x: 0, z: 14 },
      { unidade: 'hover_explorer', x: 0, z: -14 },
    ]);
    for (const h of hovers) bateria(sim, h).autoRecarga = false;
    ordenar(sim, 'construir', { ids: hovers, alvo: c.obra });
    expect(rodarAte(sim, () => obra(sim, c.obra)!.construtores.length === 3, 10)).toBe(true);
    const pi = param('pi_impressora') + 2 * param('pi_hover');
    const restante = (1 - obra(sim, c.obra)!.progresso) * (tempo / pi);
    expect(duracao(sim, c)).toBeCloseTo(restante, 0);
  });

  it('PRD-17: cada construtor paga a fração do seu PI da própria bateria', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const c = canteiro(sim);
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 0, z: 14 }]);
    bateria(sim, h!).autoRecarga = false;
    ordenar(sim, 'construir', { ids: [h], alvo: c.obra });
    expect(rodarAte(sim, () => obra(sim, c.obra)!.construtores.length === 2, 10)).toBe(true);
    expect(paradas(sim, [c.impressora, h!])).toBe(true);
    const ei = bateria(sim, c.impressora).en;
    const eh = bateria(sim, h!).en;
    sim.run(sim.tickHz);
    const custo = custoDe('storage');
    expect(ei - bateria(sim, c.impressora).en).toBeCloseTo(
      (custo.en_impressao * param('pi_impressora')) / custo.tempo_s,
      6,
    );
    expect(eh - bateria(sim, h!).en).toBeCloseTo(
      (custo.en_impressao * param('pi_hover')) / custo.tempo_s,
      6,
    );
  });

  it('PRD-15: no máximo max_assistentes além do construtor principal', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const c = canteiro(sim);
    const hovers = criar(
      sim,
      Array.from({ length: param('max_assistentes') + 2 }, (_, k) => ({
        unidade: 'hover_explorer' as const,
        x: 12 * Math.cos((k * Math.PI) / 4),
        z: 12 * Math.sin((k * Math.PI) / 4),
      })),
    );
    ordenar(sim, 'construir', { ids: hovers, alvo: c.obra });
    const cheios = () => obra(sim, c.obra)!.construtores.length === 1 + param('max_assistentes');
    expect(rodarAte(sim, cheios, 15)).toBe(true);
    const construtores = obra(sim, c.obra)!.construtores;
    expect(construtores).toHaveLength(1 + param('max_assistentes'));
    expect(construtores[0]).toBe(c.impressora);
  });
});

describe('T-055 — PRD-18, PRD-19: reparo', () => {
  function danificado(sim: Sim) {
    const [nave] = criar(sim, [{ estrutura: 'ship', x: 0, z: 0 }]);
    vida(sim, nave!).hp -= 1000;
    return nave!;
  }

  it('PRD-18: taxas por reparador e tipo de alvo, gastando só energia', () => {
    const casos = [
      ['hover_explorer', 'estrutura', 'reparo_hover_estrutura_hp_s', 'en_reparo_hover_s'],
      ['printer', 'estrutura', 'reparo_impressora_estrutura_hp_s', 'en_reparo_impressora_s'],
      ['hover_explorer', 'unidade', 'reparo_hover_unidade_hp_s', 'en_reparo_hover_s'],
      ['printer', 'unidade', 'reparo_impressora_unidade_hp_s', 'en_reparo_impressora_s'],
    ] as const;
    for (const [reparador, alvoTipo, taxa, energia] of casos) {
      const sim = partida(mundoLiso());
      const estoque = { ...sim.state.estoques.bra };
      const [alvoId] =
        alvoTipo === 'estrutura'
          ? criar(sim, [{ estrutura: 'storage', x: 0, z: 0 }])
          : criar(sim, [{ unidade: 'hover_opq', x: 0, z: 0 }]);
      vida(sim, alvoId!).hp -= 100;
      const [r] = criar(sim, [{ unidade: reparador, x: 0, z: -14 }]);
      bateria(sim, r!).autoRecarga = false;
      ordenar(sim, 'reparar', { ids: [r], alvo: alvoId });
      const hp = () => vida(sim, alvoId!).hp;
      const inicio = hp();
      expect(
        rodarAte(sim, () => hp() > inicio, 20),
        `${reparador}→${alvoTipo}`,
      ).toBe(true);
      expect(paradas(sim, [r!])).toBe(true);
      const h0 = hp();
      const e0 = bateria(sim, r!).en;
      sim.run(sim.tickHz);
      expect(hp() - h0, `${reparador}→${alvoTipo}`).toBeCloseTo(param(taxa), 6);
      expect(e0 - bateria(sim, r!).en).toBeCloseTo(param(energia), 6);
      expect(sim.state.estoques.bra).toEqual(estoque);
    }
  });

  it('PRD-18: no máximo max_reparadores por alvo', () => {
    const sim = partida(mundoLiso());
    const nave = danificado(sim);
    const hovers = criar(
      sim,
      Array.from({ length: param('max_reparadores') + 2 }, (_, k) => ({
        unidade: 'hover_explorer' as const,
        x: 14 * Math.cos((k * Math.PI) / 3),
        z: 14 * Math.sin((k * Math.PI) / 3),
      })),
    );
    ordenar(sim, 'reparar', { ids: hovers, alvo: nave });
    sim.run(15 * sim.tickHz);
    const h0 = vida(sim, nave).hp;
    sim.run(sim.tickHz);
    expect(vida(sim, nave).hp - h0).toBeCloseTo(
      param('reparo_hover_estrutura_hp_s') * param('max_reparadores'),
      6,
    );
  });

  it('PRD-18: drones só são reparados pousados', () => {
    const sim = partida(mundoLiso());
    const [drone] = criar(sim, [{ unidade: 'drone_laser', x: 0, z: 0 }]);
    bateria(sim, drone!).autoRecarga = false;
    vida(sim, drone!).hp -= 50;
    const [h] = criar(sim, [{ unidade: 'hover_explorer', x: 3, z: 0 }]);
    ordenar(sim, 'reparar', { ids: [h], alvo: drone });
    sim.run(10);
    expect(vida(sim, drone!).hp).toBe(statsMovel('drone_laser').hp - 50);
    const air = getComponent(sim.state, drone!, 'air')!;
    expect(rodarAte(sim, () => air.estado === 'pousado', 30)).toBe(true);
    sim.run(sim.tickHz);
    expect(vida(sim, drone!).hp).toBeGreaterThan(statsMovel('drone_laser').hp - 50);
  });

  it('PRD-19: Impressora ociosa repara estruturas próprias a até raio_reparo_auto_m', () => {
    const sim = partida(mundoLiso());
    const nave = danificado(sim);
    const borda = getComponent(sim.state, nave, 'obstacle')!.raio;
    const r = statsMovel('printer').raio_m;
    const [perto, longe] = criar(sim, [
      { unidade: 'printer', x: borda + r + param('raio_reparo_auto_m') - 1, z: 0 },
      { unidade: 'printer', x: -(borda + r + param('raio_reparo_auto_m') + 2), z: 0 },
    ]);
    passo(sim);
    expect(getComponent(sim.state, perto!, 'trabalho')).toMatchObject({
      tipo: 'reparar',
      alvo: nave,
      auto: true,
    });
    expect(getComponent(sim.state, longe!, 'trabalho')).toBeUndefined();
    const hp = vida(sim, nave).hp;
    sim.run(15 * sim.tickHz);
    expect(vida(sim, nave).hp).toBeGreaterThan(hp);
  });
});

describe('ENE-16 — Impressora e auto-recarga', () => {
  it('ENE-16: com a bateria no limiar, pausa, vai recarregar, volta e retoma a impressão', () => {
    const sim = partida(mundoLiso());
    rico(sim);
    const [nave, impressora] = criar(sim, [
      { estrutura: 'ship', x: 0, z: 0 },
      { unidade: 'printer', x: 40, z: 0 },
    ]);
    ordenar(sim, 'debug_encher_banco', {});
    // D-92: EX1 saiu da Impressora; qualquer item ainda dela serve pra este teste de recarga.
    ordenar(sim, 'imprimir', { ids: [impressora], item: 'hover_scout' });
    sim.run(sim.tickHz);
    const b = bateria(sim, impressora!);
    b.en = (b.max * param('auto_recarga_impressora_pct')) / 100;
    passo(sim);
    const recarga = getComponent(sim.state, impressora!, 'recarga')!;
    expect(recarga.estado).toBe('indo');
    const guardado = fila(sim, impressora!)[0]!.progresso;
    expect(rodarAte(sim, () => recarga.estado === 'acoplada', 30)).toBe(true);
    expect(fila(sim, impressora!)[0]!.progresso).toBe(guardado);
    expect(rodarAte(sim, () => unidadesDo(sim, 'hover_scout').length === 1, 120)).toBe(true);
    const p = pos(sim, impressora!);
    expect(Math.hypot(p.x - 40, p.z)).toBeLessThan(1);
    expect(nave).toBeDefined();
  });
});

describe('T-056 — REG-04 a REG-08: início de partida', () => {
  function iniciar(modo: 'padrao' | 'alto') {
    const sim = partida(mundoLiso());
    const [j] = semear(sim, [{ recurso: 'fe', quantidade: 1500, x: 30, z: 0 }]);
    ordenar(sim, INICIAR_PARTIDA_COMMAND, {
      modo,
      nacoes: [
        { nacao: 'bra', zona: ponto(0, 0) },
        { nacao: 'usa', zona: ponto(0, 120) },
      ],
    });
    passo(sim);
    return { sim, jazida: j! };
  }

  it('REG-04: cada nação começa com 1 Nave e 1 Hover de Exploração saindo dela', () => {
    const { sim } = iniciar('padrao');
    for (const nacao of ['bra', 'usa'] as const) {
      const corpos = sim.state.entities.filter(
        (id) => getComponent(sim.state, id, 'owner')?.nacao === nacao,
      );
      const tipos = corpos.map(
        (id) =>
          getComponent(sim.state, id, 'structure')?.tipo ??
          getComponent(sim.state, id, 'unit')?.tipo,
      );
      expect(tipos.sort()).toEqual(['hover_explorer', 'ship']);
    }
  });

  it('REG-05/REG-06: estoque inicial pelo modo e banco cheio', () => {
    for (const modo of ['padrao', 'alto'] as const) {
      const { sim } = iniciar(modo);
      const linha = dados.estoque_inicial.find((e) => e.modo === modo)!;
      for (const r of RECURSOS) expect(sim.state.estoques.bra[r], `${modo} ${r}`).toBe(linha[r]);
      expect(sim.state.energia.bra.banco).toBe(statsEstrutura('ship').banco_en);
    }
  });

  it('REG-05: o estoque padrão paga 1 Hover extra e o Cu e o Li da Impressora (D-30)', () => {
    const padrao = dados.estoque_inicial.find((e) => e.modo === 'padrao')!;
    const hover = custoDe('hover_explorer');
    const impressora = custoDe('printer');
    for (const r of RECURSOS) expect(padrao[r]).toBeGreaterThanOrEqual(hover[r]);
    expect(padrao.cu - hover.cu).toBeGreaterThanOrEqual(impressora.cu);
    expect(padrao.li - hover.li).toBeGreaterThanOrEqual(impressora.li);
    expect(padrao.fe - hover.fe).toBeLessThan(impressora.fe);
  });

  it('REG-08: o hover inicial começa a coletar sozinho pela Diretiva', () => {
    const { sim, jazida } = iniciar('padrao');
    const [h] = unidadesDo(sim, 'hover_explorer').filter(
      (id) => getComponent(sim.state, id, 'owner')!.nacao === 'bra',
    );
    const coleta = () => getComponent(sim.state, h!, 'coleta')!;
    expect(rodarAte(sim, () => coleta().estado === 'minerando', 30)).toBe(true);
    expect(coleta().jazida).toBe(jazida);
  });
});
