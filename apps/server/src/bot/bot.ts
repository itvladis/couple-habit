import { AppError, resolveLanguage, type App, type User } from '@habit/core';
import { Bot, GrammyError, InlineKeyboard, type Context } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { TEXTS, type Texts } from '../i18n/texts';
import { CALLBACK_PATTERNS } from './callbacks';

export type BotContext = Context & { user: User; t: Texts };

export interface BotOptions {
  /** HTTPS address of the Mini App; null until the frontend is deployed. */
  webAppUrl: string | null;
  /** Skips the getMe call (tests, serverless cold starts). */
  botInfo?: UserFromGetMe;
  /** Bot API base URL; the cloud goes through the relay because api.telegram.org is blocked there. */
  apiRoot?: string;
}

/** The action already happened; a failed message update ("not modified", deleted message) is only logged. */
async function safeEdit(update: () => Promise<unknown>): Promise<void> {
  try {
    await update();
  } catch (error) {
    if (error instanceof GrammyError && error.description.includes('message is not modified')) return;
    console.error('[bot] could not update the message', error);
  }
}

async function reportError(ctx: BotContext, error: unknown): Promise<void> {
  const code = error instanceof AppError ? error.code : 'unknown';
  if (!(error instanceof AppError)) console.error('[bot] unexpected error', error);
  // ctx.t is missing when loading the user failed; fall back to Russian, the main audience.
  const t = (ctx.t as Texts | undefined) ?? TEXTS.ru;
  const text = t.error(code);
  try {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text });
    else if (ctx.chat) await ctx.reply(text);
  } catch (replyError) {
    console.error('[bot] could not report error to the user', replyError);
  }
}

export function createBot(token: string, app: App, options: BotOptions): Bot<BotContext> {
  const bot = new Bot<BotContext>(token, {
    ...(options.botInfo && { botInfo: options.botInfo }),
    ...(options.apiRoot && { client: { apiRoot: options.apiRoot } }),
  });
  // Last resort: one bad update must never stop polling.
  bot.catch((error) => console.error('[bot] unhandled error', error.error));

  // Every failure, including loading the user, becomes a short answer instead of a crash.
  bot.use(async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      await reportError(ctx, error);
    }
  });

  // Who is talking, in which language. Updates without a human sender are ignored.
  bot.use(async (ctx, next) => {
    if (!ctx.from || ctx.from.is_bot) return;
    ctx.user = await app.users.ensure(ctx.from);
    ctx.t = TEXTS[resolveLanguage(ctx.user)];
    await next();
  });

  bot.on('my_chat_member', async (ctx) => {
    const status = ctx.myChatMember.new_chat_member.status;
    await app.users.setReachable(ctx.user.id, status !== 'kicked' && status !== 'left');
  });

  const pm = bot.chatType('private');

  // The bot only greets and delivers notifications; everything else happens in the Mini App.
  pm.command('start', async (ctx) => {
    const user = await app.users.upsertFromTelegram(ctx.from);
    await app.users.setReachable(user.id, true);
    const t = TEXTS[resolveLanguage(user)];
    const text = options.webAppUrl ? t.welcome(user.firstName) : `${t.welcome(user.firstName)}\n\n${t.welcomeNoApp}`;
    const keyboard = options.webAppUrl ? new InlineKeyboard().webApp(t.openApp, options.webAppUrl) : undefined;
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery(CALLBACK_PATTERNS.check, async (ctx) => {
    const [, habitId, date] = ctx.match;
    const result = await app.checks.check(ctx.user.id, habitId!, date!);
    await ctx.answerCallbackQuery({ text: result.created ? ctx.t.checked : ctx.t.alreadyChecked });
    await safeEdit(() => ctx.editMessageReplyMarkup());
  });

  bot.callbackQuery(CALLBACK_PATTERNS.request, async (ctx) => {
    const [, action, requestId] = ctx.match;
    const approve = action === 'a';
    if (approve) await app.social.approve(ctx.user.id, requestId!);
    else await app.social.decline(ctx.user.id, requestId!);
    const label = approve ? ctx.t.accepted : ctx.t.declined;
    await ctx.answerCallbackQuery({ text: label });
    const original = ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message ? ctx.callbackQuery.message.text : '';
    await safeEdit(() => ctx.editMessageText(`${original ?? ''}\n\n${label}`.trim()));
  });

  // Stale or unknown buttons: stop the loading spinner.
  bot.on('callback_query:data', (ctx) => ctx.answerCallbackQuery());

  return bot;
}

/** No command list (the app does everything); the menu button opens the Mini App once it exists. */
export async function configureBot(bot: Bot<BotContext>, webAppUrl: string | null): Promise<void> {
  await bot.api.deleteMyCommands();
  await bot.api.deleteMyCommands({ language_code: 'ru' });
  if (webAppUrl) {
    await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: TEXTS.en.openApp, web_app: { url: webAppUrl } } });
  }
}
