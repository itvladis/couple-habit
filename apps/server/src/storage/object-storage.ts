const DEFAULT_ENDPOINT = 'https://storage.yandexcloud.net';
const ERROR_BODY_LIMIT = 200;
/** A stuck connection must fail the request, not hold the function until the platform kills it. */
const REQUEST_TIMEOUT_MS = 5_000;

/** One object with optimistic concurrency: every write names the version it replaces. */
export interface VersionedObject {
  /** The current body and its ETag; both null when the object does not exist yet. */
  read(): Promise<{ body: string | null; etag: string | null }>;
  /** Writes only if the object is still at `etag` (`null`: only if it does not exist). */
  write(body: string, etag: string | null): Promise<{ ok: true; etag: string } | { ok: false }>;
}

export interface ObjectStorageOptions {
  bucket: string;
  key: string;
  /** IAM token of the caller; sent as X-YaCloud-SubjectToken, so no static access keys are needed. */
  token: () => Promise<string>;
  endpoint?: string;
  fetch?: typeof fetch;
}

/** S3-compatible status codes for "someone else changed the object first". */
const CONFLICT_STATUSES = new Set([409, 412]);

/**
 * A JSON object in Yandex Object Storage. The last body is cached per instance and revalidated
 * with If-None-Match, so an unchanged object costs a 304 instead of a full download.
 */
export function objectStorageObject(options: ObjectStorageOptions): VersionedObject {
  const { bucket, key, token, endpoint = DEFAULT_ENDPOINT, fetch: fetchFn = fetch } = options;
  const url = `${endpoint}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  let cached: { body: string; etag: string } | null = null;

  const request = async (method: 'GET' | 'PUT', headers: Record<string, string>, body?: string) =>
    fetchFn(url, {
      method,
      headers: { 'X-YaCloud-SubjectToken': await token(), ...headers },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  const failure = async (action: string, response: Response) => {
    const details = (await response.text().catch(() => '')).slice(0, ERROR_BODY_LIMIT);
    return new Error(`Object Storage ${action} of ${bucket}/${key} failed: HTTP ${response.status} ${details}`);
  };

  const requireEtag = (response: Response, action: string): string => {
    const etag = response.headers.get('etag');
    if (!etag) throw new Error(`Object Storage ${action} of ${bucket}/${key} returned no ETag`);
    return etag;
  };

  return {
    async read() {
      const response = await request('GET', cached ? { 'If-None-Match': cached.etag } : {});
      if (response.status === 304 && cached) return { ...cached };
      if (response.status === 404) {
        await response.body?.cancel();
        cached = null;
        return { body: null, etag: null };
      }
      if (!response.ok) throw await failure('read', response);
      const etag = requireEtag(response, 'read');
      const body = await response.text();
      cached = { body, etag };
      return { body, etag };
    },

    async write(body, etag) {
      const condition: Record<string, string> = etag === null ? { 'If-None-Match': '*' } : { 'If-Match': etag };
      const response = await request('PUT', { 'Content-Type': 'application/json', ...condition }, body);
      if (CONFLICT_STATUSES.has(response.status)) {
        await response.body?.cancel();
        return { ok: false };
      }
      if (!response.ok) throw await failure('write', response);
      const next = requireEtag(response, 'write');
      cached = { body, etag: next };
      return { ok: true, etag: next };
    },
  };
}
