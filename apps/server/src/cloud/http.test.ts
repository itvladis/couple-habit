import { describe, expect, it } from 'vitest';
import { toGatewayResponse, toRequest } from './http';

describe('API Gateway event conversion', () => {
  it('rebuilds method, path, query, headers and JSON body', async () => {
    const req = toRequest({
      httpMethod: 'PATCH',
      path: '/api/v1/me',
      headers: { Authorization: 'tma abc', 'Content-Type': 'application/json' },
      multiValueQueryStringParameters: { before: ['x1'], tag: ['a', 'b'] },
      body: '{"theme":"dark"}',
      isBase64Encoded: false,
    });

    expect(req.method).toBe('PATCH');
    expect(new URL(req.url).pathname).toBe('/api/v1/me');
    expect(new URL(req.url).searchParams.getAll('tag')).toEqual(['a', 'b']);
    expect(req.headers.get('authorization')).toBe('tma abc');
    expect(await req.json()).toEqual({ theme: 'dark' });
  });

  it('decodes base64 bodies and drops bodies on GET', async () => {
    const post = toRequest({ httpMethod: 'POST', path: '/bot/webhook', body: Buffer.from('{"update_id":1}').toString('base64'), isBase64Encoded: true });
    const get = toRequest({ httpMethod: 'GET', path: '/api/v1/habits', body: 'ignored' });

    expect(await post.json()).toEqual({ update_id: 1 });
    expect(get.body).toBeNull();
  });

  it('turns a Response into the gateway format', async () => {
    const res = await toGatewayResponse(new Response('{"ok":true}', { status: 201, headers: { 'Content-Type': 'application/json' } }));

    expect(res).toEqual({ statusCode: 201, headers: { 'content-type': 'application/json' }, body: '{"ok":true}', isBase64Encoded: false });
  });
});
