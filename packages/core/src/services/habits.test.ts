import { describe, expect, it } from 'vitest';
import { DEFAULT_HABIT, setup } from './test-helpers';

describe('habits', () => {
  it('creates a habit with its creator as owner and first member', async () => {
    const { app, user } = setup();
    await user(1, 'Влад');

    const habit = await app.habits.create(1, DEFAULT_HABIT);
    const [view] = await app.views.myHabits(1);

    expect(habit.ownerId).toBe(1);
    expect(habit.startDate).toBe('2026-11-08');
    expect(view?.members.map((m) => m.userId)).toEqual([1]);
  });

  it('lets only the owner edit the habit', async () => {
    const { app, user, sharedHabit } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    const habit = await sharedHabit(1, 2);

    await expect(app.habits.update(2, habit.id, { title: 'Взлом' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(app.habits.update(1, habit.id, { title: 'Бег' })).resolves.toMatchObject({ title: 'Бег' });
  });

  it('moves archived habits out of the main list', async () => {
    const { app, user } = setup();
    await user(1, 'Влад');
    const habit = await app.habits.create(1, DEFAULT_HABIT);

    await app.habits.archive(1, habit.id);

    expect(await app.views.myHabits(1)).toEqual([]);
    expect((await app.views.myHabits(1, { archived: true })).map((h) => h.id)).toEqual([habit.id]);
  });

  it('transfers ownership only to a current member', async () => {
    const { app, user, sharedHabit, sent } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    await user(3, 'Дима');
    const habit = await sharedHabit(1, 2);

    await expect(app.habits.transferOwnership(1, habit.id, 3)).rejects.toMatchObject({ code: 'invalid' });
    const updated = await app.habits.transferOwnership(1, habit.id, 2);

    expect(updated.ownerId).toBe(2);
    expect(sent).toContainEqual(expect.objectContaining({ type: 'ownership_received', to: 2 }));
  });

  it('hands ownership to the oldest remaining member when the owner leaves', async () => {
    const { app, user, sharedHabit } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    const habit = await sharedHabit(1, 2);

    await app.habits.leave(1, habit.id);
    const [view] = await app.views.myHabits(2);

    expect(view?.ownerId).toBe(2);
    expect(await app.views.myHabits(1)).toEqual([]);
  });

  it('refuses to let the last member leave and suggests archiving instead', async () => {
    const { app, user } = setup();
    await user(1, 'Влад');
    const habit = await app.habits.create(1, DEFAULT_HABIT);

    await expect(app.habits.leave(1, habit.id)).rejects.toMatchObject({ code: 'invalid' });
  });

  it('lets the owner remove a member but not themself', async () => {
    const { app, user, sharedHabit } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    const habit = await sharedHabit(1, 2);

    await expect(app.habits.removeMember(1, habit.id, 1)).rejects.toMatchObject({ code: 'invalid' });
    await app.habits.removeMember(1, habit.id, 2);

    expect(await app.views.myHabits(2)).toEqual([]);
  });

  it('validates habit input at the boundary', async () => {
    const { app, user } = setup();
    await user(1, 'Влад');

    await expect(app.habits.create(1, { ...DEFAULT_HABIT, title: '   ' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      app.habits.create(1, { ...DEFAULT_HABIT, frequency: { type: 'weekly', times: 9 } }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('personal habit settings', () => {
  it('stores the card size per member, normal by default', async () => {
    const { app, user, sharedHabit } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    const habit = await sharedHabit(1, 2);

    await app.habits.updateMembership(1, habit.id, { cardSize: 'wide' });

    expect((await app.views.habit(1, habit.id)).membership?.cardSize).toBe('wide');
    expect((await app.views.habit(2, habit.id)).membership?.cardSize).toBe('normal');
    await expect(app.habits.updateMembership(1, habit.id, { cardSize: 'huge' })).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('habit stats', () => {
  it('reports total done days and the completion rate', async () => {
    const { app, user } = setup();
    await user(1, 'Влад');
    const habit = await app.habits.create(1, DEFAULT_HABIT);
    for (const day of ['2026-11-05', '2026-11-06', '2026-11-08']) await app.checks.check(1, habit.id, day);

    const view = await app.views.habit(1, habit.id);

    // 5–8 Nov: four days, three done.
    expect(view.stats).toEqual({ totalDone: 3, completionRate: 0.75 });
  });

  it('has no rate before the first finished period', async () => {
    const { app, user } = setup();
    await user(1, 'Влад');
    const habit = await app.habits.create(1, DEFAULT_HABIT);

    expect((await app.views.habit(1, habit.id)).stats).toEqual({ totalDone: 0, completionRate: null });
  });
});
