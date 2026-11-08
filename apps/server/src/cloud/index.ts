import { classifyRequest } from './gate';
import { toGatewayResponse, toRequest, type GatewayEvent, type GatewayResponse } from './http';
import { getRuntime } from './runtime';

const json = (statusCode: number, body: unknown): GatewayResponse => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
  isBase64Encoded: false,
});

/** HTTP function behind API Gateway: the REST API and the Telegram webhook. */
export async function handler(event: GatewayEvent): Promise<GatewayResponse> {
  try {
    const { api, webhook, webhookSecret, transaction } = await getRuntime();
    const kind = classifyRequest(event.path, toRequest(event).headers, webhookSecret);
    if (kind === 'reject') return json(401, { error: { code: 'unauthorized', message: 'unauthorized' } });
    if (kind === 'public') return await toGatewayResponse(await api.fetch(toRequest(event)));
    const serve = kind === 'webhook' ? webhook : api.fetch;
    // The request is rebuilt on every attempt: a retried transaction needs an unread body.
    return await transaction(async () => toGatewayResponse(await serve(toRequest(event))));
  } catch (error) {
    console.error('[cloud] request failed', error);
    return json(500, { error: { code: 'internal', message: 'internal server error' } });
  }
}

/** Timer trigger, once a minute: reminders and weekly summaries. */
export async function tick(): Promise<{ statusCode: number }> {
  const { app, transaction } = await getRuntime();
  await transaction(() => app.jobs.tick());
  return { statusCode: 200 };
}
