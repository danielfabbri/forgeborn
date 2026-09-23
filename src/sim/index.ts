// Simulação determinística pura (TEC-03): API pública para render, UI, IA e ferramentas.
export type { ComponentMap, ComponentName } from './core/components';
export {
  createEntity,
  destroyEntity,
  entitiesWith,
  getComponent,
  isAlive,
  removeComponent,
  setComponent,
} from './core/entities';
export { EventBus, type EventHandler } from './core/events';
export { canonicalJson, hashString, hashValue } from './core/hash';
export {
  type CommandHandler,
  type GameSystemId,
  SYSTEM_ORDER,
  type SystemContext,
  type SystemFn,
  type SystemId,
} from './core/pipeline';
export { nextFloat, nextInt, nextU32, type RngState, seedRng } from './core/rng';
export { createSim, restoreSim, type Sim, type SimOptions } from './core/sim';
export type { SimState } from './core/state';
export type { Command, EntityId, JsonValue, NacaoId, QueuedCommand, SimEvent } from './core/types';
export { dados, param } from './data';
