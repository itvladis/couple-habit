import { createHmac, timingSafeEqual } from 'node:crypto';
import type { TelegramUser } from '@habit/core';
import { z } from 'zod';

/** Mini App sessions can stay open for hours; a day is the usual upper bound. */
export const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;
const CLOCK_SKEW_SECONDS = 60;
const MAX_RAW_LENGTH = 4096;
const HASH_RE = /^[0-9a-f]{64}$/;

const telegramUserSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string().min(1).max(256),
  last_name: z.string().max(256).optional(),
  username: z.string().max(64).optional(),
  photo_url: z
    .string()
    .max(2048)
    .refine((url) => url.startsWith('https://'), 'photo_url must be https')
    .optional(),
  language_code: z.string().max(16).optional(),
});

export interface InitData {
  user: TelegramUser;
  authDate: Date;
  startParam: string | null;
}

export class InitDataError extends Error {
  override name = 'InitDataError';
}

/** HMAC key derived from the bot token, as Telegram specifies for Mini App data. Compute once per token. */
export function initDataSecret(botToken: string): Buffer {
  return createHmac('sha256', 'WebAppData').update(botToken).digest();
}

function dataCheckString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

/** Signs fields like Telegram does. For tests and the local dev helper only. */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields);
  const hash = createHmac('sha256', initDataSecret(botToken)).update(dataCheckString(params)).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

/** Verifies `Telegram.WebApp.initData` and returns the signed user. Throws InitDataError on any problem. */
export function validateInitData(
  raw: string,
  secret: Buffer,
  now: Date = new Date(),
  maxAgeSeconds = INIT_DATA_MAX_AGE_SECONDS,
): InitData {
  if (!raw || raw.length > MAX_RAW_LENGTH) throw new InitDataError('init data is empty or too long');
  const params = new URLSearchParams(raw);

  const hash = params.get('hash');
  if (!hash || !HASH_RE.test(hash)) throw new InitDataError('hash is missing or malformed');
  const expected = createHmac('sha256', secret).update(dataCheckString(params)).digest();
  if (!timingSafeEqual(Buffer.from(hash, 'hex'), expected)) throw new InitDataError('signature mismatch');

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate) || authDate <= 0) throw new InitDataError('auth_date is missing');
  const ageSeconds = now.getTime() / 1000 - authDate;
  if (ageSeconds > maxAgeSeconds) throw new InitDataError('init data expired');
  if (ageSeconds < -CLOCK_SKEW_SECONDS) throw new InitDataError('auth_date is in the future');

  const userJson = params.get('user');
  if (!userJson) throw new InitDataError('user is missing');
  let userValue: unknown;
  try {
    userValue = JSON.parse(userJson);
  } catch {
    throw new InitDataError('user is not valid JSON');
  }
  const user = telegramUserSchema.safeParse(userValue);
  if (!user.success) throw new InitDataError('user has an unexpected shape');

  return { user: user.data, authDate: new Date(authDate * 1000), startParam: params.get('start_param') };
}
