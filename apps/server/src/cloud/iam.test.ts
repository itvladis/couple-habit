import { describe, expect, it } from 'vitest';
import { metadataTokenProvider } from './iam';

function fakeFetch(responses: Response[]) {
  const urls: string[] = [];
  const headers: Headers[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    urls.push(String(input));
    headers.push(new Headers(init?.headers));
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return next;
  };
  return { fetch: fetch as typeof globalThis.fetch, urls, headers };
}

const tokenResponse = (token: string, expiresIn: number) =>
  Response.json({ access_token: token, expires_in: expiresIn, token_type: 'Bearer' });

describe('metadataTokenProvider', () => {
  it('asks the metadata service with the required header', async () => {
    const { fetch, urls, headers } = fakeFetch([tokenResponse('t1', 3600)]);

    const token = await metadataTokenProvider({ fetch, now: () => 0 })();

    expect(token).toBe('t1');
    expect(urls[0]).toBe('http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token');
    expect(headers[0]?.get('metadata-flavor')).toBe('Google');
  });

  it('reuses the token until shortly before it expires', async () => {
    let now = 0;
    const { fetch, urls } = fakeFetch([tokenResponse('t1', 3600), tokenResponse('t2', 3600)]);
    const token = metadataTokenProvider({ fetch, now: () => now });

    await token();
    now = 3000 * 1000;
    const cached = await token();
    now = 3500 * 1000;
    const refreshed = await token();

    expect([cached, refreshed]).toEqual(['t1', 't2']);
    expect(urls).toHaveLength(2);
  });

  it('fails clearly when the function has no service account', async () => {
    const { fetch } = fakeFetch([new Response('not found', { status: 404 })]);

    await expect(metadataTokenProvider({ fetch, now: () => 0 })()).rejects.toThrow(/metadata.*404/);
  });

  it('retries after a failure instead of caching it', async () => {
    const { fetch } = fakeFetch([new Response('busy', { status: 503 }), tokenResponse('t1', 3600)]);
    const token = metadataTokenProvider({ fetch, now: () => 0 });

    await expect(token()).rejects.toThrow();

    expect(await token()).toBe('t1');
  });
});
