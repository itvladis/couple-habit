import { habitRef, type Ctx } from '../context';
import { completedDates } from '../domain/completion';
import { formatHhMm, localClock, parseHhMm, weekStart } from '../domain/dates';
import { isReminderDue, reminderMinute } from '../domain/reminder';
import { isScheduledDay } from '../domain/schedule';
import { computeStreak, weekProgress } from '../domain/streak';
import type { Membership, User } from '../models';
import type { Notification } from '../notifications';

/** Periodic work: call `tick()` about once a minute (setInterval locally, a timer trigger in the cloud). */
export class JobsService {
  constructor(private readonly ctx: Ctx) {}

  /** Each job is isolated: a failing reminder scan must not cancel this tick's weekly summaries. */
  async tick(): Promise<void> {
    const now = this.ctx.now();
    for (const [name, job] of [
      ['reminders', () => this.sendReminders(now)],
      ['weekly summaries', () => this.sendWeeklySummaries(now)],
    ] as const) {
      try {
        await job();
      } catch (error) {
        console.error(`[jobs] ${name} failed`, error);
      }
    }
  }

  async sendReminders(now: Date): Promise<void> {
    const users = new Map<number, User | null>();
    for (const membership of await this.ctx.store.listMembershipsWithReminders()) {
      try {
        if (!users.has(membership.userId)) users.set(membership.userId, await this.ctx.store.getUser(membership.userId));
        const user = users.get(membership.userId);
        if (user) await this.remindIfDue(user, membership, now);
      } catch (error) {
        console.error(`[jobs] reminder for habit ${membership.habitId} / user ${membership.userId} failed`, error);
      }
    }
  }

  private async remindIfDue(user: User, membership: Membership, now: Date): Promise<void> {
    if (!membership.reminder || !user.remindersEnabled || !user.canMessage) return;
    const clock = localClock(user.timeZone, now);
    if (membership.lastReminderDate === clock.date) return;
    // Cheap checks first: most ticks end here without reading the habit.
    const seed = `${membership.habitId}:${user.id}:${clock.date}`;
    const minute = reminderMinute(membership.reminder, seed);
    if (!isReminderDue(minute, clock.minutes)) return;
    const habit = await this.ctx.store.getHabit(membership.habitId);
    if (!habit || habit.archivedAt || !isScheduledDay(habit.frequency, clock.date)) return;

    const checks = await this.ctx.store.listChecks(habit.id);
    if (checks.some((c) => c.userId === user.id && c.date === clock.date)) return;
    const members = await this.ctx.store.listMembersOfHabit(habit.id);
    const done = completedDates(habit.completionMode, members, checks);
    if (habit.completionMode === 'any' && done.has(clock.date)) return;
    if (habit.frequency.type === 'weekly') {
      const progress = weekProgress(habit.frequency, done, clock.date);
      if (progress.done >= progress.target) return;
    }

    // Mark before sending so an overlapping tick cannot send twice; undo on a transient failure
    // so the next tick retries while the reminder is still within its grace window.
    await this.ctx.store.markReminderSent(habit.id, user.id, clock.date);
    const sent = await this.ctx.notify({
      type: 'reminder',
      to: user.id,
      habit: habitRef(habit),
      date: clock.date,
      time: formatHhMm(minute),
    });
    if (!sent) await this.ctx.store.markReminderSent(habit.id, user.id, membership.lastReminderDate);
  }

  async sendWeeklySummaries(now: Date): Promise<void> {
    for (const user of await this.ctx.store.listUsers()) {
      try {
        await this.summarizeIfDue(user, now);
      } catch (error) {
        console.error(`[jobs] weekly summary for user ${user.id} failed`, error);
      }
    }
  }

  private async summarizeIfDue(user: User, now: Date): Promise<void> {
    const { enabled, weekday, time } = user.weeklySummary;
    if (!enabled || !user.canMessage) return;
    const clock = localClock(user.timeZone, now);
    const target = parseHhMm(time);
    if (target === null || clock.weekday !== weekday || clock.minutes < target) return;
    const week = weekStart(clock.date);
    if (user.lastWeeklySummaryWeek === week) return;

    const memberships = await this.ctx.store.listMembershipsOfUser(user.id);
    const habits = (await this.ctx.store.getHabits(memberships.map((m) => m.habitId))).filter((h) => !h.archivedAt);
    const lines: Extract<Notification, { type: 'weekly_summary' }>['habits'] = [];
    for (const habit of habits) {
      const members = await this.ctx.store.listMembersOfHabit(habit.id);
      const done = completedDates(habit.completionMode, members, await this.ctx.store.listChecks(habit.id));
      lines.push({
        habit: habitRef(habit),
        ...weekProgress(habit.frequency, done, clock.date),
        streak: computeStreak(habit.frequency, done, habit.startDate, clock.date),
      });
    }

    await this.ctx.store.markWeeklySummarySent(user.id, week);
    if (lines.length === 0) return;
    const sent = await this.ctx.notify({ type: 'weekly_summary', to: user.id, weekStart: week, habits: lines });
    if (!sent) await this.ctx.store.markWeeklySummarySent(user.id, user.lastWeeklySummaryWeek);
  }
}
