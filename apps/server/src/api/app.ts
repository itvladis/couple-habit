import { AppError, parseDeepLink, type App, type ErrorCode } from '@habit/core';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { toInviteLink, toInviteOutcome, toMe } from './dto';
import { initDataSecret, InitDataError, validateInitData, type InitData } from './init-data';
import { createRateLimiter } from './rate-limit';

const MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_RATE_LIMIT = { limit: 120, windowMs: 60_000 };
const AUTH_SCHEME = 'tma ';

const STATUS_BY_CODE: Record<ErrorCode, ContentfulStatusCode> = {
  not_found: 404,
  forbidden: 403,
  invalid: 422,
  conflict: 409,
};

export interface ApiConfig {
  app: App;
  botToken: string;
  botUsername: string;
  /** Origins allowed to call the API from a browser (the Mini App's origin). */
  allowedOrigins: string[];
  now?: () => Date;
  rateLimit?: { limit: number; windowMs: number };
}

type Env = { Variables: { userId: number; initData: InitData } };

const errorBody = (code: string, message: string) => ({ error: { code, message } });

const sessionSchema = z.object({ timeZone: z.string().max(64).optional() });
const transferSchema = z.object({ userId: z.number().int().positive() });
const inviteSchema = z.object({ userId: z.number().int().positive() });
const feedQuerySchema = z.object({
  before: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
const rangeSchema = z.object({ from: z.string(), to: z.string() });

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError('invalid', z.prettifyError(result.error));
  return result.data;
}

async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HTTPException(400, { message: 'request body is not valid JSON' });
  }
}

function inviteToken(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw new AppError('invalid', 'malformed invite token');
  return value;
}

function userIdParam(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new AppError('invalid', 'user id must be a positive integer');
  return id;
}

