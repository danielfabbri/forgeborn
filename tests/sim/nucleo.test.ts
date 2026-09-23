import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  type Command,
  createEntity,
  createSim,
  destroyEntity,
  entitiesWith,
  type GameSystemId,
  getComponent,
  hashValue,
  isAlive,
  nextFloat,
  nextInt,
  nextU32,
  param,
  restoreSim,
  type RngState,
  seedRng,
  setComponent,
  type SimEvent,
  type SimOptions,
  type Sim,
  SYSTEM_ORDER,
  type SystemFn,
} from '../../src/sim';

describe('TEC-05: RNG seedado', () => {
  it('segue o vetor de referência do xoshiro128**', () => {
    const estado: RngState = [1, 2, 3, 4];
    const saida = [nextU32(estado), nextU32(estado), nextU32(estado), nextU32(estado)];
    expect(saida).toEqual([11520, 0, 5927040, 70819200]);
  });

  it('mesma seed dá a mesma sequência; seeds diferentes, sequências diferentes', () => {
    const sequencia = (estado: RngState) => Array.from({ length: 8 }, () => nextU32(estado));
    expect(sequencia(seedRng(42))).toEqual(sequencia(seedRng(42)));
    expect(sequencia(seedRng(42))).not.toEqual(sequencia(seedRng(43)));
  });

  it('nextFloat fica em [0, 1) e nextInt respeita os limites', () => {
    const estado = seedRng(7);
    const reais = Array.from({ length: 10_000 }, () => nextFloat(estado));
    const inteiros = Array.from({ length: 10_000 }, () => nextInt(estado, -3, 3));
    expect(Math.min(...reais)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...reais)).toBeLessThan(1);
    expect(new Set(inteiros)).toEqual(new Set([-3, -2, -1, 0, 1, 2, 3]));
  });
});

describe('TEC-05: hash de estado', () => {
  it('não depende da ordem das chaves', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
    expect(hashValue({ a: 1, b: 2 })).toBe(hashValue({ b: 2, a: 1 }));
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
  });
});

describe('TEC-06: entidades e componentes', () => {
  it('IDs só crescem, componentes somem com a entidade e a iteração segue a ordem dos IDs', () => {
    const estado = createSim(1, ['usa']).state;
    const [a, b, c] = [createEntity(estado), createEntity(estado), createEntity(estado)];
    expect([a, b, c]).toEqual([1, 2, 3]);

    setComponent(estado, c, 'position', { x: 3, y: 0, z: 0 });
    setComponent(estado, a, 'position', { x: 1, y: 0, z: 0 });
    setComponent(estado, a, 'owner', { nacao: 'usa' });
    expect(entitiesWith(estado, 'position')).toEqual([a, c]);
    expect(entitiesWith(estado, 'position', 'owner')).toEqual([a]);

    destroyEntity(estado, a);
    expect(isAlive(estado, a)).toBe(false);
    expect(getComponent(estado, a, 'position')).toBeUndefined();
    expect(entitiesWith(estado, 'position')).toEqual([c]);
    expect(createEntity(estado)).toBe(4);
  });

  it('recusa partida sem nações ou com nação repetida', () => {
    expect(() => createSim(1, [])).toThrow();
    expect(() => createSim(1, ['usa', 'usa'])).toThrow();
  });
});

describe('TEC-07: comandos', () => {
  it('executa cada comando no seu tick, na ordem das nações e depois na de chegada', () => {
    const log: string[] = [];
    const sim = createSim(1, ['usa', 'chn'], {
      commandHandlers: {
        marcar: (ctx, comando) => log.push(`${ctx.tick}:${comando.nacao}:${String(comando.dados)}`),
      },
    });
    sim.enqueue({ tick: 2, nacao: 'chn', tipo: 'marcar', dados: 'c1' });
    sim.enqueue({ tick: 2, nacao: 'usa', tipo: 'marcar', dados: 'u1' });
    sim.enqueue({ tick: 2, nacao: 'chn', tipo: 'marcar', dados: 'c2' });
    sim.enqueue({ tick: 0, nacao: 'usa', tipo: 'marcar', dados: 'u0' });
    sim.run(3);
    expect(log).toEqual(['0:usa:u0', '2:usa:u1', '2:chn:c1', '2:chn:c2']);
  });

  it('recusa comando no passado ou de nação fora da partida', () => {
    const sim = createSim(1, ['usa']);
    sim.run(5);
    expect(() => sim.enqueue({ tick: 4, nacao: 'usa', tipo: 'x', dados: null })).toThrow(/tick 4/);
    expect(() => sim.enqueue({ tick: 5, nacao: 'bra', tipo: 'x', dados: null })).toThrow(/bra/);
  });

  it('guarda uma cópia do comando e avisa quando o tipo é desconhecido', () => {
    const sim = createSim(1, ['usa']);
    const dados = { alvo: 1 };
    sim.enqueue({ tick: 0, nacao: 'usa', tipo: 'inexistente', dados });
    dados.alvo = 99;
    expect(sim.state.commandQueue[0]?.dados).toEqual({ alvo: 1 });
    expect(sim.step()).toEqual([
      { tick: 0, tipo: 'comando_desconhecido', dados: { tipo: 'inexistente', nacao: 'usa' } },
    ]);
  });
});

