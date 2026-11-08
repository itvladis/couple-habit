import { describe, expect, it } from 'vitest';
import { initDataSecret, signInitData, validateInitData } from './init-data';

const TOKEN = '123456:TEST-token';
const secret = initDataSecret(TOKEN);
const NOW = new Date('2026-11-08T12:00:00Z');
const authDate = String(Math.floor(NOW.getTime() / 1000) - 60);
const user = JSON.stringify({ id: 42, first_name: 'Влад', language_code: 'ru', is_premium: true });

describe('validateInitData', () => {
  it('accepts data signed with the bot token and returns the user', () => {
    const raw = signInitData({ auth_date: authDate, user, start_param: 'abc_12-XYZ', query_id: 'q1' }, TOKEN);

    const result = validateInitData(raw, secret, NOW);

    expect(result.user).toEqual({ id: 42, first_name: 'Влад', language_code: 'ru' });
    expect(result.startParam).toBe('abc_12-XYZ');
  });

  it('rejects data whose fields were changed after signing', () => {
    const raw = signInitData({ auth_date: authDate, user }, TOKEN).replace('42', '43');

    expect(() => validateInitData(raw, secret, NOW)).toThrow(/signature/);
  });

  it('rejects data signed by another bot', () => {
    const raw = signInitData({ auth_date: authDate, user }, '999:OTHER');

    expect(() => validateInitData(raw, secret, NOW)).toThrow(/signature/);
  });

  it('rejects stale data', () => {
    const old = String(Math.floor(NOW.getTime() / 1000) - 25 * 60 * 60);
    const raw = signInitData({ auth_date: old, user }, TOKEN);

    expect(() => validateInitData(raw, secret, NOW)).toThrow(/expired/);
  });

  it('rejects data from the future beyond clock skew', () => {
    const future = String(Math.floor(NOW.getTime() / 1000) + 600);
    const raw = signInitData({ auth_date: future, user }, TOKEN);

    expect(() => validateInitData(raw, secret, NOW)).toThrow(/future/);
  });

  it('rejects missing hash, missing user and malformed user JSON', () => {
    expect(() => validateInitData(`auth_date=${authDate}`, secret, NOW)).toThrow(/hash/);
    expect(() => validateInitData(signInitData({ auth_date: authDate }, TOKEN), secret, NOW)).toThrow(/user/);
    expect(() => validateInitData(signInitData({ auth_date: authDate, user: '{oops' }, TOKEN), secret, NOW)).toThrow(/user/);
  });
});
