import { describe, expect, it } from 'vitest';
import { initialNavigation } from './App';

const HABIT = '11111111-1111-4111-8111-111111111111';

describe('initialNavigation', () => {
  it('opens the invite preview from a startapp link', () => {
    expect(initialNavigation({ deepLink: { screen: 'invite', token: 'abc' } }, null)).toEqual({
      tab: 'home',
      stack: [{ name: 'join', token: 'abc' }],
    });
  });

  it('falls back to the bot button’s `open` parameter', () => {
    expect(initialNavigation({ deepLink: null }, `h_${HABIT}`)).toEqual({ tab: 'home', stack: [{ name: 'habit', id: HABIT }] });
    expect(initialNavigation({ deepLink: null }, 'requests')).toEqual({ tab: 'profile', stack: [{ name: 'requests' }] });
    expect(initialNavigation({ deepLink: null }, 'feed')).toEqual({ tab: 'feed', stack: [] });
  });

  it('lands on home for nothing or garbage', () => {
    expect(initialNavigation({ deepLink: null }, null)).toEqual({ tab: 'home', stack: [] });
    expect(initialNavigation({ deepLink: null }, 'h_not-a-uuid')).toEqual({ tab: 'home', stack: [] });
  });
});