describe('TEC-06: ordem dos sistemas', () => {
  const sistemasDeJogo = SYSTEM_ORDER.filter(
    (id): id is GameSystemId => id !== 'comandos' && id !== 'eventos',
  );

  function simComRegistro(chamadas: string[]): Sim {
    const systems: Partial<Record<GameSystemId, SystemFn>> = {};
    for (const id of sistemasDeJogo) systems[id] = (ctx) => chamadas.push(`${ctx.tick}:${id}`);
    const sim = createSim(1, ['usa'], {
      systems,
      commandHandlers: {
        marcar: (ctx) => {
          chamadas.push(`${ctx.tick}:comandos`);
          ctx.emit('fim', null);
        },
      },
    });
    sim.bus.on('fim', (evento) => chamadas.push(`${evento.tick}:eventos`));
    return sim;
  }

  it('segue comandos → ia → produção → energia → movimento → economia → combate → projéteis → morte → visão → eventos', () => {
    const chamadas: string[] = [];
    const sim = simComRegistro(chamadas);
    sim.enqueue({ tick: 0, nacao: 'usa', tipo: 'marcar', dados: null });
    sim.step();
    expect(chamadas).toEqual(SYSTEM_ORDER.map((id) => `0:${id}`));
  });

  it('roda a visão a cada tick_hz / nevoa_atualizacao_hz ticks', () => {
    const chamadas: string[] = [];
    const sim = simComRegistro(chamadas);
    sim.run(9);
    const intervalo = param('tick_hz') / param('nevoa_atualizacao_hz');
    expect(intervalo).toBe(4);
    expect(chamadas.filter((c) => c.endsWith(':visao'))).toEqual(['0:visao', '4:visao', '8:visao']);
  });

  it('REG-20: o passo fixo vem de tick_hz', () => {
    let dt = 0;
    const sim = createSim(1, ['usa'], { systems: { movimento: (ctx) => (dt = ctx.dt) } });
    sim.step();
    expect(sim.tickHz).toBe(param('tick_hz'));
    expect(dt).toBeCloseTo(1 / param('tick_hz'));
  });
});

describe('TEC-09: eventos', () => {
  it('step devolve os eventos do tick, o barramento recebe e eles chegam congelados', () => {
    const recebidos: SimEvent[] = [];
    const sim = createSim(1, ['usa'], {
      systems: { combate: (ctx) => ctx.emit('dano', { alvo: 7, valor: 14 }) },
    });
    sim.bus.on('dano', (evento) => recebidos.push(evento));
    const eventos = sim.step();
    expect(eventos).toEqual([{ tick: 0, tipo: 'dano', dados: { alvo: 7, valor: 14 } }]);
    expect(recebidos).toEqual(eventos);
    expect(Object.isFrozen(eventos[0])).toBe(true);
  });
});

/** Cenário de teste: comandos criam e destroem corpos que andam ao acaso com o RNG da simulação. */
const opcoesDeTeste: SimOptions = {
  commandHandlers: {
    criar: (ctx, comando) => {
      const id = createEntity(ctx.state);
      setComponent(ctx.state, id, 'owner', { nacao: comando.nacao });
      setComponent(ctx.state, id, 'position', {
        x: nextFloat(ctx.state.rng) * 100,
        y: 0,
        z: nextFloat(ctx.state.rng) * 100,
      });
    },
    destruir: (ctx) => {
      const alvo = ctx.state.entities[0];
      if (alvo !== undefined) destroyEntity(ctx.state, alvo);
    },
  },
  systems: {
    movimento: (ctx) => {
      for (const id of entitiesWith(ctx.state, 'position')) {
        const posicao = getComponent(ctx.state, id, 'position')!;
        posicao.x += (nextFloat(ctx.state.rng) - 0.5) * ctx.dt * 6;
        posicao.z += (nextFloat(ctx.state.rng) - 0.5) * ctx.dt * 6;
      }
    },
  },
};

const roteiro: Command[] = [
  { tick: 0, nacao: 'usa', tipo: 'criar', dados: null },
  { tick: 0, nacao: 'chn', tipo: 'criar', dados: null },
  { tick: 150, nacao: 'usa', tipo: 'criar', dados: null },
  { tick: 4000, nacao: 'chn', tipo: 'destruir', dados: null },
  { tick: 7500, nacao: 'usa', tipo: 'criar', dados: null },
];

function partida(seed: number): Sim {
  const sim = createSim(seed, ['usa', 'chn'], opcoesDeTeste);
  for (const comando of roteiro) sim.enqueue(comando);
  return sim;
}

describe('TEC-05/TEC-08: determinismo e snapshot (aceite da T-006)', () => {
  it('mesma seed + mesmos comandos ⇒ hash idêntico após 10.000 ticks', () => {
    const a = partida(42);
    const b = partida(42);
    a.run(10_000);
    b.run(10_000);
    expect(a.state.tick).toBe(10_000);
    expect(a.state.entities).toHaveLength(3);
    expect(a.hash()).toBe(b.hash());

    const outraSeed = partida(43);
    outraSeed.run(10_000);
    expect(outraSeed.hash()).not.toBe(a.hash());
  });

  it('snapshot → restauração → mesmo hash, inclusive no fim da partida', () => {
    const inteira = partida(42);
    inteira.run(10_000);

    const metade = partida(42);
    metade.run(5_000);
    const restaurada = restoreSim(metade.snapshot(), opcoesDeTeste);
    expect(restaurada.hash()).toBe(metade.hash());

    restaurada.run(5_000);
    expect(restaurada.hash()).toBe(inteira.hash());
  });

  it('recusa snapshot em formato desconhecido', () => {
    expect(() => restoreSim('{"formato":99}')).toThrow(/formato/);
  });
});
