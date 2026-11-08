import type { LocalDate } from './dates';

/** "all": the day counts once every member checks it; "any": once anyone does. */
export type CompletionMode = 'all' | 'any';

export interface MemberSpan {
  userId: number;
  /** Local date the member joined the habit. */
  joinedDate: LocalDate;
}

export interface CheckMark {
  userId: number;
  date: LocalDate;
}

/**
 * Days on which the habit as a whole is done.
 * In "all" mode a member is only required from the day they joined; days before the habit
 * started (marked retroactively) require the founding members.
 */
export function completedDates(
  mode: CompletionMode,
  members: readonly MemberSpan[],
  checks: readonly CheckMark[],
): Set<LocalDate> {
  if (members.length === 0) return new Set();

  const memberIds = new Set(members.map((m) => m.userId));
  const checkersByDate = new Map<LocalDate, Set<number>>();
  for (const check of checks) {
    if (!memberIds.has(check.userId)) continue;
    let checkers = checkersByDate.get(check.date);
    if (!checkers) {
      checkers = new Set();
      checkersByDate.set(check.date, checkers);
    }
    checkers.add(check.userId);
  }

  if (mode === 'any') return new Set(checkersByDate.keys());

  const firstJoin = members.reduce((min, m) => (m.joinedDate < min ? m.joinedDate : min), members[0]!.joinedDate);
  const done = new Set<LocalDate>();
  for (const [date, checkers] of checkersByDate) {
    const effectiveDate = date < firstJoin ? firstJoin : date;
    const required = members.filter((m) => m.joinedDate <= effectiveDate);
    if (required.every((m) => checkers.has(m.userId))) done.add(date);
  }
  return done;
}
