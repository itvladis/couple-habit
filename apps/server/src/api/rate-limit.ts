const PRUNE_THRESHOLD = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Fixed-window limiter kept in process memory. On serverless each instance counts separately,
 * so treat it as abuse protection, not an exact quota.
 */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return (key: string): RateLimitResult => {
    const time = now();
    if (windows.size > PRUNE_THRESHOLD) {
      for (const [k, w] of windows) if (w.resetAt <= time) windows.delete(k);
    }
    let window = windows.get(key);
    if (!window || window.resetAt <= time) {
      window = { count: 0, resetAt: time + windowMs };
      windows.set(key, window);
    }
    window.count++;
    return { allowed: window.count <= limit, retryAfterSeconds: Math.ceil((window.resetAt - time) / 1000) };
  };
}
