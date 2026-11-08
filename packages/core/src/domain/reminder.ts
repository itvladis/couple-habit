import { parseHhMm } from './dates';

export type Reminder =
  | { type: 'exact'; time: string }
  /** A random minute between `from` and `to` (inclusive), different every day. */
  | { type: 'window'; from: string; to: string };

/** How long after its minute a reminder may still go out (covers skipped scheduler ticks). */
export const REMINDER_GRACE_MINUTES = 60;

function requireMinutes(value: string): number {
  const minutes = parseHhMm(value);
  if (minutes === null) throw new Error(`Invalid reminder time: ${value}`);
  return minutes;
}

/** 32-bit FNV-1a: cheap, stable, good enough to spread reminders across a window. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Local minute of the day when the reminder should fire.
 * @param seed stable per habit, user and date so the random minute does not move between ticks.
 */
export function reminderMinute(reminder: Reminder, seed: string): number {
  if (reminder.type === 'exact') return requireMinutes(reminder.time);
  const from = requireMinutes(reminder.from);
  const to = requireMinutes(reminder.to);
  if (to < from) throw new Error(`Reminder window ends before it starts: ${reminder.from}–${reminder.to}`);
  return from + (hash(seed) % (to - from + 1));
}

export function isReminderDue(targetMinute: number, nowMinute: number): boolean {
  return nowMinute >= targetMinute && nowMinute < targetMinute + REMINDER_GRACE_MINUTES;
}
