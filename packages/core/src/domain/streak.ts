import { addDays, minDate, weekStart, type LocalDate } from './dates';
import { DAYS_PER_WEEK, isScheduledDay, weeklyTarget, type Frequency } from './schedule';

export interface Streak {
  current: number;
  best: number;
  /** Weekly habits are counted in weeks, the rest in (scheduled) days. */
  unit: 'day' | 'week';
}

type PeriodStatus = 'done' | 'missed' | 'pending';

function earliest(done: ReadonlySet<LocalDate>, fallback: LocalDate): LocalDate {
  let result = fallback;
  for (const date of done) result = minDate(result, date);
  return result;
}

/** Folds period statuses into current and best runs. A pending period (today / this week) never breaks a run. */
function runs(statuses: Iterable<PeriodStatus>): { current: number; best: number } {
  let run = 0;
  let best = 0;
  for (const status of statuses) {
    if (status === 'pending') continue;
    run = status === 'done' ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current: run, best };
}

function* dayStatuses(frequency: Frequency, done: ReadonlySet<LocalDate>, start: LocalDate, today: LocalDate) {
  for (let date = start; date <= today; date = addDays(date, 1)) {
    if (!isScheduledDay(frequency, date)) continue;
    if (done.has(date)) yield 'done' as const;
    else yield date === today ? ('pending' as const) : ('missed' as const);
  }
}

function* weekStatuses(target: number, done: ReadonlySet<LocalDate>, start: LocalDate, today: LocalDate) {
  const perWeek = new Map<LocalDate, number>();
  for (const date of done) {
    if (date > today) continue;
    const week = weekStart(date);
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  }
  const currentWeek = weekStart(today);
  for (let week = weekStart(start); week <= currentWeek; week = addDays(week, DAYS_PER_WEEK)) {
    if ((perWeek.get(week) ?? 0) >= target) yield 'done' as const;
    else yield week === currentWeek ? ('pending' as const) : ('missed' as const);
  }
}

function statuses(frequency: Frequency, done: ReadonlySet<LocalDate>, start: LocalDate, today: LocalDate) {
  return frequency.type === 'weekly' ? weekStatuses(frequency.times, done, start, today) : dayStatuses(frequency, done, start, today);
}

/**
 * Finished periods (scheduled days, or weeks for N-times-a-week habits) and how many of them were done.
 * Today / this week only counts once it is done, like in streaks.
 */
export function completionRate(
  frequency: Frequency,
  done: ReadonlySet<LocalDate>,
  startDate: LocalDate,
  today: LocalDate,
): { done: number; total: number } {
  const start = minDate(earliest(done, startDate), today);
  let doneCount = 0;
  let total = 0;
  for (const status of statuses(frequency, done, start, today)) {
    if (status === 'pending') continue;
    total++;
    if (status === 'done') doneCount++;
  }
  return { done: doneCount, total };
}

/**
 * Current and best streak.
 * @param startDate local date the habit started; earlier retroactive checks extend it.
 * @param today the viewer's local date.
 */
export function computeStreak(
  frequency: Frequency,
  done: ReadonlySet<LocalDate>,
  startDate: LocalDate,
  today: LocalDate,
): Streak {
  const start = minDate(earliest(done, startDate), today);
  if (frequency.type === 'weekly') {
    return { ...runs(weekStatuses(frequency.times, done, start, today)), unit: 'week' };
  }
  return { ...runs(dayStatuses(frequency, done, start, today)), unit: 'day' };
}

/** Completed scheduled days in the current Monday-based week versus the weekly target. */
export function weekProgress(
  frequency: Frequency,
  done: ReadonlySet<LocalDate>,
  today: LocalDate,
): { done: number; target: number } {
  const monday = weekStart(today);
  const sunday = addDays(monday, DAYS_PER_WEEK - 1);
  let count = 0;
  for (const date of done) {
    if (date >= monday && date <= sunday && isScheduledDay(frequency, date)) count++;
  }
  return { done: count, target: weeklyTarget(frequency) };
}
