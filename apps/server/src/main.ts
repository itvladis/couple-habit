import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from '@habit/core';
import { Api } from 'grammy';
import { createApi } from './api/app';
import { configureBot, createBot } from './bot/bot';
import { TelegramNotifier } from './bot/notifier';
import { loadConfig } from './config';
import { openJsonStore } from './storage/json-file';

const TICK_MS = 60_000;
const SERVER_CLOSE_TIMEOUT_MS = 5_000;
const REPO_ROOT = resolve(import.meta.dirname, '../../..');

async function main() {
  const config = loadConfig();
  const { store, flush } = await openJsonStore(resolve(REPO_ROOT, config.DATA_FILE));

  // A standalone API client lets the notifier exist before the bot, which itself needs the app.
  const notifier = new TelegramNotifier(new Api(config.BOT_TOKEN), store, config.webAppUrl);
  const app = createApp({ store, clock: { now: () => new Date() }, notifier });
  const bot = createBot(config.BOT_TOKEN, app, { webAppUrl: config.webAppUrl });

  await bot.init();
  // Once the bot is deployed (webhook set), a local run must not touch the live bot: no polling,
  // no menu/commands pointing at localhost, no reminders from stale local data.
  // BOT_POLLING=force takes the bot over for local work (it deletes the webhook).
  const webhookUrl = (await bot.api.getWebhookInfo()).url ?? '';
  const live = Boolean(webhookUrl) && process.env.BOT_POLLING !== 'force';
  if (!live) await configureBot(bot, config.webAppUrl);

  const api = createApi({
    app,
    botToken: config.BOT_TOKEN,
    botUsername: bot.botInfo.username,
    allowedOrigins: config.allowedOrigins,
  });
  // Loopback only: the dev proxy is the one client, nothing on the local network should reach it.
  const server = serve({ fetch: api.fetch, port: config.PORT, hostname: '127.0.0.1' }, (info) => {
    console.log(`[api] http://localhost:${info.port}/api/v1/health`);
  });

  // One tick at a time: a slow tick (Telegram rate limits) is skipped over, never doubled.
  let ticking: Promise<void> | null = null;
  const tick = () => {
    if (ticking) return;
    ticking = app.jobs
      .tick()
      .catch((error) => console.error('[jobs] tick failed', error))
      .finally(() => {
        ticking = null;
      });
  };
  const timer = live ? undefined : setInterval(tick, TICK_MS);

  let stopping = false;
  const shutdown = async (reason: string, exitCode = 0) => {
    if (stopping) return;
    stopping = true;
    console.log(`[server] ${reason}, shutting down`);
    clearInterval(timer);
    try {
      await bot.stop();
      await new Promise<void>((done) => {
        server.close(() => done());
        if ('closeIdleConnections' in server) server.closeIdleConnections();
        setTimeout(done, SERVER_CLOSE_TIMEOUT_MS).unref();
      });
      await ticking;
    } catch (error) {
      console.error('[server] error while stopping', error);
      exitCode = 1;
    } finally {
      try {
        await flush();
      } catch (error) {
        console.error('[server] could not save data before exit', error);
        exitCode = 1;
      }
      process.exit(exitCode);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (error) => {
    console.error('[server] unhandled rejection', error);
    void shutdown('unhandled rejection', 1);
  });

  if (live) {
    console.warn(`[bot] webhook is set (${new URL(webhookUrl).host}); serving the API only. Set BOT_POLLING=force to take over the bot.`);
    return;
  }
  console.log(`[bot] @${bot.botInfo.username} is polling. Data: ${config.DATA_FILE}`);
  await bot.start({ drop_pending_updates: true, onStart: tick });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
