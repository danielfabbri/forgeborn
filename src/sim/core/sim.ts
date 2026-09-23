import { param } from '../data';
import { EventBus } from './events';
import { hashValue } from './hash';
import {
  type CommandHandler,
  type GameSystemId,
  SYSTEM_ORDER,
  type SystemContext,
  type SystemFn,
} from './pipeline';
import type { Mundo } from '../map/mundo';
import { createInitialState, type SimState } from './state';
import type { Command, JsonValue, NacaoId, QueuedCommand, SimEvent } from './types';

const SNAPSHOT_FORMAT = 1;

export interface SimOptions {
  /** Implementações dos sistemas plugáveis; ausentes rodam como no-op. */
  systems?: Partial<Record<GameSystemId, SystemFn>>;
  /** Tratadores de Comando por `tipo`. */
  commandHandlers?: Record<string, CommandHandler>;
  /** Mapa e grades da partida. */
  mundo?: Mundo;
}

export interface Sim {
  /** Estado atual. Só a própria simulação altera o estado. */
  readonly state: SimState;
  readonly bus: EventBus;
  /** Ticks por segundo de simulação (`tick_hz`). */
  readonly tickHz: number;
  /** Agenda um Comando para `command.tick` (maior ou igual ao tick atual). */
  enqueue(command: Command): void;
  /** Executa um tick e devolve os eventos emitidos nele. */
  step(): readonly SimEvent[];
  run(ticks: number): void;
  /** Estado serializado em JSON (TEC-08). */
  snapshot(): string;
  /** Hash determinístico do estado. */
  hash(): string;
}

export function createSim(seed: number, nacoes: NacaoId[], options: SimOptions = {}): Sim {
  return buildSim(createInitialState(seed, nacoes), options);
}

export function restoreSim(snapshot: string, options: SimOptions = {}): Sim {
  const parsed = JSON.parse(snapshot) as { formato?: number; state?: SimState };
  if (parsed.formato !== SNAPSHOT_FORMAT || !parsed.state) {
    throw new Error(`Snapshot em formato desconhecido: ${String(parsed.formato)}`);
  }
  return buildSim(parsed.state, options);
}

function buildSim(state: SimState, options: SimOptions): Sim {
  const tickHz = param('tick_hz');
  const visionEvery = tickHz / param('nevoa_atualizacao_hz');
  if (!Number.isInteger(visionEvery) || visionEvery < 1) {
    throw new Error('tick_hz precisa ser múltiplo de nevoa_atualizacao_hz (TEC-06)');
  }
  const dt = 1 / tickHz;
  const systems = options.systems ?? {};
  const handlers = options.commandHandlers ?? {};
  const bus = new EventBus();

  const enqueue = (command: Command): void => {
    if (!Number.isInteger(command.tick) || command.tick < state.tick) {
      throw new Error(`Comando para o tick ${command.tick}, mas o próximo tick é ${state.tick}`);
    }
    if (!state.nacoes.includes(command.nacao)) {
      throw new Error(`Nação ${command.nacao} não participa desta partida`);
    }
    // Cópia via JSON: garante que o comando é serializável e isolado de quem o enviou.
    const dados = JSON.parse(JSON.stringify(command.dados)) as JsonValue;
    state.commandQueue.push({
      tick: command.tick,
      nacao: command.nacao,
      tipo: command.tipo,
      dados,
      seq: state.nextCommandSeq++,
    });
  };

  const step = (): readonly SimEvent[] => {
    const tick = state.tick;
    const events: SimEvent[] = [];
    const ordem = (c: QueuedCommand) => state.nacoes.indexOf(c.nacao);
    const commands = state.commandQueue
      .filter((c) => c.tick === tick)
      .sort((a, b) => ordem(a) - ordem(b) || a.seq - b.seq);
    state.commandQueue = state.commandQueue.filter((c) => c.tick > tick);

    const ctx: SystemContext = {
      state,
      tick,
      dt,
      commands,
      mundo: options.mundo ?? null,
      emit: (tipo, dados) => {
        events.push({ tick, tipo, dados });
      },
    };

    for (const id of SYSTEM_ORDER) {
      if (id === 'comandos') {
        for (const command of commands) {
          const handler = handlers[command.tipo];
          if (handler) handler(ctx, command);
          else ctx.emit('comando_desconhecido', { tipo: command.tipo, nacao: command.nacao });
        }
      } else if (id === 'eventos') {
        for (const event of events) Object.freeze(event);
        bus.publish(events);
      } else if (id !== 'visao' || tick % visionEvery === 0) {
        systems[id]?.(ctx);
      }
    }

    state.tick = tick + 1;
    return events;
  };

  return {
    state,
    bus,
    tickHz,
    enqueue,
    step,
    run: (ticks) => {
      for (let i = 0; i < ticks; i++) step();
    },
    snapshot: () => JSON.stringify({ formato: SNAPSHOT_FORMAT, state }),
    hash: () => hashValue(state),
  };
}
