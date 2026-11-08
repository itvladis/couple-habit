import { habitRef, userRef, type Ctx } from '../context';
import { conflict, invalid, notFound } from '../errors';
import { sortableId, newId } from '../ids';
import type { Habit, Membership } from '../models';
import { habitInputSchema, habitPatchSchema, membershipPatchSchema, parseInput } from '../schemas';

export const MAX_ACTIVE_HABITS = 50;
/** Archived habits count too, so a create/archive loop cannot grow storage without bound. */
export const MAX_TOTAL_HABITS = 200;
export const MAX_MEMBERS = 10;

const byJoinOrder = (a: Membership, b: Membership) => a.joinedAt.localeCompare(b.joinedAt) || a.userId - b.userId;

export class HabitsService {
  constructor(private readonly ctx: Ctx) {}

  private async ensureHabitSlot(userId: number, creating = false): Promise<void> {
    const memberships = await this.ctx.store.listMembershipsOfUser(userId);
    if (creating && memberships.length >= MAX_TOTAL_HABITS) {
      throw conflict(`at most ${MAX_TOTAL_HABITS} habits including archived ones`);
    }
    const habits = await this.ctx.store.getHabits(memberships.map((m) => m.habitId));
    if (habits.filter((h) => h.archivedAt === null).length >= MAX_ACTIVE_HABITS) {
      throw conflict(`at most ${MAX_ACTIVE_HABITS} active habits`);
    }
  }

  async create(userId: number, input: unknown): Promise<Habit> {
    const data = parseInput(habitInputSchema, input);
    const user = await this.ctx.requireUser(userId);
    await this.ensureHabitSlot(userId, true);

    const now = this.ctx.now();
    const today = this.ctx.todayOf(user);
    const habit: Habit = {
      id: newId(),
      ownerId: userId,
      ...data,
      startDate: today,
      archivedAt: null,
      createdAt: now.toISOString(),
    };
    await this.ctx.store.saveHabit(habit);
    await this.addMember(habit.id, userId, today);
    await this.ctx.store.saveEvent({
      id: sortableId(now),
      type: 'habit_created',
      actorId: userId,
      habitId: habit.id,
      otherUserId: null,
      date: null,
      createdAt: now.toISOString(),
    });
    return habit;
  }

  /**
   * Adds a member without permission checks; callers decide who may join.
   * Idempotent: an existing membership keeps its settings. Returns whether the member is new.
   */
  async addMember(habitId: string, userId: number, joinedDate: string): Promise<boolean> {
    return this.ctx.store.insertMembership({
      habitId,
      userId,
      joinedAt: this.ctx.nowIso(),
      joinedDate,
      notifyOnCheck: true,
      reminder: null,
      cardSize: 'normal',
      lastReminderDate: null,
      lastCheckNotice: null,
    });
  }

  private async ownedHabit(userId: number, habitId: string): Promise<Habit> {
    const habit = await this.ctx.requireHabit(habitId);
    await this.ctx.requireMembership(habitId, userId);
    this.ctx.requireOwner(habit, userId);
    return habit;
  }

  async update(userId: number, habitId: string, patch: unknown): Promise<Habit> {
    const data = parseInput(habitPatchSchema, patch);
    const habit = await this.ownedHabit(userId, habitId);
    const updated: Habit = { ...habit, ...data };
    await this.ctx.store.saveHabit(updated);
    return updated;
  }

  async archive(userId: number, habitId: string): Promise<Habit> {
    const habit = await this.ownedHabit(userId, habitId);
    if (habit.archivedAt) return habit;
    const updated = { ...habit, archivedAt: this.ctx.nowIso() };
    await this.ctx.store.saveHabit(updated);
    return updated;
  }

  async unarchive(userId: number, habitId: string): Promise<Habit> {
    const habit = await this.ownedHabit(userId, habitId);
    if (!habit.archivedAt) return habit;
    await this.ensureHabitSlot(userId);
    const updated = { ...habit, archivedAt: null };
    await this.ctx.store.saveHabit(updated);
    return updated;
  }

  async transferOwnership(userId: number, habitId: string, newOwnerId: number): Promise<Habit> {
    const habit = await this.ownedHabit(userId, habitId);
    if (newOwnerId === userId) return habit;
    if (!(await this.ctx.store.getMembership(habitId, newOwnerId))) throw invalid('new owner must be a member');
    return this.setOwner(habit, newOwnerId, userId);
  }

  private async setOwner(habit: Habit, newOwnerId: number, previousOwnerId: number): Promise<Habit> {
    const updated = { ...habit, ownerId: newOwnerId };
    await this.ctx.store.saveHabit(updated);
    // Only owners hand out habit links; the old owner's link must stop working.
    await this.ctx.store.revokeActiveInviteLinks(previousOwnerId, habit.id, this.ctx.nowIso());
    const previous = await this.ctx.store.getUser(previousOwnerId);
    if (previous) {
      await this.ctx.notify({ type: 'ownership_received', to: newOwnerId, habit: habitRef(updated), from: userRef(previous) });
    }
    return updated;
  }

  /** Leaving as owner hands the habit to the oldest remaining member. The last member archives instead. */
  async leave(userId: number, habitId: string): Promise<void> {
    const habit = await this.ctx.requireHabit(habitId);
    await this.ctx.requireMembership(habitId, userId);
    const others = (await this.ctx.store.listMembersOfHabit(habitId)).filter((m) => m.userId !== userId);
    if (others.length === 0) throw invalid('you are the only member; archive the habit instead');

    await this.ctx.store.deleteMembership(habitId, userId);
    if (habit.ownerId === userId) {
      const heir = [...others].sort(byJoinOrder)[0]!;
      await this.setOwner(habit, heir.userId, userId);
    }
  }

  async removeMember(userId: number, habitId: string, memberId: number): Promise<void> {
    await this.ownedHabit(userId, habitId);
    if (memberId === userId) throw invalid('owner cannot remove themself; transfer ownership or leave');
    if (!(await this.ctx.store.getMembership(habitId, memberId))) throw notFound('member');
    await this.ctx.store.deleteMembership(habitId, memberId);
  }

  async updateMembership(userId: number, habitId: string, patch: unknown): Promise<Membership> {
    const data = parseInput(membershipPatchSchema, patch);
    const membership = await this.ctx.requireMembership(habitId, userId);
    const updated: Membership = {
      ...membership,
      ...(data.notifyOnCheck !== undefined && { notifyOnCheck: data.notifyOnCheck }),
      ...(data.reminder !== undefined && { reminder: data.reminder }),
      ...(data.cardSize !== undefined && { cardSize: data.cardSize }),
    };
    await this.ctx.store.saveMembership(updated);
    return updated;
  }
}
