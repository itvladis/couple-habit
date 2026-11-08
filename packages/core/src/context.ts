import { localClock, type LocalDate } from './domain/dates';
import { forbidden, notFound } from './errors';
import type { Habit, Membership, User } from './models';
import type { HabitRef, Notification, Notifier, UserRef } from './notifications';
import type { Store } from './storage/store';

export interface Clock {
  now(): Date;
}

export interface Deps {
  store: Store;
  clock: Clock;
  notifier: Notifier;
}

export const userRef = (user: User): UserRef => ({ id: user.id, firstName: user.firstName });
export const habitRef = (habit: Habit): HabitRef => ({ id: habit.id, title: habit.title, icon: habit.icon });

/** Shared plumbing for services: store access, time, guards and best-effort notifications. */
export class Ctx {
  readonly store: Store;

  constructor(private readonly deps: Deps) {
    this.store = deps.store;
  }

  now(): Date {
    return this.deps.clock.now();
  }

  nowIso(): string {
    return this.now().toISOString();
  }

  todayOf(user: User): LocalDate {
    return localClock(user.timeZone, this.now()).date;
  }

  /**
   * Delivery problems must never undo the action that caused the notification, so errors are logged here.
   * Returns false when delivery failed in a way worth retrying (the notifier throws only for those).
   */
  async notify(notification: Notification): Promise<boolean> {
    try {
      await this.deps.notifier.send(notification);
      return true;
    } catch (error) {
      console.error(`[notify] ${notification.type} to ${notification.to} failed`, error);
      return false;
    }
  }

  async requireUser(id: number): Promise<User> {
    const user = await this.store.getUser(id);
    if (!user) throw notFound('user');
    return user;
  }

  async requireHabit(id: string): Promise<Habit> {
    const habit = await this.store.getHabit(id);
    if (!habit) throw notFound('habit');
    return habit;
  }

  /** Non-members get the same "not found" as for a missing habit, so ids do not leak. */
  async requireMembership(habitId: string, userId: number): Promise<Membership> {
    const membership = await this.store.getMembership(habitId, userId);
    if (!membership) throw notFound('habit');
    return membership;
  }

  requireOwner(habit: Habit, userId: number): void {
    if (habit.ownerId !== userId) throw forbidden('only the habit owner can do this');
  }

  /** Members always see a habit; friends of a member see it unless it is private. */
  async canView(viewerId: number, habit: Habit): Promise<boolean> {
    const members = await this.store.listMembersOfHabit(habit.id);
    if (members.some((m) => m.userId === viewerId)) return true;
    if (habit.visibility === 'private') return false;
    for (const member of members) {
      if (await this.store.areFriends(viewerId, member.userId)) return true;
    }
    return false;
  }
}
