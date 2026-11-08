import { describe, expect, it } from 'vitest';
import { encodeDeepLink, parseDeepLink } from './deep-links';

describe('deep links', () => {
  it('round-trips every screen through Telegram’s start parameter alphabet', () => {
    const links = [
      { screen: 'invite', token: 'aB3_x-9QzK12' },
      { screen: 'habit', habitId: '11111111-1111-4111-8111-111111111111' },
      { screen: 'requests' },
      { screen: 'feed' },
      { screen: 'home' },
    ] as const;

    for (const link of links) {
      const encoded = encodeDeepLink(link);
      expect(encoded).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      expect(parseDeepLink(encoded)).toEqual(link);
    }
  });

  it('returns null for anything it does not understand', () => {
    expect(parseDeepLink('')).toBeNull();
    expect(parseDeepLink('h_not-a-uuid')).toBeNull();
    expect(parseDeepLink('i_')).toBeNull();
    expect(parseDeepLink('i_bad token!')).toBeNull();
    expect(parseDeepLink('something')).toBeNull();
  });
});
