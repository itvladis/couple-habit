import { createApp, type App, type Store } from '@habit/core';
import { Api, webhookCallback } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { z } from 'zod';
import { createApi } from '../api/app';
import { createBot } from '../bot/bot';
import { TelegramNotifier } from '../bot/notifier';
import { objectStorageObject } from '../storage/object-storage';
import { createSnapshotStore } from '../storage/snapshot-store';
import { connectYdb } from '../storage/ydb-driver';
import { YdbStore } from '../storage/ydb';
import { metadataTokenProvider } from './iam';

/** Just under the function's 15 s limit: a slow update fails cleanly (500, Telegram retries) instead of being killed. */
const WEBHOOK_TIMEOUT_MS = 14_000;

/** The parts of getMe() the bot relies on; checked so a bad deploy fails loudly at start. */
const botInfoSchema = z.looseObject({ id: z.number(), is_bot: z.literal(true), first_name: z.string(), username: z.string().min(1) });

/** Object key of the data snapshot; bump the version if the format ever changes incompatibly. */
export const DATA_KEY = 'snapshot.v1.json';

const common = {
  BOT_TOKEN: z.string().min(20),
  /** getMe() result as base64 JSON (yc passes environment variables comma-separated). */
  BOT_INFO: z.string().regex(/^[A-Za-z0-9+/=]+$/),
  WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/),
  WEBAPP_URL: z.string().startsWith('https://'),
  /** Bot API through the relay (https://<worker>/<secret>); Telegram is unreachable from here directly. */
  TELEGRAM_API_ROOT: z.string().startsWith('https://').optional(),
};

/**
 * Environment the deploy script sets on both functions. Data lives in one JSON object in a private
 * bucket ("object"); "ydb" switches to the YDB adapter once serverless YDB works again.
 */
const envSchema = z.discriminatedUnion('STORAGE', [
  z.object({ ...common, STORAGE: z.literal('object'), DATA_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/) }),
  z.object({ ...common, STORAGE: z.literal('ydb'), YDB_CONNECTION: z.string().startsWith('grpcs://') }),
]);
type Env = z.infer<typeof envSchema>;

type Transaction = <T>(work: () => Promise<T>) => Promise<T>;

export interface Runtime {
  app: App;
  api: ReturnType<typeof createApi>;
  webhook: (request: Request) => Promise<Response>;
  webhookSecret: string;
  /** Wrap every invocation: loads the data, runs the work and saves the result. */
  transaction: Transaction;
}

/**
 * Built once per function instance and reused across invocations (cold start only).
 * A failed start is not cached, so the next invocation retries instead of failing forever.
 */
let runtime: Promise<Runtime> | null = null;

export function getRuntime(): Promise<Runtime> {
  runtime ??= start().catch((error: unknown) => {
    runtime = null;
    throw error;
  });
  return runtime;
}

async function start(): Promise<Runtime> {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) throw new Error(`Invalid function environment:\n${z.prettifyError(parsed.error)}`);
  const env = parsed.data;
  // Only the fields above are checked; the rest of getMe() passes through as Telegram sent it.
  const botInfo = botInfoSchema.parse(JSON.parse(Buffer.from(env.BOT_INFO, 'base64').toString('utf8'))) as unknown as UserFromGetMe;

  const { store, transaction } = await openStore(env);
  const apiRoot = env.TELEGRAM_API_ROOT;
  const notifier = new TelegramNotifier(new Api(env.BOT_TOKEN, apiRoot ? { apiRoot } : undefined), store, env.WEBAPP_URL);
  const app = createApp({ store, clock: { now: () => new Date() }, notifier });
  const bot = createBot(env.BOT_TOKEN, app, { webAppUrl: env.WEBAPP_URL, botInfo, ...(apiRoot && { apiRoot }) });
  // The Mini App and the API share the gateway's origin, so no cross-origin browser access is needed.
  const api = createApi({ app, botToken: env.BOT_TOKEN, botUsername: botInfo.username, allowedOrigins: [] });
  // Rejects updates without Telegram's secret header, so only Telegram can drive the bot.
  const webhook = webhookCallback(bot, 'std/http', { secretToken: env.WEBHOOK_SECRET, timeoutMilliseconds: WEBHOOK_TIMEOUT_MS });
  return { app, api, webhook, webhookSecret: env.WEBHOOK_SECRET, transaction };
}

async function openStore(env: Env): Promise<{ store: Store; transaction: Transaction }> {
  if (env.STORAGE === 'ydb') {
    const { sql } = await connectYdb(env.YDB_CONNECTION);
    // Every YDB call is durable on its own, so there is nothing to commit at the end.
    return { store: new YdbStore(sql), transaction: (work) => work() };
  }
  const object = objectStorageObject({ bucket: env.DATA_BUCKET, key: DATA_KEY, token: metadataTokenProvider() });
  return createSnapshotStore(object, { source: `${env.DATA_BUCKET}/${DATA_KEY}` });
}
