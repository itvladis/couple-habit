import { MemoryStore, type User } from '@habit/core';
import { GrammyError, type Api } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import { TelegramNotifier } from './notifier';

const habit = { id: '11111111-1111-4111-8111-111111111111', title: 'Бег', icon: 'run' };

async function storeWith(user: Partial<User>) {
  const store = new MemoryStore();
  await store.saveUser({
    id: 1, firstName: 'Влад', lastName: null, username: null, photoUrl: null, telegramLanguage: 'en',
    language: null, theme: 'auto', timeZone: 'Europe/Moscow', timeZoneManual: false, remindersEnabled: true,
    weeklySummary: { enabled: true, weekday: 7, time: '20:00' }, lastWeeklySummaryWeek: null, canMessage: true,
    createdAt: '2026-11-08T00:00:00Z', ...user,
  });
  return store;
}

describe('TelegramNotifier', () => {
  it('sends the message in the recipient’s language', async () => {
    const store = await storeWith({});
    const sendMessage = vi.fn().mockResolvedValue({});
    const notifier = new TelegramNotifier({ sendMessage } as unknown as Api, store, null);

    await notifier.send({ type: 'reminder', to: 1, habit, date: '2026-11-08', time: '07:30' });

    expect(sendMessage).toHaveBeenCalledWith(1, '⏰ Reminder: “Бег” at 07:30', expect.objectContaining({ parse_mode: 'HTML' }));
  });

  it('marks the user unreachable when Telegram says the bot was blocked', async () => {
    const store = await storeWith({});
    const blocked = new GrammyError('blocked', { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }, 'sendMessage', {});
    const notifier = new TelegramNotifier({ sendMessage: vi.fn().mockRejectedValue(blocked) } as unknown as Api, store, null);

    await notifier.send({ type: 'reminder', to: 1, habit, date: '2026-11-08', time: '07:30' });

    expect((await store.getUser(1))?.canMessage).toBe(false);
  });

  it('skips users who cannot be messaged', async () => {
    const store = await storeWith({ canMessage: false });
    const sendMessage = vi.fn();
    const notifier = new TelegramNotifier({ sendMessage } as unknown as Api, store, null);

    await notifier.send({ type: 'reminder', to: 1, habit, date: '2026-11-08', time: '07:30' });

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('rethrows transient errors (network, 429, 5xx) so the caller can retry', async () => {
    const store = await storeWith({});
    const tooMany = new GrammyError('slow down', { ok: false, error_code: 429, description: 'Too Many Requests' }, 'sendMessage', {});

    for (const error of [new Error('network'), tooMany]) {
      const notifier = new TelegramNotifier({ sendMessage: vi.fn().mockRejectedValue(error) } as unknown as Api, store, null);
      await expect(notifier.send({ type: 'reminder', to: 1, habit, date: '2026-11-08', time: '07:30' })).rejects.toBe(error);
    }
  });

  it('treats "chat not found" like a block', async () => {
    const store = await storeWith({});
    const gone = new GrammyError('gone', { ok: false, error_code: 400, description: 'Bad Request: chat not found' }, 'sendMessage', {});
    const notifier = new TelegramNotifier({ sendMessage: vi.fn().mockRejectedValue(gone) } as unknown as Api, store, null);

    await notifier.send({ type: 'reminder', to: 1, habit, date: '2026-11-08', time: '07:30' });

    expect((await store.getUser(1))?.canMessage).toBe(false);
  });

  it('drops other permanent errors without retrying and keeps the user reachable', async () => {
    const store = await storeWith({});
    const bad = new GrammyError('bad', { ok: false, error_code: 400, description: "Bad Request: can't parse entities" }, 'sendMessage', {});
    const notifier = new TelegramNotifier({ sendMessage: vi.fn().mockRejectedValue(bad) } as unknown as Api, store, null);

    await expect(notifier.send({ type: 'reminder', to: 1, habit, date: '2026-11-08', time: '07:30' })).resolves.toBeUndefined();
    expect((await store.getUser(1))?.canMessage).toBe(true);
  });
});
