export type Handler<Payload> = (payload: Payload) => void;

export type TypedEmitter<EventMap extends Record<string, any>> = {
  on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): () => void;
  off<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): void;
  once<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): () => void;
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void;
};

export function createTypedEmitter<EventMap extends Record<string, any>>(): TypedEmitter<EventMap> {
  const listeners = new Map<keyof EventMap, Set<Handler<any>>>();

  function on<K extends keyof EventMap>(
    event: K,
    handler: Handler<EventMap[K]>,
  ): () => void {
    const set = listeners.get(event) ?? new Set<Handler<EventMap[K]>>();
    set.add(handler);
    listeners.set(event, set);
    return () => off(event, handler);
  }

  function off<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): void {
    const set = listeners.get(event);
    if (!set) return;
    set.delete(handler as Handler<any>);
    if (set.size === 0) listeners.delete(event);
  }

  function once<K extends keyof EventMap>(
    event: K,
    handler: Handler<EventMap[K]>,
  ): () => void {
    const unsub = on(event, (payload) => {
      unsub();
      handler(payload);
    });
    return unsub;
  }

  function emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = listeners.get(event);
    if (!set || set.size === 0) return;
    // Snapshot to prevent mutation during emit from affecting iteration order.
    const snapshot = [...set];
    for (const fn of snapshot) {
      try {
        fn(payload);
      } catch {
        // Listener errors are isolated by design.
      }
    }
  }

  return { on, off, once, emit };
}

