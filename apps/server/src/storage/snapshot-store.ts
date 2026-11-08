import { AsyncLocalStorage } from 'node:async_hooks';
import { MemoryStore, type Store } from '@habit/core';
import type { VersionedObject } from './object-storage';
import { parseSnapshot } from './snapshot';

const DEFAULT_MAX_ATTEMPTS = 4;

export class StoreConflictError extends Error {
  constructor(attempts: number) {
    super(`data changed concurrently ${attempts} times in a row; giving up`);
    this.name = 'StoreConflictError';
  }
}

export interface SnapshotStore {
  /** Works only inside `transaction`; each transaction sees its own copy of the data. */
  store: Store;
  /**
   * Loads the snapshot, runs `work` against it and saves it if anything changed. If another
   * instance saved in between, the save is refused and `work` runs again on the fresh data,
   * so no change is lost. Side effects inside `work` (Telegram messages) may then repeat;
   * with a handful of users such races are rare, and a duplicate beats a lost check.
   */
  transaction<T>(work: () => Promise<T>): Promise<T>;
}

/** The whole data set as one JSON object, guarded by conditional writes. */
export function createSnapshotStore(
  object: VersionedObject,
  options: { maxAttempts?: number; source?: string } = {},
): SnapshotStore {
  const { maxAttempts = DEFAULT_MAX_ATTEMPTS, source = 'stored snapshot' } = options;
  /** `open` turns false when the transaction ends, so late background work cannot write unseen. */
  const current = new AsyncLocalStorage<{ memory: MemoryStore; open: boolean }>();

  // Services get one long-lived Store; it forwards to the transaction running in this async context.
  const store = new Proxy({} as Store, {
    get(_target, property) {
      // Not a promise or a JSON value: `await`, logging and JSON.stringify probe these.
      if (typeof property === 'symbol' || property === 'then' || property === 'toJSON') return undefined;
      const active = current.getStore();
      if (!active) throw new Error('store used outside a transaction');
      if (!active.open) throw new Error('store used after its transaction ended; that change would be lost');
      const value: unknown = Reflect.get(active.memory, property, active.memory);
      return typeof value === 'function' ? value.bind(active.memory) : value;
    },
  });

  async function transaction<T>(work: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { body, etag } = await object.read();
      const snapshot = body === null ? undefined : parseSnapshot(body, source);
      let dirty = false;
      const memory = new MemoryStore(snapshot, () => {
        dirty = true;
      });
      const context = { memory, open: true };
      let result: T;
      try {
        result = await current.run(context, work);
      } finally {
        context.open = false;
      }
      if (!dirty) return result;
      const saved = await object.write(JSON.stringify(memory.snapshot()), etag);
      if (saved.ok) return result;
      console.warn(`[store] concurrent write detected, retrying (${attempt}/${maxAttempts})`);
    }
    throw new StoreConflictError(maxAttempts);
  }

  return { store, transaction };
}
