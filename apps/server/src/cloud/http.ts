/** API Gateway → Cloud Functions request (payload_format_version 1.0, AWS-compatible). */
export interface GatewayEvent {
  httpMethod: string;
  path: string;
  headers?: Record<string, string>;
  multiValueQueryStringParameters?: Record<string, string[]> | null;
  queryStringParameters?: Record<string, string> | null;
  body?: string | null;
  isBase64Encoded?: boolean;
}

export interface GatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: boolean;
}

/** Builds a Fetch API Request; the host is irrelevant to Hono and grammY, only path and query matter. */
export function toRequest(event: GatewayEvent): Request {
  const url = new URL(event.path || '/', 'https://gateway.internal');
  const multi = event.multiValueQueryStringParameters;
  if (multi) {
    for (const [name, values] of Object.entries(multi)) for (const v of values) url.searchParams.append(name, v);
  } else if (event.queryStringParameters) {
    for (const [name, v] of Object.entries(event.queryStringParameters)) url.searchParams.append(name, v);
  }
  const method = event.httpMethod.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD' && event.body != null && event.body !== '';
  const body = hasBody ? (event.isBase64Encoded ? Buffer.from(event.body!, 'base64') : event.body!) : undefined;
  return new Request(url, { method, headers: event.headers ?? {}, body });
}

export async function toGatewayResponse(response: Response): Promise<GatewayResponse> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  return { statusCode: response.status, headers, body: await response.text(), isBase64Encoded: false };
}
