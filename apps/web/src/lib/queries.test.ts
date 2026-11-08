import { describe, expect, it } from 'vitest';
import { habitView } from '../test/fixtures';
import { applyCheck } from './queries';

describe('applyCheck', () => {
  it('marks today as checked and done for a personal habit', () => {
    const next = applyCheck(habitView(), 1, '2026-11-08', true);

    expect(next.checkedToday).toBe(true);
    expect(next.doneToday).toBe(true);
    expect(next.week.at(-1)).toEqual({ date: '2026-11-08', done: true, mine: true });
    expect(next.members[0]?.checkedToday).toBe(true);
    expect(next.members[0]?.week.at(-1)).toBe(true);
  });

  it('does not guess the group result for a shared habit', () => {
    const shared = habitView({
      members: [
        { userId: 1, firstName: 'Влад', photoUrl: null, isOwner: true, checkedToday: false, week: Array(7).fill(false) },
        { userId: 2, firstName: 'Маша', photoUrl: null, isOwner: false, checkedToday: false, week: Array(7).fill(false) },
      ],
    });

    const next = applyCheck(shared, 1, '2026-11-08', true);

    expect(next.checkedToday).toBe(true);
    expect(next.doneToday).toBe(false);
    expect(next.week.at(-1)).toEqual({ date: '2026-11-08', done: false, mine: true });
    expect(next.members[1]?.checkedToday).toBe(false);
  });

  it('marks a past day without touching today', () => {
    const next = applyCheck(habitView(), 1, '2026-11-05', true);

    expect(next.checkedToday).toBe(false);
    expect(next.week.find((d) => d.date === '2026-11-05')).toEqual({ date: '2026-11-05', done: true, mine: true });
    expect(next.members[0]?.week[3]).toBe(true);
  });

  it('undoes a check', () => {
    const checked = applyCheck(habitView(), 1, '2026-11-08', true);

    expect(applyCheck(checked, 1, '2026-11-08', false).checkedToday).toBe(false);
  });
});
