import { createApp, MemoryStore, type Notification } from '@habit/core';
import { describe, expect, it } from 'vitest';
import { createApi } from './app';
import { signInitData } from './init-data';

const TOKEN = '123456:TEST-token';
const NOW = new Date('2026-11-08T09:00:00Z');
const HABIT = {
  title: 'Зал вместе',
  icon: 'dumbbell',
  color: 'mint',
  frequency: { type: 'daily' },
  completionMode: 'all',
  visibility: 'friends',
};

function setup(rateLimit = { limit: 1000, windowMs: 60_000 }) {
  const sent: Notification[] = [];
  const app = createApp({
    store: new MemoryStore(),
    clock: { now: () => NOW },
    notifier: { send: async (n) => void sent.push(n) },
  });
  const api = createApi({
    app,
    botToken: TOKEN,
    botUsername: 'habit_test_bot',
    allowedOrigins: ['https://app.example'],
    now: () => NOW,
    rateLimit,
  });

  const auth = (id: number, name: string, extra: Record<string, string> = {}) =>
    `tma ${signInitData(
      { auth_date: String(Math.floor(NOW.getTime() / 1000)), user: JSON.stringify({ id, first_name: name }), ...extra },
      TOKEN,
    )}`;

  const call = async (method: string, path: string, as: string | null, body?: unknown) => {
    const headers: Record<string, string> = {};
    if (as) headers.Authorization = as;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await api.request(`/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null, headers: res.headers };
  };

  return { app, api, sent, auth, call };
}

describe('auth', () => {
  it('rejects requests without Telegram init data', async () => {
    const { call } = setup();

    const res = await call('GET', '/me', null);

    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe('unauthorized');
  });

  it('rejects forged init data', async () => {
    const { call, auth } = setup();

    const res = await call('GET', '/me', auth(1, 'Влад').replace('hash=', 'hash=00'));

    expect(res.status).toBe(401);
  });

  it('answers the health check without auth', async () => {
    const { call } = setup();

    expect((await call('GET', '/health', null)).status).toBe(200);
  });

  it('limits the request rate per user', async () => {
    const { call, auth } = setup({ limit: 2, windowMs: 60_000 });
    const vlad = auth(1, 'Влад');

    await call('GET', '/me', vlad);
    await call('GET', '/me', vlad);
    const third = await call('GET', '/me', vlad);

    expect(third.status).toBe(429);
    expect(third.headers.get('Retry-After')).toBe('60');
  });
});

describe('session and settings', () => {
  it('starts a session with the browser time zone', async () => {
    const { call, auth } = setup();

    const res = await call('POST', '/session', auth(1, 'Влад'), { timeZone: 'Asia/Dubai' });

    expect(res.status).toBe(200);
    expect(res.json.data.user).toMatchObject({ id: 1, firstName: 'Влад', timeZone: 'Asia/Dubai', language: 'en' });
    expect(res.json.data.invite).toBeNull();
  });

  it('previews an invite from start_param without sending a request', async () => {
    const { app, call, auth, sent } = setup();
    await app.users.upsertFromTelegram({ id: 1, first_name: 'Влад' });
    const link = await app.social.getInviteLink(1, null);

    const res = await call('POST', '/session', auth(2, 'Маша', { start_param: `i_${link.token}` }), {});

    expect(res.json.data.deepLink).toEqual({ screen: 'invite', token: link.token });
    expect(res.json.data.invite).toMatchObject({ state: 'can_join', inviter: { firstName: 'Влад' } });
    expect(sent).toEqual([]);
  });

  it('opens other screens from start_param and ignores garbage', async () => {
    const { call, auth } = setup();

    const requests = await call('POST', '/session', auth(1, 'Влад', { start_param: 'requests' }), {});
    const garbage = await call('POST', '/session', auth(1, 'Влад', { start_param: 'h_nope' }), {});

    expect(requests.json.data).toMatchObject({ deepLink: { screen: 'requests' }, invite: null });
    expect(garbage.json.data.deepLink).toBeNull();
  });

  it('updates settings and validates them', async () => {
    const { call, auth } = setup();
    const vlad = auth(1, 'Влад');

    const ok = await call('PATCH', '/me', vlad, { language: 'ru', theme: 'dark' });
    const bad = await call('PATCH', '/me', vlad, { timeZone: 'Mars/Base' });

    expect(ok.json.data).toMatchObject({ language: 'ru', languageSetting: 'ru', theme: 'dark' });
    expect(bad.status).toBe(422);
    expect(bad.json.error.code).toBe('invalid');
  });

  it('returns 400 for malformed JSON', async () => {
    const { call, auth } = setup();

    expect((await call('PATCH', '/me', auth(1, 'Влад'), '{oops')).status).toBe(400);
  });
});

describe('habits', () => {
  it('creates, lists, checks and unchecks a habit', async () => {
    const { call, auth } = setup();
    const vlad = auth(1, 'Влад');

    const created = await call('POST', '/habits', vlad, HABIT);
    const id = created.json.data.id;
    expect(created.status).toBe(201);
    expect(created.headers.get('Location')).toBe(`/api/v1/habits/${id}`);

    const checked = await call('PUT', `/habits/${id}/checks/2026-11-08`, vlad);
    expect(checked.json.data).toEqual({ created: true, date: '2026-11-08' });

    const list = await call('GET', '/habits', vlad);
    expect(list.json.data).toHaveLength(1);
    expect(list.json.data[0]).toMatchObject({ checkedToday: true, doneToday: true, streak: { current: 1 } });

    expect((await call('DELETE', `/habits/${id}/checks/2026-11-08`, vlad)).status).toBe(204);
    expect((await call('GET', `/habits/${id}`, vlad)).json.data.checkedToday).toBe(false);
  });

  it('hides other people’s habits behind 404', async () => {
    const { call, auth } = setup();
    const created = await call('POST', '/habits', auth(1, 'Влад'), { ...HABIT, visibility: 'private' });

    const res = await call('GET', `/habits/${created.json.data.id}`, auth(2, 'Маша'));

    expect(res.status).toBe(404);
  });

  it('returns 403 when a member who is not the owner edits the habit', async () => {
    const { app, call, auth } = setup();
    const vlad = auth(1, 'Влад');
    const masha = auth(2, 'Маша');
    await call('GET', '/me', masha);
    const link = (await call('GET', '/invite-link', vlad)).json.data;
    const outcome = await app.social.requestByToken(2, link.token);
    if (outcome.status !== 'requested') throw new Error('expected request');
    await call('POST', `/requests/${outcome.request.id}/approve`, vlad);
    const habit = (await call('POST', '/habits', vlad, HABIT)).json.data;
    const invite = await call('POST', `/habits/${habit.id}/invites`, vlad, { userId: 2 });
    await call('POST', `/requests/${invite.json.data.id}/approve`, masha);

    const res = await call('PATCH', `/habits/${habit.id}`, masha, { title: 'Взлом' });

    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe('forbidden');
  });

  it('returns heatmap data for a date range', async () => {
    const { call, auth } = setup();
    const vlad = auth(1, 'Влад');
    const id = (await call('POST', '/habits', vlad, HABIT)).json.data.id;
    await call('PUT', `/habits/${id}/checks/2026-11-01`, vlad);
    await call('PUT', `/habits/${id}/checks/2026-11-05`, vlad);

    const res = await call('GET', `/habits/${id}/checks?from=2026-11-01&to=2026-11-08`, vlad);

    expect(res.json.data).toEqual({ done: ['2026-11-01', '2026-11-05'], mine: ['2026-11-01', '2026-11-05'] });
  });

  it('serves invite links that open the Mini App, not the bot chat', async () => {
    const { call, auth } = setup();

    const res = await call('GET', '/invite-link', auth(1, 'Влад'));

    expect(res.json.data.url).toBe(`https://t.me/habit_test_bot?startapp=i_${res.json.data.token}`);
  });
});

