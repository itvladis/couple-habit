import { createApp, MemoryStore, type Notification } from '@habit/core';
import type { UserFromGetMe } from 'grammy/types';
import { describe, expect, it } from 'vitest';
import { createBot } from './bot';

const BOT_INFO = {
  id: 999,
  is_bot: true,
  first_name: 'Habits',
  username: 'habit_test_bot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
} as UserFromGetMe;

const HABIT = {
  title: 'Зал вместе',
  icon: 'dumbbell',
  color: 'mint',
  frequency: { type: 'daily' },
  completionMode: 'all',
  visibility: 'friends',
} as const;

interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

function setup() {
  const sent: Notification[] = [];
  const app = createApp({
    store: new MemoryStore(),
    clock: { now: () => new Date('2026-11-08T09:00:00Z') },
    notifier: { send: async (n) => void sent.push(n) },
  });
  const bot = createBot('123:TEST', app, { webAppUrl: 'https://app.example', botInfo: BOT_INFO });
  const calls: ApiCall[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    const result = method === 'sendMessage' ? { message_id: 1, date: 0, chat: { id: 1, type: 'private' }, text: '' } : true;
    return { ok: true, result } as never;
  });

  let updateId = 0;
  const from = (id: number, name: string) => ({ id, is_bot: false, first_name: name, language_code: 'ru' });
  const message = (id: number, name: string, text: string) =>
    bot.handleUpdate({
      update_id: ++updateId,
      message: {
        message_id: updateId,
        date: 0,
        chat: { id, type: 'private', first_name: name },
        from: from(id, name),
        text,
        entities: text.startsWith('/') ? [{ type: 'bot_command', offset: 0, length: text.split(' ')[0]!.length }] : [],
      },
    });
  const press = (id: number, name: string, data: string) =>
    bot.handleUpdate({
      update_id: ++updateId,
      callback_query: {
        id: `cq${updateId}`,
        from: from(id, name),
        chat_instance: 'chat',
        data,
        message: { message_id: 7, date: 0, chat: { id, type: 'private', first_name: name }, text: 'Маша хочет добавить тебя в друзья.' },
      },
    });
  const last = (method: string) => calls.filter((c) => c.method === method).at(-1)?.payload;

  return { app, sent, calls, message, press, last };
}

describe('bot', () => {
  it('answers the button instead of crashing when storage fails', async () => {
    const { app, press, last } = setup();
    app.users.ensure = async () => {
      throw new Error('storage is down');
    };

    await expect(press(1, 'Влад', 'c:11111111-1111-4111-8111-111111111111:2026-11-08')).resolves.toBeUndefined();
    expect(last('answerCallbackQuery')).toBeDefined();
  });


  it('greets with a button that opens the Mini App', async () => {
    const { message, last } = setup();

    await message(1, 'Влад', '/start');

    const reply = last('sendMessage')!;
    expect(reply.text).toBe('Привет, Влад! 👋\n\nЭто трекер привычек для тебя и друзей: отмечайте привычки вместе и держите серию.');
    expect(JSON.stringify(reply.reply_markup)).toContain('https://app.example');
  });

  it('only greets on /start with a payload: invites are handled in the Mini App', async () => {
    const { app, message, last, sent } = setup();
    await message(1, 'Влад', '/start');
    const link = await app.social.getInviteLink(1, null);

    await message(2, 'Маша', `/start ${link.token}`);

    expect(last('sendMessage')!.text).toContain('Привет, Маша!');
    expect(sent).toEqual([]);
  });

  it('has no other commands', async () => {
    const { message, calls } = setup();
    await message(1, 'Влад', '/start');
    const before = calls.length;

    await message(1, 'Влад', '/today');
    await message(1, 'Влад', '/invite');

    expect(calls.slice(before).filter((c) => c.method === 'sendMessage')).toEqual([]);
  });

  it('approves a request from the inline button and updates the message', async () => {
    const { app, message, press, last, sent } = setup();
    await message(1, 'Влад', '/start');
    await message(2, 'Маша', '/start');
    await app.social.requestByToken(2, (await app.social.getInviteLink(1, null)).token);
    const request = sent.find((n) => n.type === 'request_created');
    if (request?.type !== 'request_created') throw new Error('expected request');

    await press(1, 'Влад', `ra:${request.requestId}`);

    expect((await app.social.friends(1)).map((u) => u.id)).toEqual([2]);
    expect(last('editMessageText')!.text).toContain('Принято ✓');
    expect(last('answerCallbackQuery')!.text).toBe('Принято ✓');
  });

  it('refuses a request button pressed by someone else', async () => {
    const { app, message, press, last, sent } = setup();
    await message(1, 'Влад', '/start');
    await message(2, 'Маша', '/start');
    await app.social.requestByToken(2, (await app.social.getInviteLink(1, null)).token);
    const request = sent.find((n) => n.type === 'request_created');
    if (request?.type !== 'request_created') throw new Error('expected request');

    await press(2, 'Маша', `ra:${request.requestId}`);

    expect(last('answerCallbackQuery')!.text).toBe('Это действие не для тебя.');
    expect(await app.social.friends(1)).toEqual([]);
  });

  it('checks a habit from a reminder button and removes the button', async () => {
    const { app, message, press, last, calls } = setup();
    await message(1, 'Влад', '/start');
    const habit = await app.habits.create(1, HABIT);

    await press(1, 'Влад', `c:${habit.id}:2026-11-08`);

    expect((await app.views.habit(1, habit.id)).checkedToday).toBe(true);
    expect(last('answerCallbackQuery')!.text).toBe('Отмечено ✓');
    expect(calls.some((c) => c.method === 'editMessageReplyMarkup')).toBe(true);
  });

  it('stops messaging users who block the bot and resumes when they come back', async () => {
    const { app, message } = setup();
    await message(1, 'Влад', '/start');
    await app.users.setReachable(1, false);

    await message(1, 'Влад', '/start');

    expect((await app.users.get(1)).canMessage).toBe(true);
  });
});
