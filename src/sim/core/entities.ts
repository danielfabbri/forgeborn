import type { ComponentMap, ComponentName } from './components';
import type { ComponentStores, SimState } from './state';
import type { EntityId } from './types';

function store<K extends ComponentName>(
  state: SimState,
  name: K,
): Record<EntityId, ComponentMap[K]> {
  const stores = state.components as ComponentStores;
  return (stores[name] ??= {}) as Record<EntityId, ComponentMap[K]>;
}

/** Cria uma entidade com ID novo; IDs só crescem, então `entities` segue ordenado. */
export function createEntity(state: SimState): EntityId {
  const id = state.nextEntityId++;
  state.entities.push(id);
  return id;
}

export function isAlive(state: SimState, id: EntityId): boolean {
  return indexOf(state.entities, id) >= 0;
}

export function destroyEntity(state: SimState, id: EntityId): void {
  const index = indexOf(state.entities, id);
  if (index < 0) return;
  state.entities.splice(index, 1);
  for (const components of Object.values(state.components)) {
    if (components) delete (components as Record<EntityId, unknown>)[id];
  }
}

export function setComponent<K extends ComponentName>(
  state: SimState,
  id: EntityId,
  name: K,
  data: ComponentMap[K],
): void {
  if (!isAlive(state, id)) throw new Error(`Entidade ${id} não existe`);
  store(state, name)[id] = data;
}

export function getComponent<K extends ComponentName>(
  state: SimState,
  id: EntityId,
  name: K,
): ComponentMap[K] | undefined {
  return (state.components as ComponentStores)[name]?.[id] as ComponentMap[K] | undefined;
}

export function removeComponent(state: SimState, id: EntityId, name: ComponentName): void {
  const components = (state.components as ComponentStores)[name];
  if (components) delete (components as Record<EntityId, unknown>)[id];
}

/** Entidades que têm todos os componentes pedidos, em ordem crescente de ID. */
export function entitiesWith(state: SimState, ...names: ComponentName[]): EntityId[] {
  const stores = names.map((name) => (state.components as ComponentStores)[name]);
  if (stores.some((s) => s === undefined)) return [];
  return state.entities.filter((id) => stores.every((s) => s !== undefined && id in s));
}

/** Busca binária em lista ordenada de IDs. */
function indexOf(ids: EntityId[], id: EntityId): number {
  let low = 0;
  let high = ids.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = ids[mid]!;
    if (value === id) return mid;
    if (value < id) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}
