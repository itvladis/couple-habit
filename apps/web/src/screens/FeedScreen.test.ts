import { describe, expect, it } from 'vitest';
import type { FeedItem } from '../lib/api';
import { DICTS } from '../lib/i18n';
import { feedText } from './FeedScreen';

const check = (date: string): FeedItem =>
  ({ id: 'e1', type: 'check', date, createdAt: `${date}T19:29:00Z`, actor: { id: 1, firstName: 'Alex', photoUrl: null }, habit: null, otherUser: null }) as unknown as FeedItem;

describe('feedText', () => {
  it('says a plain "checked in" for a check made on the day it counts for, even days later in the feed', () => {
    expect(feedText(check('2026-11-07'), '2026-11-07', DICTS.en)).toBe('Checked in');
    expect(feedText(check('2026-11-07'), '2026-11-07', DICTS.ru)).toBe('Отметка');
  });

  it('names the day when someone checked in for an earlier day', () => {
    expect(feedText(check('2026-11-05'), '2026-11-07', DICTS.en)).toBe('Checked in for November 5');
  });
});
