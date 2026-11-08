import type { HabitView } from '../lib/api';

/** A realistic habit view as the API returns it, with overridable fields. */
export function habitView(overrides: Partial<HabitView> = {}): HabitView {
  const today = '2026-11-08';
  const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', today];
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Зал вместе',
    icon: 'dumbbell',
    color: 'mint',
    frequency: { type: 'daily' },
    completionMode: 'all',
    visibility: 'friends',
    ownerId: 1,
    isOwner: true,
    archived: false,
    startDate: '2026-11-01',
    today,
    checkedToday: false,
    doneToday: false,
    week: days.map((date) => ({ date, done: false, mine: false })),
    weekProgress: { done: 0, target: 7 },
    streak: { current: 0, best: 0, unit: 'day' },
    stats: { totalDone: 0, completionRate: null },
    members: [{ userId: 1, firstName: 'Влад', photoUrl: null, isOwner: true, checkedToday: false, week: days.map(() => false) }],
    membership: { notifyOnCheck: true, reminder: null, cardSize: 'normal' },
    ...overrides,
  };
}
