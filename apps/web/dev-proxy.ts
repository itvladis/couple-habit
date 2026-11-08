/** Only the developer's own browser on this machine gets auto-signed requests. */
const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

type Headers = Record<string, string | string[] | undefined>;

/**
 * Sign only same-origin requests from the Vite page itself:
 * - Host must be local (a tunnel keeps its public Host; never run cloudflared with --http-host-header);
 * - no proxy headers (cloudflared always adds them);
 * - no cross-site browser request (another page in the same browser could otherwise fire
 *   "simple" POSTs at localhost:5173 and get them signed — CSRF against the dev account).
 */
export function shouldSignLocally(headers: Headers): boolean {
  const host = String(headers.host ?? '');
  if (!LOCAL_HOST_RE.test(host)) return false;
  if (headers['x-forwarded-for'] || headers['cf-connecting-ip']) return false;
  const site = headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return false;
  const origin = headers.origin;
  if (typeof origin === 'string' && !LOCAL_HOST_RE.test(origin.replace(/^https?:\/\//, ''))) return false;
  return true;
}
