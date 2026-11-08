import { timingSafeEqual } from 'node:crypto';

export const WEBHOOK_PATH = '/bot/webhook';
const SECRET_HEADER = 'x-telegram-bot-api-secret-token';
const AUTH_SCHEME = 'tma ';

/**
 * How an incoming request is served, decided before any data is loaded:
 * - `webhook`: Telegram with the right secret; runs the bot against the data
 * - `reject`: a webhook call without the secret; answered 401 at once
 * - `authorized`: an API call carrying Telegram init data; runs against the data
 * - `public`: an API call without credentials; the API answers it (health, 401) without the data
 * Anonymous traffic therefore never costs a storage read.
 */
export function classifyRequest(path: string, headers: Headers, webhookSecret: string): 'webhook' | 'reject' | 'authorized' | 'public' {
  if (path === WEBHOOK_PATH) return sameSecret(headers.get(SECRET_HEADER), webhookSecret) ? 'webhook' : 'reject';
  return headers.get('authorization')?.startsWith(AUTH_SCHEME) ? 'authorized' : 'public';
}

function sameSecret(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
