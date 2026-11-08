import { describe, expect, it } from 'vitest';
import { isScheduledDay } from './schedule';

describe('isScheduledDay', () => {
  it('schedules every day for daily habits', () => {
    expect(isScheduledDay({ type: 'daily' }, '2026-11-08')).toBe(true);
  });

  it('schedules only the chosen ISO weekdays', () => {
    const monWedFri = { type: 'weekdays', days: [1, 3, 5] } as const;

    expect(isScheduledDay(monWedFri, '2026-11-09')).toBe(true);
    expect(isScheduledDay(monWedFri, '2026-11-10')).toBe(false);
  });

  it('lets N-times-a-week habits be done on any day', () => {
    expect(isScheduledDay({ type: 'weekly', times: 3 }, '2026-11-10')).toBe(true);
  });
});
