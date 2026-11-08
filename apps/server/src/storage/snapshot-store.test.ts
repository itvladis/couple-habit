import { describe, expect, it } from 'vitest';
import type { Store, User } from '@habit/core';
import { describeStoreContract } from '@habit/core/store-contract';
import type { VersionedObject } from './object-storage';
import { createSnapshotStore, StoreConflictError } from './snapshot-store';

const user = (id: number, firstName = `User ${id}`): User => ({
  id, firstName, lastName: null, username: null, photoUrl: null, telegramLanguage: 'ru',
  language: null, theme: 'auto', timeZone: 'Europe/Moscow', timeZoneManual: false, remindersEnabled: true,
  weeklySummary: { enabled: true, weekday: 7, time: '20:00' }, lastWeeklySummaryWeek: null, canMessage: true,
  createdAt: '2026-11-08T00:00:00Z',
});

/** In-memory object with real ETag semantics; `beforeWrite` lets a test slip in a concurrent writer. */
function fakeObject(initial: string | null = null) {
  let body = initial;
  let version = initial === null ? 0 : 1;
  const writes: string[] = [];
  const object: VersionedObject & { beforeWrite?: () => Promise<void> | void; body: () => string | null; writes: string[] } = {
    async read() {
      return { body, etag: body === null ? null : `"v${version}"` };
    },
    async write(next, etag) {
      await object.beforeWrite?.();
      const current = body === null ? null : `"v${version}"`;
      if (etag !== current) return { ok: false };
      body = next;
      version++;
      writes.push(next);
      return { ok: true, etag: `"v${version}"` };
    },
    body: () => body,
    writes,
  };
  return object;
}

/** Writes a user the way another function instance would: read, change, conditional write. */
async function writeFromElsewhere(object: VersionedObject, u: User) {
  const other = createSnapshotStore(object);
  await other.transaction(() => other.store.saveUser(u));
}

describe('createSnapshotStore', () => {
  it('refuses to be used outside a transaction', async () => {
    const { store } = createSnapshotStore(fakeObject());

    expect(() => store.getUser(1)).toThrow(/outside a transaction/);
  });

  it('saves changes and reads them back in the next transaction', async () => {
    const object = fakeObject();
    const { store, transaction } = createSnapshotStore(object);

    await transaction(() => store.saveUser(user(1, 'Влад')));
    const saved = await transaction(() => store.getUser(1));

    expect(saved?.firstName).toBe('Влад');
    expect(object.writes).toHaveLength(1);
  });

  it('does not write when the work only reads', async () => {
    const object = fakeObject();
    await writeFromElsewhere(object, user(1));
    const { store, transaction } = createSnapshotStore(object);

    await transaction(() => store.listUsers());

    expect(object.writes).toHaveLength(1);
  });

  it('returns what the work returns', async () => {
    const { transaction } = createSnapshotStore(fakeObject());

    expect(await transaction(async () => 42)).toBe(42);
  });

  it('reruns the work on a concurrent write so neither change is lost', async () => {
    const object = fakeObject();
    const { store, transaction } = createSnapshotStore(object);
    let runs = 0;
    object.beforeWrite = () => {
      object.beforeWrite = undefined;
      return writeFromElsewhere(object, user(2, 'Other'));
    };

    await transaction(async () => {
      runs++;
      await store.saveUser(user(1, 'Mine'));
    });
    const names = await transaction(async () => (await store.listUsers()).map((u) => u.firstName).sort());

    expect(runs).toBe(2);
    expect(names).toEqual(['Mine', 'Other']);
  });

  it('gives up after repeated conflicts', async () => {
    const object = fakeObject();
    object.write = async () => ({ ok: false });
    const { store, transaction } = createSnapshotStore(object, { maxAttempts: 3 });
    let runs = 0;

    const result = transaction(async () => {
      runs++;
      await store.saveUser(user(1));
    });

    await expect(result).rejects.toBeInstanceOf(StoreConflictError);
    expect(runs).toBe(3);
  });

  it('does not write anything when the work fails', async () => {
    const object = fakeObject();
    const { store, transaction } = createSnapshotStore(object);

    const result = transaction(async () => {
      await store.saveUser(user(1));
      throw new Error('boom');
    });

    await expect(result).rejects.toThrow('boom');
    expect(object.writes).toHaveLength(0);
  });

  it('refuses a corrupt snapshot instead of overwriting it', async () => {
    const object = fakeObject('{"users": "nope"}');
    const { store, transaction } = createSnapshotStore(object);

    await expect(transaction(() => store.saveUser(user(1)))).rejects.toThrow(/not a valid data snapshot/);
    expect(object.body()).toBe('{"users": "nope"}');
  });

  it('refuses store use after its transaction has finished', async () => {
    const { store, transaction } = createSnapshotStore(fakeObject());
    let late: Promise<unknown> = Promise.resolve();

    await transaction(async () => {
      late = new Promise((done) => setTimeout(done, 5)).then(() => store.getUser(1));
    });

    await expect(late).rejects.toThrow(/after its transaction/);
  });

  it('can be logged outside a transaction without throwing', () => {
    const { store } = createSnapshotStore(fakeObject());

    expect(() => JSON.stringify(store)).not.toThrow();
    expect(() => String(Object.prototype.toString.call(store))).not.toThrow();
  });

  it('keeps concurrent transactions in one instance apart', async () => {
    const object = fakeObject();
    const { store, transaction } = createSnapshotStore(object);
    await transaction(() => store.saveUser(user(1, 'Before')));

    const [seenByReader] = await Promise.all([
      transaction(async () => {
        await new Promise((done) => setTimeout(done, 5));
        return (await store.getUser(1))?.firstName;
      }),
      transaction(() => store.saveUser(user(1, 'After'))),
    ]);

    expect(seenByReader).toBe('Before');
  });
});

// Every call in its own transaction: each read goes through the stored JSON, so a write method
// that forgot to report a change would fail here instead of silently losing data in production.
describeStoreContract('SnapshotStore', async () => {
  const { store, transaction } = createSnapshotStore(fakeObject());
  return new Proxy({} as Store, {
    get: (_target, property) =>
      property === 'then'
        ? undefined
        : (...args: unknown[]) =>
            transaction(() => (Reflect.get(store, property) as (...a: unknown[]) => Promise<unknown>)(...args)),
  });
});
