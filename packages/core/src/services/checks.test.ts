import { describe, expect, it } from 'vitest';
import { DEFAULT_HABIT, setup } from './test-helpers';

describe('checks', () => {
  it('marks today in the user’s own time zone', async () => {
    // 22:30 UTC is already Monday in Moscow but still Sunday in New York.
    const { app, user } = setup('2026-11-08T22:30:00Z');
    await user(1, 'Влад', 'Europe/Moscow');
    await user(2, 'Маша', 'America/New_York');
    const vladHabit = await app.habits.create(1, DEFAULT_HABIT);
    const mashaHabit = await app.habits.create(2, DEFAULT_HABIT);

    expect((await app.checks.check(1, vladHabit.id)).date).toBe('2026-11-09');
    expect((await app.checks.check(2, mashaHabit.id)).date).toBe('2026-11-08');
  });

  it('is idempotent and can be undone', async () => {
    const { app, user } = setup();
    await user(1, 'Влад');
    const habit = await app.habits.create(1, DEFAULT_HABIT);

    expect((await app.checks.check(1, habit.id)).created).toBe(true);
    expect((await app.checks.check(1, habit.id)).created).toBe(false);
    await app.checks.uncheck(1, habit.id, '2026-11-08');

    const [view] = await app.views.myHabits(1);
    expect(view?.checkedToday).toBe(false);
  });

  it('allows past days but rejects future ones', async () => {
    const { app, user } = setup();
    await user(1, 'Влад');
    const habit = await app.habits.create(1, DEFAULT_HABIT);

    await expect(app.checks.check(1, habit.id, '2026-11-01')).resolves.toMatchObject({ created: true });
    await expect(app.checks.check(1, habit.id, '2026-11-09')).rejects.toMatchObject({ code: 'invalid' });
    await expect(app.checks.check(1, habit.id, '2024-01-01')).rejects.toMatchObject({ code: 'invalid' });
  });

  it('rejects checks from non-members and on archived habits', async () => {
    const { app, user } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    const habit = await app.habits.create(1, DEFAULT_HABIT);

    await expect(app.checks.check(2, habit.id)).rejects.toMatchObject({ code: 'not_found' });
    await app.habits.archive(1, habit.id);
    await expect(app.checks.check(1, habit.id)).rejects.toMatchObject({ code: 'invalid' });
  });

  it('notifies other members and offers to check too', async () => {
    const { app, user, sharedHabit, sent } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    const habit = await sharedHabit(1, 2);

    await app.checks.check(2, habit.id);

    expect(sent).toEqual([
      expect.objectContaining({ type: 'member_checked', to: 1, recipientChecked: false, dayCompleted: false }),
    ]);
  });

  it('tells members the day is complete once everyone checks in "all" mode', async () => {
    const { app, user, sharedHabit, sent } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    const habit = await sharedHabit(1, 2);

    await app.checks.check(1, habit.id);
    await app.checks.check(2, habit.id);

    expect(sent.at(-1)).toMatchObject({ type: 'member_checked', to: 1, recipientChecked: true, dayCompleted: true });
    const [view] = await app.views.myHabits(1);
    expect(view?.doneToday).toBe(true);
    expect(view?.streak.current).toBe(1);
  });

  it('respects a member who turned check notifications off', async () => {
    const { app, user, sharedHabit, sent } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    const habit = await sharedHabit(1, 2);

    await app.habits.updateMembership(1, habit.id, { notifyOnCheck: false });
    await app.checks.check(2, habit.id);

    expect(sent).toEqual([]);
  });
});

describe('check notifications', () => {
  it('does not re-notify when someone toggles the same day off and on', async () => {
    const { app, user, sharedHabit, sent } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    const habit = await sharedHabit(1, 2);

    await app.checks.check(2, habit.id);
    await app.checks.uncheck(2, habit.id, '2026-11-08');
    await app.checks.check(2, habit.id);

    expect(sent.filter((n) => n.type === 'member_checked')).toHaveLength(1);
  });

  it('creates only one check and one notice when the same check arrives twice at once', async () => {
    const { app, user, sharedHabit, sent } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    const habit = await sharedHabit(1, 2);

    const results = await Promise.all([app.checks.check(2, habit.id), app.checks.check(2, habit.id)]);

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(sent.filter((n) => n.type === 'member_checked')).toHaveLength(1);
  });
});
