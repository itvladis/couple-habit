/** Calendar date in a user's own time zone, formatted as YYYY-MM-DD. */
export type LocalDate = string;

/** Past days can be checked up to this many days back (the yearly heatmap reaches this far). */
export const MAX_BACKFILL_DAYS = 366;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MS_PER_DAY = 86_400_000;
const MINUTES_PER_HOUR = 60;

function toUtcMs(date: LocalDate): number {
  const match = DATE_RE.exec(date);
  if (!match) throw new Error(`Invalid local date: ${date}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function fromUtcMs(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isLocalDate(value: string): boolean {
  return DATE_RE.test(value) && fromUtcMs(toUtcMs(value)) === value;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

/** Whole days from `b` to `a` (positive when `a` is later). */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtcMs(a) - toUtcMs(b)) / MS_PER_DAY);
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
export function isoWeekday(date: LocalDate): number {
  const day = new Date(toUtcMs(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Monday of the week that contains `date`. */
export function weekStart(date: LocalDate): LocalDate {
  return addDays(date, 1 - isoWeekday(date));
}

export function minDate(a: LocalDate, b: LocalDate): LocalDate {
  return a < b ? a : b;
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export interface LocalClock {
  date: LocalDate;
  /** Minutes since local midnight, 0…1439. */
  minutes: number;
  weekday: number;
}

/** What the wall clock shows in `timeZone` at `instant`. */
export function localClock(timeZone: string, instant: Date): LocalClock {
  const parts: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(instant)) parts[part.type] = part.value;
  if (!parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute) {
    throw new Error(`Could not read local time in ${timeZone}`);
  }
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * MINUTES_PER_HOUR + Number(parts.minute);
  return { date, minutes, weekday: isoWeekday(date) };
}

/** Minutes since midnight → zero-padded "HH:MM". */
export function formatHhMm(minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(minutes / MINUTES_PER_HOUR))}:${pad(minutes % MINUTES_PER_HOUR)}`;
}

/** "HH:MM" → minutes since midnight, or null when the value is not a valid time. */
export function parseHhMm(value: string): number | null {
  const match = TIME_RE.exec(value);
  if (!match) return null;
  return Number(match[1]) * MINUTES_PER_HOUR + Number(match[2]);
}
