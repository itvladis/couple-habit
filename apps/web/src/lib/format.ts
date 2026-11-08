import { addDays, isoWeekday, weekStart, type LocalDate } from '@habit/core/dates';
import type { Frequency, HabitView } from './api';
import type { Dict } from './i18n';

export function frequencyLabel(frequency: Frequency, t: Dict): string {
  switch (frequency.type) {
    case 'daily':
      return t.freq.daily;
    case 'weekly':
      return t.freq.weekly(frequency.times);
    case 'weekdays':
      return [...frequency.days].sort((a, b) => a - b).map((d) => t.freq.days[d - 1]).join(', ');
  }
}

/** "3 раза в неделю · все участники" for shared habits, just the frequency for personal ones. */
export function habitSubtitle(habit: Pick<HabitView, 'frequency' | 'completionMode' | 'members'>, t: Dict): string {
  const frequency = frequencyLabel(habit.frequency, t);
  if (habit.members.length < 2) return frequency;
  return `${frequency} · ${habit.completionMode === 'all' ? t.freq.all : t.freq.any}`;
}

const utc = (date: LocalDate) => new Date(`${date}T12:00:00Z`);

/** "СУББОТА, 8 НОЯБРЯ". */
export function headerDate(date: LocalDate, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(utc(date))
    .toUpperCase();
}

/** "8 ноября" / "November 8". */
export function dayMonth(date: LocalDate, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(utc(date));
}

export function shortMonth(date: LocalDate, locale: string): string {
  const name = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(utc(date)).replace('.', '');
  return name.charAt(0).toUpperCase() + name.slice(1, 3);
}

/** Local calendar date of an instant in the viewer's time zone. */
export function localDateOf(iso: string, timeZone: string): LocalDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export function timeOf(iso: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

/** Group label in the feed: "СЕГОДНЯ", "ВЧЕРА" or "6 НОЯБРЯ". */
export function feedDayLabel(date: LocalDate, today: LocalDate, t: Dict): string {
  if (date === today) return t.feed.today;
  if (date === addDays(today, -1)) return t.feed.yesterday;
  return dayMonth(date, t.locale).toUpperCase();
}

export type HeatmapPeriod = 'month' | 'halfYear' | 'year';
const PERIOD_WEEKS: Record<HeatmapPeriod, number> = { month: 5, halfYear: 26, year: 52 };

export interface HeatmapLayout {
  from: LocalDate;
  to: LocalDate;
  /** Columns of Monday-first weeks; null marks days after today. */
  weeks: (LocalDate | null)[][];
  /** Column index where a new month starts, with its label date. */
  monthStarts: { column: number; date: LocalDate }[];
}

export function heatmapLayout(today: LocalDate, period: HeatmapPeriod): HeatmapLayout {
  const lastMonday = weekStart(today);
  const firstMonday = addDays(lastMonday, -7 * (PERIOD_WEEKS[period] - 1));
  const weeks: (LocalDate | null)[][] = [];
  const monthStarts: { column: number; date: LocalDate }[] = [];
  for (let column = 0; column < PERIOD_WEEKS[period]; column++) {
    const monday = addDays(firstMonday, column * 7);
    weeks.push(Array.from({ length: 7 }, (_, row) => {
      const date = addDays(monday, row);
      return date > today ? null : date;
    }));
    const previousMonth = column === 0 ? '' : addDays(monday, -7).slice(0, 7);
    if (monday.slice(0, 7) !== previousMonth) monthStarts.push({ column, date: monday });
  }
  return { from: firstMonday, to: today, weeks, monthStarts };
}

export const weekdayIndex = (date: LocalDate) => isoWeekday(date) - 1;

const AVATAR_GRADIENTS: [string, string][] = [
  ['#7AA7FF', '#4E6BF2'],
  ['#FF9EC4', '#E0569A'],
  ['#FFC97A', '#F08A3C'],
  ['#8EE3A5', '#2F9E55'],
  ['#C3A6FF', '#7B5CF0'],
  ['#7FE0D0', '#1FA894'],
];

/** Stable gradient per user, so the same person keeps the same color everywhere. */
export function avatarGradient(id: number): string {
  const [from, to] = AVATAR_GRADIENTS[Math.abs(id) % AVATAR_GRADIENTS.length]!;
  return `linear-gradient(135deg, ${from}, ${to})`;
}

export const initialOf = (name: string) => (name.trim()[0] ?? '?').toUpperCase();
