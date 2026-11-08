import { z } from 'zod';

/** Cloud Functions expose the function's service account token here (GCE-compatible API). */
const METADATA_TOKEN_URL = 'http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token';
/** Refresh a little early so a request never starts with a token about to expire. */
const REFRESH_MARGIN_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 2_000;

const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() });

/**
 * IAM token of the function's service account, cached until shortly before it expires.
 * Concurrent callers share one request; a failure is not cached, so the next call retries.
 */
export function metadataTokenProvider(options: { fetch?: typeof fetch; now?: () => number } = {}): () => Promise<string> {
  const { fetch: fetchFn = fetch, now = Date.now } = options;
  let cached: { token: string; expiresAt: number } | null = null;
  let pending: Promise<string> | null = null;

  const load = async (): Promise<string> => {
    const response = await fetchFn(METADATA_TOKEN_URL, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`metadata token request failed: HTTP ${response.status}; does the function have a service account?`);
    }
    const data = tokenSchema.parse(await response.json());
    cached = { token: data.access_token, expiresAt: now() + data.expires_in * 1000 };
    return data.access_token;
  };

  return () => {
    if (cached && now() < cached.expiresAt - REFRESH_MARGIN_MS) return Promise.resolve(cached.token);
    pending ??= load().finally(() => {
      pending = null;
    });
    return pending;
  };
}
