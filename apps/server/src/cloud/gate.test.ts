import { describe, expect, it } from 'vitest';
import { classifyRequest } from './gate';

const SECRET = 'x'.repeat(40);
const headers = (entries: Record<string, string>) => new Headers(entries);

describe('classifyRequest', () => {
  it('lets a webhook call with the right secret through to the data', () => {
    expect(classifyRequest('/bot/webhook', headers({ 'X-Telegram-Bot-Api-Secret-Token': SECRET }), SECRET)).toBe('webhook');
  });

  it('rejects a webhook call with a wrong or missing secret before touching the data', () => {
    expect(classifyRequest('/bot/webhook', headers({ 'X-Telegram-Bot-Api-Secret-Token': 'y'.repeat(40) }), SECRET)).toBe('reject');
    expect(classifyRequest('/bot/webhook', headers({ 'X-Telegram-Bot-Api-Secret-Token': 'short' }), SECRET)).toBe('reject');
    expect(classifyRequest('/bot/webhook', headers({}), SECRET)).toBe('reject');
  });

  it('runs API calls with Telegram credentials against the data', () => {
    expect(classifyRequest('/api/v1/me', headers({ Authorization: 'tma query_id=1&hash=abc' }), SECRET)).toBe('authorized');
  });

  it('answers API calls without credentials without loading the data', () => {
    expect(classifyRequest('/api/v1/health', headers({}), SECRET)).toBe('public');
    expect(classifyRequest('/api/v1/me', headers({ Authorization: 'Bearer abc' }), SECRET)).toBe('public');
  });
});
