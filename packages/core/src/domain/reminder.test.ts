import { describe, expect, it } from 'vitest';
import { reminderMinute, isReminderDue } from './reminder';

describe('reminderMinute', () => {
  it('uses the exact time for exact reminders', () => {
    expect(reminderMinute({ type: 'exact', time: '09:30' }, 'seed')).toBe(9 * 60 + 30);
  });

  it('picks a stable random minute inside the window', () => {
    const window = { type: 'window', from: '18:00', to: '21:00' } as const;
    const first = reminderMinute(window, 'habit-1:42:2026-11-08');

    expect(first).toBeGreaterThanOrEqual(18 * 60);
    expect(first).toBeLessThanOrEqual(21 * 60);
    expect(reminderMinute(window, 'habit-1:42:2026-11-08')).toBe(first);
  });

  it('varies the minute between days', () => {
    const window = { type: 'window', from: '08:00', to: '22:00' } as const;
    const minutes = new Set(Array.from({ length: 10 }, (_, i) => reminderMinute(window, `h:1:2026-11-${10 + i}`)));

    expect(minutes.size).toBeGreaterThan(1);
  });
});

describe('isReminderDue', () => {
  it('fires from the target minute for up to an hour', () => {
    expect(isReminderDue(600, 599)).toBe(false);
    expect(isReminderDue(600, 600)).toBe(true);
    expect(isReminderDue(600, 659)).toBe(true);
    expect(isReminderDue(600, 660)).toBe(false);
  });
});
