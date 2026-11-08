import { describe, expect, it } from 'vitest';
import { completionRate, computeStreak, weekProgress } from './streak';

const days = (...list: string[]) => new Set(list);

describe('computeStreak — daily', () => {
  const daily = { type: 'daily' } as const;

  it('counts consecutive days ending today', () => {
    const result = computeStreak(daily, days('2026-11-06', '2026-11-07', '2026-11-08'), '2026-11-01', '2026-11-08');

    expect(result).toEqual({ current: 3, best: 3, unit: 'day' });
  });

  it('keeps the streak alive while today is not checked yet', () => {
    const result = computeStreak(daily, days('2026-11-06', '2026-11-07'), '2026-11-01', '2026-11-08');

    expect(result.current).toBe(2);
  });

  it('breaks the streak after a missed day and remembers the best run', () => {
    const done = days('2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-07', '2026-11-08');

    expect(computeStreak(daily, done, '2026-11-01', '2026-11-08')).toEqual({ current: 2, best: 4, unit: 'day' });
  });

  it('returns zero when nothing is done', () => {
    expect(computeStreak(daily, days(), '2026-11-01', '2026-11-08')).toEqual({ current: 0, best: 0, unit: 'day' });
  });

  it('counts past days checked before the habit was created', () => {
    const done = days('2026-10-30', '2026-10-31', '2026-11-01');

    expect(computeStreak(daily, done, '2026-11-01', '2026-11-01').current).toBe(3);
  });
});

describe('computeStreak — weekdays', () => {
  const monWedFri = { type: 'weekdays', days: [1, 3, 5] } as const;

  it('skips unscheduled days without breaking the streak', () => {
    // Mon 2 Nov, Wed 4 Nov, Fri 6 Nov done; today is Sun 8 Nov (unscheduled).
    const done = days('2026-11-02', '2026-11-04', '2026-11-06');

    expect(computeStreak(monWedFri, done, '2026-11-01', '2026-11-08')).toEqual({ current: 3, best: 3, unit: 'day' });
  });

  it('breaks on a missed scheduled day', () => {
    // Wed 4 Nov missed.
    const done = days('2026-11-02', '2026-11-06');

    expect(computeStreak(monWedFri, done, '2026-11-01', '2026-11-08').current).toBe(1);
  });

  it('does not add extra checks on unscheduled days', () => {
    const done = days('2026-11-06', '2026-11-07');

    expect(computeStreak(monWedFri, done, '2026-11-06', '2026-11-08').current).toBe(1);
  });

  it('keeps the streak when today is scheduled but not checked yet', () => {
    // Today Mon 9 Nov, not checked.
    const done = days('2026-11-04', '2026-11-06');

    expect(computeStreak(monWedFri, done, '2026-11-04', '2026-11-09').current).toBe(2);
  });
});

describe('computeStreak — N times a week', () => {
  const thrice = { type: 'weekly', times: 3 } as const;

  it('counts weeks in a row where the target was met', () => {
    const done = days(
      '2026-10-26', '2026-10-28', '2026-10-30', // week of 26 Oct: 3
      '2026-11-02', '2026-11-03', '2026-11-05', // week of 2 Nov: 3
    );

    expect(computeStreak(thrice, done, '2026-10-26', '2026-11-08')).toEqual({ current: 2, best: 2, unit: 'week' });
  });

  it('keeps the streak while the current week is still in progress', () => {
    const done = days('2026-11-02', '2026-11-03', '2026-11-05', '2026-11-09');

    expect(computeStreak(thrice, done, '2026-11-02', '2026-11-10').current).toBe(1);
  });

  it('counts the current week as soon as the target is reached', () => {
    const done = days('2026-11-09', '2026-11-10', '2026-11-11');

    expect(computeStreak(thrice, done, '2026-11-09', '2026-11-11').current).toBe(1);
  });

  it('breaks after a week below target', () => {
    const done = days('2026-10-26', '2026-10-28', '2026-10-30', '2026-11-02', '2026-11-09', '2026-11-10', '2026-11-11');

    expect(computeStreak(thrice, done, '2026-10-26', '2026-11-12')).toEqual({ current: 1, best: 1, unit: 'week' });
  });
});

describe('weekProgress', () => {
  it('counts completed days in the current Monday-based week', () => {
    const done = days('2026-11-01', '2026-11-02', '2026-11-04');

    expect(weekProgress({ type: 'weekly', times: 3 }, done, '2026-11-08')).toEqual({ done: 2, target: 3 });
  });

  it('uses scheduled days as the target for weekday habits', () => {
    expect(weekProgress({ type: 'weekdays', days: [1, 3, 5] }, days('2026-11-02'), '2026-11-08')).toEqual({ done: 1, target: 3 });
  });

  it('uses seven as the target for daily habits', () => {
    expect(weekProgress({ type: 'daily' }, days(), '2026-11-08')).toEqual({ done: 0, target: 7 });
  });
});

describe('completionRate', () => {
  it('counts finished scheduled days and ignores today until it is done', () => {
    // 1–7 Nov: 5 of 7 days done, today 8 Nov not done yet.
    const done = days('2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05', '2026-11-07');

    expect(completionRate({ type: 'daily' }, done, '2026-11-01', '2026-11-08')).toEqual({ done: 5, total: 7 });
  });

  it('includes today once it is done', () => {
    expect(completionRate({ type: 'daily' }, days('2026-11-08'), '2026-11-08', '2026-11-08')).toEqual({ done: 1, total: 1 });
  });

  it('counts only scheduled weekdays', () => {
    // Mon/Wed/Fri from Mon 2 Nov to Sun 8 Nov: three scheduled days, two done.
    const done = days('2026-11-02', '2026-11-06', '2026-11-07');

    expect(completionRate({ type: 'weekdays', days: [1, 3, 5] }, done, '2026-11-02', '2026-11-08')).toEqual({ done: 2, total: 3 });
  });

  it('counts finished weeks for N-times-a-week habits', () => {
    const done = days('2026-10-26', '2026-10-28', '2026-10-30', '2026-11-02');

    expect(completionRate({ type: 'weekly', times: 3 }, done, '2026-10-26', '2026-11-04')).toEqual({ done: 1, total: 1 });
  });
});
