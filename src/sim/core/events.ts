import type { SimEvent } from './types';

export type EventHandler = (event: SimEvent) => void;

/**
 * TEC-09: barramento de eventos da simulação. Render, UI e áudio só escutam;
 * os eventos chegam congelados e não dão acesso ao estado.
 */
export class EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();

  /** Escuta um tipo de evento, ou todos com `'*'`. Devolve a função que cancela a escuta. */
  on(tipo: string, handler: EventHandler): () => void {
    const set = this.handlers.get(tipo) ?? new Set<EventHandler>();
    set.add(handler);
    this.handlers.set(tipo, set);
    return () => set.delete(handler);
  }

  publish(events: readonly SimEvent[]): void {
    for (const event of events) {
      for (const handler of this.handlers.get(event.tipo) ?? []) handler(event);
      for (const handler of this.handlers.get('*') ?? []) handler(event);
    }
  }
}
