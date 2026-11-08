import { describe, expect, it } from 'vitest';
import { completedDates } from './completion';

const vlad = { userId: 1, joinedDate: '2026-11-01' };
const masha = { userId: 2, joinedDate: '2026-11-01' };
const dima = { userId: 3, joinedDate: '2026-11-05' };

describe('completedDates', () => {
  it('counts a personal habit day once its only member checks it', () => {
    const done = completedDates('all', [vlad], [{ userId: 1, date: '2026-11-02' }]);

    expect([...done]).toEqual(['2026-11-02']);
  });

  it('in "all" mode needs every member who had joined by that day', () => {
    const checks = [
      { userId: 1, date: '2026-11-02' },
      { userId: 1, date: '2026-11-03' },
      { userId: 2, date: '2026-11-03' },
    ];

    expect([...completedDates('all', [vlad, masha], checks)]).toEqual(['2026-11-03']);
  });

  it('in "all" mode does not require members for days before they joined', () => {
    const checks = [
      { userId: 1, date: '2026-11-04' },
      { userId: 2, date: '2026-11-04' },
      { userId: 1, date: '2026-11-05' },
      { userId: 2, date: '2026-11-05' },
    ];

    expect([...completedDates('all', [vlad, masha, dima], checks)]).toEqual(['2026-11-04']);
  });

  it('in "all" mode treats past days before the habit started as needing the founders', () => {
    const checks = [{ userId: 1, date: '2026-10-30' }];

    expect(completedDates('all', [vlad, masha], checks).size).toBe(0);
  });

  it('in "any" mode counts a day once anyone checks it', () => {
    const checks = [
      { userId: 2, date: '2026-11-02' },
      { userId: 1, date: '2026-11-03' },
    ];

    expect([...completedDates('any', [vlad, masha], checks)].sort()).toEqual(['2026-11-02', '2026-11-03']);
  });

  it('ignores checks of people who are no longer members', () => {
    const checks = [{ userId: 99, date: '2026-11-02' }];

    expect(completedDates('any', [vlad], checks).size).toBe(0);
  });

  it('returns nothing when the habit has no members', () => {
    expect(completedDates('all', [], [{ userId: 1, date: '2026-11-02' }]).size).toBe(0);
  });
});
