import { describe, expect, it } from 'vitest';
import { MemoryStore } from './memory';
import { describeStoreContract } from './store-contract';

const event = (id: string) => ({
  id, type: 'habit_created' as const, actorId: 1, habitId: null, otherUserId: null, date: null, createdAt: '2026-11-08T00:00:00Z',
});

describe('MemoryStore events', () => {
  it('pages through events with ids containing "-" and "_" without losing any', async () => {
    const store = new MemoryStore();
    // Same time prefix; suffixes chosen so that localeCompare and "<" disagree.
    for (const id of ['000000000-a', '000000000_a', '000000000Aa', '000000000aa']) await store.saveEvent(event(id));

    const first = await store.listEvents([1], null, 2);
    const second = await store.listEvents([1], first.at(-1)!.id, 2);

    expect([...first, ...second].map((e) => e.id).sort()).toEqual(
      ['000000000-a', '000000000Aa', '000000000_a', '000000000aa'],
    );
  });

  it('returns copies so callers cannot change stored data by accident', async () => {
    const store = new MemoryStore();
    await store.saveEvent(event('1'));

    const [copy] = await store.listEvents([1], null, 1);
    copy!.actorId = 99;

    expect((await store.listEvents([1], null, 1))[0]!.actorId).toBe(1);
  });
});

describeStoreContract('MemoryStore', async () => new MemoryStore());
