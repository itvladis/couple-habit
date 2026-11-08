import { describe, expect, it } from 'vitest';
import { relay, type RelayEnv } from './relay';

const RELAY_SECRET = 'r'.repeat(43);
// Fake, and assembled at runtime so secret scanners don't mistake it for a real bot token.
const TOKEN = ['123456', 'AAbbCCddEEffGGhhIIjjKKllMMnnOOppQQr'].join(':');
const env: RelayEnv = { ORIGIN_WEBHOOK_URL: 'https://gateway.example/bot/webhook', RELAY_SECRET };

interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: string;
}

function fakeFetch(answer: Response | Error = new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? new TextDecoder().decode(init.body as ArrayBuffer) : '';
    calls.push({ url: String(input), method: init?.method ?? 'GET', headers: new Headers(init?.headers), body });
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

const update = (headers: Record<string, string> = { 'X-Telegram-Bot-Api-Secret-Token': 'telegram-secret' }) =>
  new Request('https://relay.example/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: '{"update_id":1}',
  });

describe('relay: Telegram → cloud', () => {
  it('forwards an update with its secret header to the cloud and passes the answer back', async () => {
    const { fetch, calls } = fakeFetch(new Response('', { status: 200 }));

    const response = await relay(update(), env, fetch);

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: 'https://gateway.example/bot/webhook', method: 'POST', body: '{"update_id":1}' });
    expect(calls[0]?.headers.get('x-telegram-bot-api-secret-token')).toBe('telegram-secret');
    expect(calls[0]?.headers.get('content-type')).toBe('application/json');
  });

  it('drops updates without Telegram secret header', async () => {
    const { fetch, calls } = fakeFetch();

    const response = await relay(update({}), env, fetch);

    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('accepts only POST on the webhook path', async () => {
    const { fetch, calls } = fakeFetch();

    const response = await relay(new Request('https://relay.example/webhook'), env, fetch);

    expect(response.status).toBe(405);
    expect(calls).toHaveLength(0);
  });

  it('answers 502 when the cloud is unreachable, so Telegram retries later', async () => {
    const { fetch } = fakeFetch(new Error('connect timeout'));

    expect((await relay(update(), env, fetch)).status).toBe(502);
  });
});

describe('relay: cloud → Telegram', () => {
  const call = (path: string, init: RequestInit = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"chat_id":1,"text":"hi"}' }) =>
    new Request(`https://relay.example${path}`, init);

  it('passes a Bot API call with the relay secret on to Telegram', async () => {
    const { fetch, calls } = fakeFetch();

    const response = await relay(call(`/${RELAY_SECRET}/bot${TOKEN}/sendMessage`), env, fetch);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({
      url: `https://api.telegram.org/bot${TOKEN}/sendMessage`,
      method: 'POST',
      body: '{"chat_id":1,"text":"hi"}',
    });
    expect(calls[0]?.headers.get('content-type')).toBe('application/json');
  });

  it('refuses calls with a wrong relay secret', async () => {
    const { fetch, calls } = fakeFetch();

    const response = await relay(call(`/${'x'.repeat(43)}/bot${TOKEN}/sendMessage`), env, fetch);

    expect(response.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('stays closed when no usable relay secret is configured', async () => {
    const { fetch, calls } = fakeFetch();

    for (const secret of [undefined, '', 'short']) {
      const response = await relay(call(`/${secret ?? 'undefined'}/bot${TOKEN}/getMe`), { ...env, RELAY_SECRET: secret }, fetch);
      expect(response.status).toBe(404);
    }
    expect(calls).toHaveLength(0);
  });

  it('only reaches Bot API methods, nothing else on Telegram', async () => {
    const { fetch, calls } = fakeFetch();

    for (const path of [`/file/bot${TOKEN}/photo.jpg`, `/bot${TOKEN}/../admin`, `/bot${TOKEN}/sendMessage/extra`, '/']) {
      const response = await relay(call(`/${RELAY_SECRET}${path}`), env, fetch);
      expect(response.status).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it('answers 404 to anything else', async () => {
    const { fetch, calls } = fakeFetch();

    expect((await relay(new Request('https://relay.example/'), env, fetch)).status).toBe(404);
    expect(calls).toHaveLength(0);
  });
});
