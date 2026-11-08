import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

// Fake, and assembled at runtime so secret scanners don't mistake it for a real bot token.
const TOKEN = ['123456789', 'FAKE-token-for-unit-tests-only-000000'].join(':');

describe('loadConfig', () => {
  it('applies defaults and allows the Mini App origin', () => {
    const config = loadConfig({ BOT_TOKEN: TOKEN, WEBAPP_URL: 'https://habits.example/app', ALLOWED_ORIGINS: 'http://localhost:5173' });

    expect(config).toMatchObject({ PORT: 8787, DATA_FILE: '.data/db.json', webAppUrl: 'https://habits.example/app' });
    expect(config.allowedOrigins).toEqual(['http://localhost:5173', 'https://habits.example']);
  });

  it('fails fast with a readable message on a bad token or insecure Mini App URL', () => {
    expect(() => loadConfig({ BOT_TOKEN: 'nope' })).toThrow(/BotFather/);
    expect(() => loadConfig({ BOT_TOKEN: TOKEN, WEBAPP_URL: 'http://insecure.example' })).toThrow(/https/);
  });

  it('treats an empty WEBAPP_URL as "no Mini App yet"', () => {
    expect(loadConfig({ BOT_TOKEN: TOKEN, WEBAPP_URL: '' }).webAppUrl).toBeNull();
  });
});
