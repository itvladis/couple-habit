import { isoWeekday, type LocalDate } from './dates';

export type Frequency =
  | { type: 'daily' }
  /** ISO weekdays, Monday = 1 … Sunday = 7. */
  | { type: 'weekdays'; days: readonly number[] }
  | { type: 'weekly'; times: number };

export const DAYS_PER_WEEK = 7;

/** Whether the habit expects a check on `date`. N-times-a-week habits accept any day. */
export function isScheduledDay(frequency: Frequency, date: LocalDate): boolean {
  if (frequency.type === 'weekdays') return frequency.days.includes(isoWeekday(date));
  return true;
}

/** How many completed days make a full week. */
export function weeklyTarget(frequency: Frequency): number {
  switch (frequency.type) {
    case 'daily':
      return DAYS_PER_WEEK;
    case 'weekdays':
      return frequency.days.length;
    case 'weekly':
      return frequency.times;
  }
}