export function createApi(config: ApiConfig) {
  const { app, botUsername } = config;
  const now = config.now ?? (() => new Date());
  const secret = initDataSecret(config.botToken);
  const { limit, windowMs } = config.rateLimit ?? DEFAULT_RATE_LIMIT;
  const allow = createRateLimiter(limit, windowMs, () => now().getTime());

  const api = new Hono<Env>().basePath('/api/v1');

  api.use(
    '*',
    cors({
      origin: config.allowedOrigins,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowHeaders: ['Authorization', 'Content-Type'],
      maxAge: 600,
    }),
  );
  api.use(
    '*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json(errorBody('payload_too_large', 'request body is too large'), 413),
    }),
  );

  // Responses carry personal data (names, photos): no browser or proxy cache may keep them.
  api.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  api.get('/health', (c) => c.json({ data: { ok: true } }));

  api.use('*', async (c, next) => {
    const header = c.req.header('Authorization');
    if (!header?.startsWith(AUTH_SCHEME)) {
      return c.json(errorBody('unauthorized', 'missing Telegram init data'), 401);
    }
    let initData: InitData;
    try {
      initData = validateInitData(header.slice(AUTH_SCHEME.length), secret, now());
    } catch (error) {
      if (error instanceof InitDataError) return c.json(errorBody('unauthorized', 'invalid Telegram init data'), 401);
      throw error;
    }
    const rate = allow(String(initData.user.id));
    if (!rate.allowed) {
      c.header('Retry-After', String(rate.retryAfterSeconds));
      return c.json(errorBody('rate_limited', 'too many requests'), 429);
    }
    await app.users.ensure(initData.user);
    c.set('initData', initData);
    c.set('userId', initData.user.id);
    await next();
  });

  // Session & settings
  api.post('/session', async (c) => {
    const { timeZone } = parse(sessionSchema, await jsonBody(c));
    const initData = c.get('initData');
    const user = await app.users.upsertFromTelegram(initData.user, timeZone);
    // The start parameter only says where to land; joining always needs an explicit tap in the app.
    const deepLink = initData.startParam ? parseDeepLink(initData.startParam) : null;
    const invite = deepLink?.screen === 'invite' ? await app.social.previewInvite(user.id, deepLink.token) : null;
    return c.json({ data: { user: toMe(user), deepLink, invite } });
  });
  api.get('/me', async (c) => c.json({ data: toMe(await app.users.get(c.get('userId'))) }));
  api.patch('/me', async (c) => c.json({ data: toMe(await app.users.updateSettings(c.get('userId'), await jsonBody(c))) }));

  // Habits
  api.get('/habits', async (c) => {
    const archived = c.req.query('archived') === 'true';
    return c.json({ data: await app.views.myHabits(c.get('userId'), { archived }) });
  });
  api.post('/habits', async (c) => {
    const userId = c.get('userId');
    const habit = await app.habits.create(userId, await jsonBody(c));
    c.header('Location', `/api/v1/habits/${habit.id}`);
    return c.json({ data: await app.views.habit(userId, habit.id) }, 201);
  });
  api.get('/habits/:id', async (c) => c.json({ data: await app.views.habit(c.get('userId'), c.req.param('id')) }));
  api.patch('/habits/:id', async (c) => {
    const userId = c.get('userId');
    const habit = await app.habits.update(userId, c.req.param('id'), await jsonBody(c));
    return c.json({ data: await app.views.habit(userId, habit.id) });
  });
  api.post('/habits/:id/archive', async (c) => {
    const userId = c.get('userId');
    const habit = await app.habits.archive(userId, c.req.param('id'));
    return c.json({ data: await app.views.habit(userId, habit.id) });
  });
  api.post('/habits/:id/unarchive', async (c) => {
    const userId = c.get('userId');
    const habit = await app.habits.unarchive(userId, c.req.param('id'));
    return c.json({ data: await app.views.habit(userId, habit.id) });
  });
  api.post('/habits/:id/transfer', async (c) => {
    const userId = c.get('userId');
    const { userId: newOwnerId } = parse(transferSchema, await jsonBody(c));
    const habit = await app.habits.transferOwnership(userId, c.req.param('id'), newOwnerId);
    return c.json({ data: await app.views.habit(userId, habit.id) });
  });

  // Membership
  api.patch('/habits/:id/membership', async (c) => {
    const membership = await app.habits.updateMembership(c.get('userId'), c.req.param('id'), await jsonBody(c));
    return c.json({ data: { notifyOnCheck: membership.notifyOnCheck, reminder: membership.reminder, cardSize: membership.cardSize } });
  });
  api.delete('/habits/:id/membership', async (c) => {
    await app.habits.leave(c.get('userId'), c.req.param('id'));
    return c.body(null, 204);
  });
  api.delete('/habits/:id/members/:userId', async (c) => {
    await app.habits.removeMember(c.get('userId'), c.req.param('id'), userIdParam(c.req.param('userId')));
    return c.body(null, 204);
  });

  // Checks
  api.get('/habits/:id/checks', async (c) => {
    const { from, to } = parse(rangeSchema, c.req.query());
    return c.json({ data: await app.views.checkDates(c.get('userId'), c.req.param('id'), from, to) });
  });
  api.put('/habits/:id/checks/:date', async (c) =>
    c.json({ data: await app.checks.check(c.get('userId'), c.req.param('id'), c.req.param('date')) }),
  );
  api.delete('/habits/:id/checks/:date', async (c) => {
    await app.checks.uncheck(c.get('userId'), c.req.param('id'), c.req.param('date'));
    return c.body(null, 204);
  });

  // Invites & requests
  api.get('/invite-link', async (c) =>
    c.json({ data: toInviteLink(await app.social.getInviteLink(c.get('userId'), null), botUsername) }),
  );
  api.post('/invite-link/reset', async (c) =>
    c.json({ data: toInviteLink(await app.social.resetInviteLink(c.get('userId'), null), botUsername) }),
  );
  api.get('/habits/:id/invite-link', async (c) =>
    c.json({ data: toInviteLink(await app.social.getInviteLink(c.get('userId'), c.req.param('id')), botUsername) }),
  );
  api.post('/habits/:id/invite-link/reset', async (c) =>
    c.json({ data: toInviteLink(await app.social.resetInviteLink(c.get('userId'), c.req.param('id')), botUsername) }),
  );
  api.get('/invites/:token', async (c) => {
    const preview = await app.social.previewInvite(c.get('userId'), inviteToken(c.req.param('token')));
    if (!preview) return c.json(errorBody('invalid_link', 'invite link is invalid or revoked'), 404);
    return c.json({ data: preview });
  });
  api.post('/invites/:token/requests', async (c) => {
    const outcome = await app.social.requestByToken(c.get('userId'), inviteToken(c.req.param('token')));
    if (outcome.status === 'invalid_link') return c.json(errorBody('invalid_link', 'invite link is invalid or revoked'), 404);
    return c.json({ data: toInviteOutcome(outcome) }, outcome.status === 'requested' ? 201 : 200);
  });
  api.post('/habits/:id/invites', async (c) => {
    const { userId: friendId } = parse(inviteSchema, await jsonBody(c));
    const request = await app.social.inviteToHabit(c.get('userId'), c.req.param('id'), friendId);
    return c.json({ data: { id: request.id, status: request.status } }, 201);
  });
  api.get('/requests', async (c) => c.json({ data: await app.social.incomingRequests(c.get('userId')) }));
  api.post('/requests/:id/approve', async (c) => {
    const request = await app.social.approve(c.get('userId'), c.req.param('id'));
    return c.json({ data: { id: request.id, status: request.status } });
  });
  api.post('/requests/:id/decline', async (c) => {
    const request = await app.social.decline(c.get('userId'), c.req.param('id'));
    return c.json({ data: { id: request.id, status: request.status } });
  });

  // Friends & feed
  api.get('/friends', async (c) => c.json({ data: await app.social.friendList(c.get('userId')) }));
  api.delete('/friends/:userId', async (c) => {
    await app.social.removeFriend(c.get('userId'), userIdParam(c.req.param('userId')));
    return c.body(null, 204);
  });
  api.get('/feed', async (c) => {
    const query = parse(feedQuerySchema, c.req.query());
    const page = await app.feed.list(c.get('userId'), { before: query.before ?? null, limit: query.limit });
    return c.json({ data: page.items, meta: { nextCursor: page.nextCursor } });
  });

  api.notFound((c) => c.json(errorBody('not_found', 'route not found'), 404));
  api.onError((error, c) => {
    if (error instanceof AppError) return c.json(errorBody(error.code, error.message), STATUS_BY_CODE[error.code]);
    if (error instanceof HTTPException) return c.json(errorBody('bad_request', error.message), error.status);
    console.error('[api] unexpected error', error);
    return c.json(errorBody('internal', 'internal server error'), 500);
  });

  return api;
}
