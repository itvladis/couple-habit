/**
 * Telegram and Russian data centres cannot reach each other (blocked both ways), so this Worker
 * carries the bot's traffic:
 *   POST /webhook                        Telegram → cloud: updates, forwarded to ORIGIN_WEBHOOK_URL
 *   /<RELAY_SECRET>/bot<token>/<method>  cloud → Telegram: Bot API calls, forwarded to api.telegram.org
 * Everything else is refused, so it is neither an open proxy nor a way into the cloud.
 */
export interface RelayEnv {
  /** The cloud's webhook endpoint, e.g. https://<gateway>/bot/webhook. */
  ORIGIN_WEBHOOK_URL: string;
  /** Path prefix that cloud functions put before Bot API calls; without it the relay stays closed. */
  RELAY_SECRET?: string;
}

const TELEGRAM_API = 'https://api.telegram.org';
const SECRET_HEADER = 'x-telegram-bot-api-secret-token';
const MIN_RELAY_SECRET_LENGTH = 32;
/** /bot<id>:<token>/<method>, nothing more: no file downloads, no other paths on Telegram. */
const BOT_METHOD_PATH = /^\/bot\d+:[A-Za-z0-9_-]{30,}\/[A-Za-z]+$/;

const text = (status: number, body: string) => new Response(body, { status, headers: { 'content-type': 'text/plain' } });

export async function relay(request: Request, env: RelayEnv, fetchFn: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/webhook') return forwardUpdate(request, env, fetchFn);

  const secret = env.RELAY_SECRET ?? '';
  const prefix = url.pathname.split('/')[1] ?? '';
  if (secret.length < MIN_RELAY_SECRET_LENGTH || !constantTimeEqual(prefix, secret)) return text(404, 'not found');

  const path = url.pathname.slice(prefix.length + 1);
  if (!BOT_METHOD_PATH.test(path)) return text(400, 'bad request');
  return callTelegram(request, `${TELEGRAM_API}${path}${url.search}`, fetchFn);
}

async function forwardUpdate(request: Request, env: RelayEnv, fetchFn: typeof fetch): Promise<Response> {
  if (request.method !== 'POST') return text(405, 'method not allowed');
  // The cloud checks the value; without the header it cannot be Telegram, so don't wake the cloud.
  const secret = request.headers.get(SECRET_HEADER);
  if (!secret) return text(401, 'unauthorized');
  try {
    const answer = await fetchFn(env.ORIGIN_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': request.headers.get('content-type') ?? 'application/json', [SECRET_HEADER]: secret },
      body: await request.arrayBuffer(),
    });
    return new Response(answer.body, { status: answer.status, headers: { 'content-type': answer.headers.get('content-type') ?? 'text/plain' } });
  } catch (error) {
    console.error('[relay] cloud unreachable', error);
    return text(502, 'bad gateway');
  }
}

async function callTelegram(request: Request, target: string, fetchFn: typeof fetch): Promise<Response> {
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const contentType = request.headers.get('content-type');
  try {
    const answer = await fetchFn(target, {
      method: request.method,
      headers: contentType ? { 'content-type': contentType } : {},
      body: hasBody ? await request.arrayBuffer() : undefined,
    });
    return new Response(answer.body, { status: answer.status, headers: { 'content-type': answer.headers.get('content-type') ?? 'application/json' } });
  } catch (error) {
    console.error('[relay] Telegram unreachable', error);
    return text(502, 'bad gateway');
  }
}

/** Compares without exiting early, so response timing does not reveal how much of the secret matched. */
function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i);
  return diff === 0;
}
