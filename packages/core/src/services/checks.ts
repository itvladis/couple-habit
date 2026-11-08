import { habitRef, userRef, type Ctx } from '../context';
import { completedDates } from '../domain/completion';
import { diffDays, MAX_BACKFILL_DAYS, type LocalDate } from '../domain/dates';
import { invalid } from '../errors';
import { sortableId } from '../ids';
import { localDateSchema, parseInput } from '../schemas';

/** Re-checking the same day within this window (after an uncheck) does not ping other members again. */
export const CHECK_NOTICE_COOLDOWN_MS = 10 * 60 * 1000;

export class ChecksService {
  constructor(private readonly ctx: Ctx) {}

  /** Marks `date` (default: the user's today) as done. Repeating the call is harmless. */
  async check(userId: number, habitId: string, date?: string): Promise<{ created: boolean; date: LocalDate }> {
    await this.ctx.requireMembership(habitId, userId);
    const habit = await this.ctx.requireHabit(habitId);
    if (habit.archivedAt) throw invalid('habit is archived');
    const user = await this.ctx.requireUser(userId);
    const today = this.ctx.todayOf(user);
    const day = date === undefined ? today : parseInput(localDateSchema, date);
    if (day > today) throw invalid('cannot check a future day');
    if (diffDays(today, day) > MAX_BACKFILL_DAYS) throw invalid(`cannot check more than ${MAX_BACKFILL_DAYS} days back`);

    const now = this.ctx.now();
    const created = await this.ctx.store.insertCheck({ habitId, userId, date: day, createdAt: now.toISOString() });
    if (!created) return { created: false, date: day };
    await this.ctx.store.saveEvent({
      id: sortableId(now),
      type: 'check',
      actorId: userId,
      habitId,
      otherUserId: null,
      date: day,
      createdAt: now.toISOString(),
    });

    const membership = await this.ctx.store.getMembership(habitId, userId);
    const notice = membership?.lastCheckNotice;
    if (notice && notice.date === day && now.getTime() - Date.parse(notice.at) < CHECK_NOTICE_COOLDOWN_MS) {
      return { created: true, date: day };
    }
    await this.ctx.store.setCheckNotice(habitId, userId, { date: day, at: now.toISOString() });

    // Computed after the write, so two members finishing the day at once both see it complete.
    const members = await this.ctx.store.listMembersOfHabit(habitId);
    const after = await this.ctx.store.listChecks(habitId, day, day);
    const before = after.filter((c) => c.userId !== userId);
    const dayCompleted =
      completedDates(habit.completionMode, members, after).has(day) &&
      !completedDates(habit.completionMode, members, before).has(day);
    for (const member of members) {
      if (member.userId === userId || !member.notifyOnCheck) continue;
      await this.ctx.notify({
        type: 'member_checked',
        to: member.userId,
        actor: userRef(user),
        habit: habitRef(habit),
        date: day,
        isToday: day === today,
        recipientChecked: after.some((c) => c.userId === member.userId),
        dayCompleted,
      });
    }
    return { created: true, date: day };
  }

  async uncheck(userId: number, habitId: string, date: string): Promise<void> {
    const day = parseInput(localDateSchema, date);
    await this.ctx.requireMembership(habitId, userId);
    const habit = await this.ctx.requireHabit(habitId);
    if (habit.archivedAt) throw invalid('habit is archived');
    await this.ctx.store.deleteCheck(habitId, userId, day);
    await this.ctx.store.deleteCheckEvents(habitId, userId, day);
  }
}
