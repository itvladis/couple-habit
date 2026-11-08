import { describe, expect, it } from 'vitest';
import { resolveLanguage } from './users';
import { setup } from './test-helpers';

describe('users', () => {
  it('follows the Mini App time zone until the user picks one by hand', async () => {
    const { app } = setup();
    await app.users.upsertFromTelegram({ id: 1, first_name: 'Влад' }, 'Asia/Dubai');
    expect((await app.users.get(1)).timeZone).toBe('Asia/Dubai');

    await app.users.updateSettings(1, { timeZone: 'Europe/Moscow' });
    await app.users.upsertFromTelegram({ id: 1, first_name: 'Влад' }, 'Asia/Dubai');

    expect((await app.users.get(1)).timeZone).toBe('Europe/Moscow');
  });

  it('falls back to Moscow when the reported time zone is unknown', async () => {
    const { app } = setup();

    const user = await app.users.upsertFromTelegram({ id: 1, first_name: 'Влад' }, 'Nowhere/Land');

    expect(user.timeZone).toBe('Europe/Moscow');
  });

  it('ensure() creates a missing user but leaves an existing one untouched', async () => {
    const { app } = setup();
    await app.users.upsertFromTelegram({ id: 1, first_name: 'Влад' });

    const existing = await app.users.ensure({ id: 1, first_name: 'Другое имя' });
    const created = await app.users.ensure({ id: 2, first_name: 'Маша' });

    expect(existing.firstName).toBe('Влад');
    expect(created.firstName).toBe('Маша');
  });

  it('rejects invalid settings', async () => {
    const { app } = setup();
    await app.users.upsertFromTelegram({ id: 1, first_name: 'Влад' });

    await expect(app.users.updateSettings(1, { timeZone: 'Mars/Base' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      app.users.updateSettings(1, { weeklySummary: { enabled: true, weekday: 8, time: '20:00' } }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('picks Russian for Russian-speaking Telegram clients and English otherwise', () => {
    expect(resolveLanguage({ language: null, telegramLanguage: 'ru' })).toBe('ru');
    expect(resolveLanguage({ language: null, telegramLanguage: 'uk' })).toBe('ru');
    expect(resolveLanguage({ language: null, telegramLanguage: 'de' })).toBe('en');
    expect(resolveLanguage({ language: 'en', telegramLanguage: 'ru' })).toBe('en');
  });
});
