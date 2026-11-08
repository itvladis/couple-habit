import { describe, expect, it } from 'vitest';
import { toFrequency, toReminder } from './HabitEditor';

describe('HabitEditor draft conversion', () => {
  it('builds the frequency the API expects', () => {
    expect(toFrequency({ freqType: 'daily', days: [5, 1], times: 3 })).toEqual({ type: 'daily' });
    expect(toFrequency({ freqType: 'weekly', days: [], times: 4 })).toEqual({ type: 'weekly', times: 4 });
    expect(toFrequency({ freqType: 'weekdays', days: [5, 1, 3], times: 3 })).toEqual({ type: 'weekdays', days: [1, 3, 5] });
  });

  it('builds the reminder or none', () => {
    const times = { at: '07:30', from: '18:00', to: '21:00' };

    expect(toReminder({ reminderMode: 'exact', ...times })).toEqual({ type: 'exact', time: '07:30' });
    expect(toReminder({ reminderMode: 'window', ...times })).toEqual({ type: 'window', from: '18:00', to: '21:00' });
    expect(toReminder({ reminderMode: 'off', ...times })).toBeNull();
  });
});
