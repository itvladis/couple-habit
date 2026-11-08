/**
 * Where a link should open the Mini App. Encoded into Telegram's start parameter
 * (`t.me/<bot>?startapp=...`) or the `open` query of a web_app button, both limited
 * to A–Z, a–z, 0–9, "_" and "-", at most 64 characters.
 */
export type DeepLink =
  | { screen: 'invite'; token: string }
  | { screen: 'habit'; habitId: string }
  | { screen: 'requests' }
  | { screen: 'feed' }
  | { screen: 'home' };

const TOKEN_RE = /^[A-Za-z0-9_-]{1,62}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const INVITE_PREFIX = 'i_';
const HABIT_PREFIX = 'h_';

export function encodeDeepLink(link: DeepLink): string {
  switch (link.screen) {
    case 'invite':
      return INVITE_PREFIX + link.token;
    case 'habit':
      return HABIT_PREFIX + link.habitId;
    default:
      return link.screen;
  }
}

/** Parses an untrusted start parameter; null means "just open the home screen". */
export function parseDeepLink(value: string): DeepLink | null {
  if (value.startsWith(INVITE_PREFIX)) {
    const token = value.slice(INVITE_PREFIX.length);
    return TOKEN_RE.test(token) ? { screen: 'invite', token } : null;
  }
  if (value.startsWith(HABIT_PREFIX)) {
    const habitId = value.slice(HABIT_PREFIX.length);
    return UUID_RE.test(habitId) ? { screen: 'habit', habitId } : null;
  }
  if (value === 'requests' || value === 'feed' || value === 'home') return { screen: value };
  return null;
}