describe('feed', () => {
  it('paginates with a cursor', async () => {
    const { call, auth } = setup();
    const vlad = auth(1, 'Влад');
    for (let i = 0; i < 3; i++) await call('POST', '/habits', vlad, { ...HABIT, title: `Привычка ${i}` });

    const first = await call('GET', '/feed?limit=2', vlad);
    const second = await call('GET', `/feed?limit=2&before=${first.json.meta.nextCursor}`, vlad);

    expect(first.json.data).toHaveLength(2);
    expect(second.json.data).toHaveLength(1);
    expect(second.json.meta.nextCursor).toBeNull();
  });

  it('rejects an out-of-range limit', async () => {
    const { call, auth } = setup();

    expect((await call('GET', '/feed?limit=500', auth(1, 'Влад'))).status).toBe(422);
  });
});

describe('invites', () => {
  it('previews an invite and joins only after the user confirms', async () => {
    const { call, auth, sent } = setup();
    const vlad = auth(1, 'Влад');
    const masha = auth(2, 'Маша');
    const habit = (await call('POST', '/habits', vlad, HABIT)).json.data;
    const { token } = (await call('GET', `/habits/${habit.id}/invite-link`, vlad)).json.data;

    const preview = await call('GET', `/invites/${token}`, masha);
    expect(preview.status).toBe(200);
    expect(preview.json.data).toMatchObject({ state: 'can_join', habit: { title: 'Зал вместе' } });
    expect(sent).toEqual([]);

    const joined = await call('POST', `/invites/${token}/requests`, masha);
    expect(joined.status).toBe(201);
    expect(joined.json.data).toMatchObject({ status: 'requested', approver: { firstName: 'Влад' } });
    expect(joined.json.data.approver).not.toHaveProperty('id');
    expect(joined.json.data.request).toBeUndefined();
    expect(sent).toContainEqual(expect.objectContaining({ type: 'request_created', to: 1, requestType: 'habit_join' }));

    const again = await call('POST', `/invites/${token}/requests`, masha);
    expect(again.status).toBe(200);
    expect(again.json.data.status).toBe('already_requested');
  });

  it('returns 422 for a malformed invite token', async () => {
    const { call, auth } = setup();

    expect((await call('GET', '/invites/bad%20token!', auth(1, 'Влад'))).status).toBe(422);
  });

  it('returns 404 for an unknown invite', async () => {
    const { call, auth } = setup();

    const res = await call('GET', '/invites/unknown-token', auth(1, 'Влад'));

    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe('invalid_link');
  });
});
