import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  isLocalDate,
  isValidTimeZone,
  isoWeekday,
  localClock,
  formatHhMm,
  parseHhMm,
  weekStart,
} from './dates';

describe('isLocalDate', () => {
  it('accepts real calendar dates', () => {
    expect(isLocalDate('2026-11-08')).toBe(true);
    expect(isLocalDate('2028-02-29')).toBe(true);
  });

  it('rejects malformed and impossible dates', () => {
    expect(isLocalDate('2026-2-08')).toBe(false);
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('2027-02-29')).toBe(false);
    expect(isLocalDate('hello')).toBe(false);
  });
});

describe('date arithmetic', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts days between dates', () => {
    expect(diffDays('2026-11-08', '2026-11-01')).toBe(7);
    expect(diffDays('2026-11-01', '2026-11-08')).toBe(-7);
  });

  it('returns ISO weekday with Monday = 1 and Sunday = 7', () => {
    expect(isoWeekday('2026-11-09')).toBe(1);
    expect(isoWeekday('2026-11-08')).toBe(7);
  });

  it('finds Monday of the week', () => {
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
  });
});

describe('time zones', () => {
  it('validates IANA time zone names', () => {
    expect(isValidTimeZone('Europe/Moscow')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('gives each user their own local date for the same instant', () => {
    const instant = new Date('2026-11-08T22:30:00Z');

    expect(localClock('Europe/Moscow', instant)).toEqual({ date: '2026-11-09', minutes: 90, weekday: 1 });
    expect(localClock('America/New_York', instant)).toEqual({ date: '2026-11-08', minutes: 17 * 60 + 30, weekday: 7 });
  });

  it('reports midnight as minute 0, not 24:00', () => {
    expect(localClock('UTC', new Date('2026-11-08T00:00:00Z')).minutes).toBe(0);
  });
});

describe('parseHhMm', () => {
  it('converts HH:MM to minutes since midnight', () => {
    expect(parseHhMm('00:00')).toBe(0);
    expect(parseHhMm('18:45')).toBe(18 * 60 + 45);
  });

  it('returns null for invalid time', () => {
    expect(parseHhMm('24:00')).toBeNull();
    expect(parseHhMm('7:5')).toBeNull();
  });
});

describe('formatHhMm', () => {
  it('turns minutes since midnight into zero-padded HH:MM', () => {
    expect(formatHhMm(0)).toBe('00:00');
    expect(formatHhMm(9 * 60 + 5)).toBe('09:05');
    expect(formatHhMm(23 * 60 + 59)).toBe('23:59');
  });
});
