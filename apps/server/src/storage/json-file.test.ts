import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openJsonStore } from './json-file';

const user = {
  id: 1, firstName: 'Влад', lastName: null, username: null, photoUrl: null, telegramLanguage: 'ru',
  language: null, theme: 'auto' as const, timeZone: 'Europe/Moscow', timeZoneManual: false, remindersEnabled: true,
  weeklySummary: { enabled: true, weekday: 7, time: '20:00' }, lastWeeklySummaryWeek: null, canMessage: true,
  createdAt: '2026-11-08T00:00:00Z',
};

describe('openJsonStore', () => {
  it('persists data across reopen', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'habits-')), 'db.json');
    const first = await openJsonStore(file, 0);
    await first.store.saveUser(user);
    await first.flush();

    const second = await openJsonStore(file);

    expect((await second.store.getUser(1))?.firstName).toBe('Влад');
  });

  it('refuses to start on a corrupt file instead of overwriting it', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'habits-')), 'db.json');
    await writeFile(file, '{"users": "nope"}');

    await expect(openJsonStore(file)).rejects.toThrow(/not a valid data snapshot/);
    expect(await readFile(file, 'utf8')).toBe('{"users": "nope"}');
  });

  it('reports a failed save on flush instead of pretending it worked', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'habits-'));
    const { store, flush } = await openJsonStore(join(dir, 'sub', 'db.json'), 10_000);
    await writeFile(join(dir, 'sub'), 'a file where the folder should be');

    await store.saveUser(user);

    await expect(flush()).rejects.toThrow();
  });

  it('saves again after a failure once the problem is gone', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'habits-'));
    const file = join(dir, 'sub', 'db.json');
    const { store, flush } = await openJsonStore(file, 10_000);
    await writeFile(join(dir, 'sub'), 'blocker');
    await store.saveUser(user);
    await expect(flush()).rejects.toThrow();

    const { rm } = await import('node:fs/promises');
    await rm(join(dir, 'sub'));
    await mkdir(join(dir, 'sub'));
    await flush();

    expect(JSON.parse(await readFile(file, 'utf8')).users).toHaveLength(1);
  });
});
