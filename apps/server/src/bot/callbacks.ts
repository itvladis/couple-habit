/** Callback data stays well under Telegram's 64-byte limit: a short prefix plus ids. */
export const cb = {
  check: (habitId: string, date: string) => `c:${habitId}:${date}`,
  approve: (requestId: string) => `ra:${requestId}`,
  decline: (requestId: string) => `rd:${requestId}`,
};

export const CALLBACK_PATTERNS = {
  check: /^c:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2})$/,
  request: /^r([ad]):([0-9a-f-]{36})$/,
};
