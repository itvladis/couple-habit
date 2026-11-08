import { describe, expect, it } from 'vitest';
import { DEFAULT_HABIT, setup } from './test-helpers';

describe('reminders', () => {
  it('sends an exact-time reminder once per day', async () => {
    const { app, user, sent, setNow } = setup('2026-11-08T05:00:00Z'); // 08:00 Moscow
    await user(1, 'Влад');
    const habit = await app.habits.create(1, DEFAULT_HABIT);
    await app.habits.updateMembership(1, habit.id, { reminder: { type: 'exact', time: '09:00' } });

    await app.jobs.tick();
    expect(sent).toEqual([]);

    setNow('2026-11-08T06:00:00Z'); // 09:00 Moscow
    await app.jobs.tick();
    setNow('2026-11-08T06:05:00Z');
    await app.jobs.tick();

    expect(sent.filter((n) => n.type === 'reminder')).toEqual([expect.objectContaining({ time: '09:00' })]);
  });

  it('skips the reminder when the user already checked today', async () => {
    const { app, user, sent, setNow } = setup('2026-11-08T05:00:00Z');
    await user(1, 'Влад');
    const habit = await app.habits.create(1, DEFAULT_HABIT);
    await app.habits.updateMembership(1, habit.id, { reminder: { type: 'exact', time: '09:00' } });
    await app.checks.check(1, habit.id);

    setNow('2026-11-08T06:00:00Z');
    await app.jobs.tick();

    expect(sent.filter((n) => n.type === 'reminder')).toEqual([]);
  });

  it('skips days the habit is not scheduled on', async () => {
    // Sunday 8 Nov, habit on Mon/Wed/Fri.
    const { app, user, sent } = setup('2026-11-08T06:00:00Z');
    await user(1, 'Влад');
    const habit = await app.habits.create(1, { ...DEFAULT_HABIT, frequency: { type: 'weekdays', days: [1, 3, 5] } });
    await app.habits.updateMembership(1, habit.id, { reminder: { type: 'exact', time: '09:00' } });

    await app.jobs.tick();

    expect(sent).toEqual([]);
  });

  it('respects the global reminders switch', async () => {
    const { app, user, sent } = setup('2026-11-08T06:00:00Z');
    await user(1, 'Влад');
    const habit = await app.habits.create(1, DEFAULT_HABIT);
    await app.habits.updateMembership(1, habit.id, { reminder: { type: 'exact', time: '09:00' } });
    await app.users.updateSettings(1, { remindersEnabled: false });

    await app.jobs.tick();

    expect(sent).toEqual([]);
  });

  it('fires a window reminder somewhere inside the window', async () => {
    const { app, user, sent, setNow } = setup('2026-11-08T15:00:00Z'); // 18:00 Moscow
    await user(1, 'Влад');
    const habit = await app.habits.create(1, DEFAULT_HABIT);
    await app.habits.updateMembership(1, habit.id, { reminder: { type: 'window', from: '18:00', to: '19:00' } });

    for (let minute = 0; minute <= 60; minute += 5) {
      setNow(new Date(Date.parse('2026-11-08T15:00:00Z') + minute * 60_000).toISOString());
      await app.jobs.tick();
    }

    const reminders = sent.filter((n) => n.type === 'reminder');
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ time: expect.stringMatching(/^18:[0-5]\d$|^19:00$/) });
  });
});

describe('weekly summary', () => {
  it('sends the summary once on Sunday after the chosen time', async () => {
    const { app, user, sent, setNow } = setup('2026-11-08T16:00:00Z'); // Sun 19:00 Moscow
    await user(1, 'Влад');
    const habit = await app.habits.create(1, DEFAULT_HABIT);
    await app.checks.check(1, habit.id);

    await app.jobs.tick();
    expect(sent).toEqual([]);

    setNow('2026-11-08T17:00:00Z'); // 20:00
    await app.jobs.tick();
    setNow('2026-11-08T17:30:00Z');
    await app.jobs.tick();

    const summaries = sent.filter((n) => n.type === 'weekly_summary');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ to: 1, habits: [expect.objectContaining({ done: 1, target: 7 })] });
  });
});

describe('delivery failures', () => {
  it('retries a reminder on the next tick after a transient failure', async () => {
    const { app, user, sent, setNow, failNextSends } = setup('2026-11-08T06:00:00Z');
    await user(1, 'Влад');
    const habit = await app.habits.create(1, DEFAULT_HABIT);
    await app.habits.updateMembership(1, habit.id, { reminder: { type: 'exact', time: '09:00' } });

    failNextSends(1);
    await app.jobs.tick();
    setNow('2026-11-08T06:01:00Z');
    await app.jobs.tick();

    expect(sent.filter((n) => n.type === 'reminder')).toHaveLength(1);
  });

  it('retries the weekly summary after a transient failure', async () => {
    const { app, user, sent, setNow, failNextSends } = setup('2026-11-08T17:00:00Z');
    await user(1, 'Влад');
    await app.habits.create(1, DEFAULT_HABIT);

    failNextSends(1);
    await app.jobs.tick();
    setNow('2026-11-08T17:01:00Z');
    await app.jobs.tick();

    expect(sent.filter((n) => n.type === 'weekly_summary')).toHaveLength(1);
  });
});
