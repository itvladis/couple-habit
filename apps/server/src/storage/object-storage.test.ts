import { describe, expect, it } from 'vitest';
import { objectStorageObject } from './object-storage';

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

/** Fake fetch that records requests and answers from a queue. */
function fakeFetch(responses: Response[]) {
  const calls: Call[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? 'GET',
      url: String(input),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === 'string' ? init.body : null,
    });
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return next;
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

const options = (fetch: typeof globalThis.fetch) => ({
  bucket: 'data-bucket',
  key: 'state/v1.json',
  token: async () => 'iam-token',
  fetch,
});

describe('objectStorageObject', () => {
  it('reads a missing object as empty', async () => {
    const { fetch, calls } = fakeFetch([new Response('<Error/>', { status: 404 })]);

    const result = await objectStorageObject(options(fetch)).read();

    expect(result).toEqual({ body: null, etag: null });
    expect(calls[0]).toMatchObject({
      method: 'GET',
      url: 'https://storage.yandexcloud.net/data-bucket/state/v1.json',
      headers: { 'x-yacloud-subjecttoken': 'iam-token' },
    });
  });

  it('returns the body and its ETag', async () => {
    const { fetch } = fakeFetch([new Response('{"a":1}', { status: 200, headers: { etag: '"e1"' } })]);

    expect(await objectStorageObject(options(fetch)).read()).toEqual({ body: '{"a":1}', etag: '"e1"' });
  });

  it('revalidates with If-None-Match and reuses the cached body on 304', async () => {
    const { fetch, calls } = fakeFetch([
      new Response('{"a":1}', { status: 200, headers: { etag: '"e1"' } }),
      new Response(null, { status: 304, headers: { etag: '"e1"' } }),
    ]);
    const object = objectStorageObject(options(fetch));
    await object.read();

    const second = await object.read();

    expect(calls[1]?.headers['if-none-match']).toBe('"e1"');
    expect(second).toEqual({ body: '{"a":1}', etag: '"e1"' });
  });

  it('creates the object only if it does not exist yet', async () => {
    const { fetch, calls } = fakeFetch([new Response(null, { status: 200, headers: { etag: '"e2"' } })]);

    const result = await objectStorageObject(options(fetch)).write('{"b":2}', null);

    expect(result).toEqual({ ok: true, etag: '"e2"' });
    expect(calls[0]).toMatchObject({
      method: 'PUT',
      body: '{"b":2}',
      headers: { 'if-none-match': '*', 'content-type': 'application/json', 'x-yacloud-subjecttoken': 'iam-token' },
    });
  });

  it('overwrites only the version it read', async () => {
    const { fetch, calls } = fakeFetch([new Response(null, { status: 200, headers: { etag: '"e3"' } })]);

    const result = await objectStorageObject(options(fetch)).write('{"c":3}', '"e2"');

    expect(result).toEqual({ ok: true, etag: '"e3"' });
    expect(calls[0]?.headers['if-match']).toBe('"e2"');
    expect(calls[0]?.headers['if-none-match']).toBeUndefined();
  });

  it('serves its own successful write from cache without downloading it again', async () => {
    const { fetch } = fakeFetch([
      new Response(null, { status: 200, headers: { etag: '"e4"' } }),
      new Response(null, { status: 304, headers: { etag: '"e4"' } }),
    ]);
    const object = objectStorageObject(options(fetch));
    await object.write('{"d":4}', null);

    expect(await object.read()).toEqual({ body: '{"d":4}', etag: '"e4"' });
  });

  it('reports a conflict when someone else wrote first', async () => {
    const { fetch } = fakeFetch([new Response('<Error/>', { status: 412 })]);

    expect(await objectStorageObject(options(fetch)).write('{}', '"old"')).toEqual({ ok: false });
  });

  it('throws on other failures without leaking the token', async () => {
    const { fetch } = fakeFetch([new Response('<Error>AccessDenied</Error>', { status: 403 })]);

    const error: unknown = await objectStorageObject(options(fetch)).read().then(() => null, (e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/403/);
    expect((error as Error).message).not.toContain('iam-token');
  });

  it('throws when a successful write has no ETag to continue from', async () => {
    const { fetch } = fakeFetch([new Response(null, { status: 200 })]);

    await expect(objectStorageObject(options(fetch)).write('{}', null)).rejects.toThrow(/ETag/);
  });
});
