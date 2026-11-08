import type { Ctx } from '../context';
import { completedDates } from '../domain/completion';
import { addDays, diffDays, type LocalDate } from '../domain/dates';
import type { Reminder } from '../domain/reminder';
import type { Frequency } from '../domain/schedule';
import { completionRate, computeStreak, weekProgress, type Streak } from '../domain/streak';
import type { CompletionMode } from '../domain/completion';
import { invalid, notFound } from '../errors';
import type { CardSize, Check, Habit, HabitVisibility, Membership, User } from '../models';
import { localDateSchema, parseInput } from '../schemas';

const WEEK_LENGTH = 7;
const MAX_RANGE_DAYS = 400;

export interface DayMark {
  date: LocalDate;
  /** The habit as a whole is done that day. */
  done: boolean;
  /** The viewer checked that day. */
  mine: boolean;
}

export interface MemberView {
  userId: number;
  firstName: string;
  photoUrl: string | null;
  isOwner: boolean;
  /** Checked on the member's own local today. */
  checkedToday: boolean;
  /** Last 7 viewer-local days, oldest first. */
  week: boolean[];
}

export interface HabitView {
  id: string;
  title: string;
  icon: string;
  color: string;
  frequency: Frequency;
  completionMode: CompletionMode;
  visibility: HabitVisibility;
  ownerId: number;
  isOwner: boolean;
  archived: boolean;
  startDate: LocalDate;
  today: LocalDate;
  checkedToday: boolean;
  doneToday: boolean;
  week: DayMark[];
  weekProgress: { done: number; target: number };
  streak: Streak;
  stats: {
    /** Days the habit was done, all time. */
    totalDone: number;
    /** Share of finished periods that were done, 0–1; null before the first one ends. */
    completionRate: number | null;
  };
  members: MemberView[];
  /** The viewer's own settings; null when they are a friend looking from outside. */
  membership: { notifyOnCheck: boolean; reminder: Reminder | null; cardSize: CardSize } | null;
}

const byJoinOrder = (a: Membership, b: Membership) => a.joinedAt.localeCompare(b.joinedAt) || a.userId - b.userId;

export class ViewsService {
  constructor(private readonly ctx: Ctx) {}

  private async build(viewer: User, habit: Habit): Promise<HabitView> {
    const members = (await this.ctx.store.listMembersOfHabit(habit.id)).sort(byJoinOrder);
    const checks = await this.ctx.store.listChecks(habit.id);
    const users = new Map((await this.ctx.store.getUsers(members.map((m) => m.userId))).map((u) => [u.id, u]));
    return buildView(viewer, habit, members, checks, users, this.ctx.todayOf(viewer), (u) => this.ctx.todayOf(u));
  }

  async myHabits(userId: number, options: { archived?: boolean } = {}): Promise<HabitView[]> {
    const viewer = await this.ctx.requireUser(userId);
    const memberships = await this.ctx.store.listMembershipsOfUser(userId);
    const habits = (await this.ctx.store.getHabits(memberships.map((m) => m.habitId)))
      .filter((h) => (h.archivedAt !== null) === (options.archived ?? false))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return Promise.all(habits.map((h) => this.build(viewer, h)));
  }

  private async viewable(viewer: User, habitId: string): Promise<Habit> {
    const habit = await this.ctx.store.getHabit(habitId);
    if (!habit || !(await this.ctx.canView(viewer.id, habit))) throw notFound('habit');
    return habit;
  }

  async habit(userId: number, habitId: string): Promise<HabitView> {
    const viewer = await this.ctx.requireUser(userId);
    return this.build(viewer, await this.viewable(viewer, habitId));
  }

  /** Done days (group and own) in an inclusive range, for the heatmap. */
  async checkDates(userId: number, habitId: string, from: string, to: string): Promise<{ done: LocalDate[]; mine: LocalDate[] }> {
    const start = parseInput(localDateSchema, from);
    const end = parseInput(localDateSchema, to);
    if (end < start) throw invalid('range ends before it starts');
    if (diffDays(end, start) > MAX_RANGE_DAYS) throw invalid(`range is longer than ${MAX_RANGE_DAYS} days`);
    const viewer = await this.ctx.requireUser(userId);
    const habit = await this.viewable(viewer, habitId);
    const members = await this.ctx.store.listMembersOfHabit(habit.id);
    const checks = await this.ctx.store.listChecks(habit.id, start, end);
    return {
      done: [...completedDates(habit.completionMode, members, checks)].sort(),
      mine: checks.filter((c) => c.userId === userId).map((c) => c.date).sort(),
    };
  }
}

function buildView(
  viewer: User,
  habit: Habit,
  members: Membership[],
  checks: Check[],
  users: Map<number, User>,
  today: LocalDate,
  todayOf: (user: User) => LocalDate,
): HabitView {
  const done = completedDates(habit.completionMode, members, checks);
  const checked = new Set(checks.map((c) => `${c.userId}:${c.date}`));
  const has = (userId: number, date: LocalDate) => checked.has(`${userId}:${date}`);
  const days = Array.from({ length: WEEK_LENGTH }, (_, i) => addDays(today, i - (WEEK_LENGTH - 1)));
  const own = members.find((m) => m.userId === viewer.id);
  const rate = completionRate(habit.frequency, done, habit.startDate, today);
  let totalDone = 0;
  for (const date of done) if (date <= today) totalDone++;

  return {
    id: habit.id,
    title: habit.title,
    icon: habit.icon,
    color: habit.color,
    frequency: habit.frequency,
    completionMode: habit.completionMode,
    visibility: habit.visibility,
    ownerId: habit.ownerId,
    isOwner: habit.ownerId === viewer.id,
    archived: habit.archivedAt !== null,
    startDate: habit.startDate,
    today,
    checkedToday: has(viewer.id, today),
    doneToday: done.has(today),
    week: days.map((date) => ({ date, done: done.has(date), mine: has(viewer.id, date) })),
    weekProgress: weekProgress(habit.frequency, done, today),
    streak: computeStreak(habit.frequency, done, habit.startDate, today),
    stats: { totalDone, completionRate: rate.total === 0 ? null : rate.done / rate.total },
    members: members.flatMap((m) => {
      const user = users.get(m.userId);
      if (!user) return [];
      return [
        {
          userId: user.id,
          firstName: user.firstName,
          photoUrl: user.photoUrl,
          isOwner: user.id === habit.ownerId,
          checkedToday: has(user.id, todayOf(user)),
          week: days.map((date) => has(user.id, date)),
        },
      ];
    }),
    // Memberships saved before cardSize existed have no value yet.
    membership: own ? { notifyOnCheck: own.notifyOnCheck, reminder: own.reminder, cardSize: own.cardSize ?? 'normal' } : null,
  };
}
