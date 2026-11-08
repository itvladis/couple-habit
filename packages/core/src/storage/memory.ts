import type { LocalDate } from '../domain/dates';
import type { Check, FeedEvent, Friendship, Habit, InviteLink, JoinRequest, Membership, RequestType, User } from '../models';
import type { Store } from './store';

export interface Snapshot {
  users: User[];
  habits: Habit[];
  memberships: Membership[];
  checks: Check[];
  friendships: Friendship[];
  inviteLinks: InviteLink[];
  requests: JoinRequest[];
  events: FeedEvent[];
}

const copy = <T>(value: T): T => structuredClone(value);
const memberKey = (habitId: string, userId: number) => `${habitId}:${userId}`;
const checkKey = (habitId: string, userId: number, date: LocalDate) => `${habitId}:${userId}:${date}`;
/** Byte-wise order, the same as YDB uses for strings; localeCompare would disagree with `<`. */
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** In-process store for local development and tests. `onChange` lets the caller persist snapshots. */
export class MemoryStore implements Store {
  private readonly users = new Map<number, User>();
  private readonly habits = new Map<string, Habit>();
  private readonly memberships = new Map<string, Membership>();
  private readonly checks = new Map<string, Check>();
  private readonly friendships = new Map<string, Friendship>();
  private readonly inviteLinks = new Map<string, InviteLink>();
  private readonly requests = new Map<string, JoinRequest>();
  private events: FeedEvent[] = [];

  constructor(
    snapshot?: Snapshot,
    private readonly onChange: () => void = () => {},
  ) {
    if (!snapshot) return;
    for (const u of snapshot.users) this.users.set(u.id, u);
    for (const h of snapshot.habits) this.habits.set(h.id, h);
    for (const m of snapshot.memberships) this.memberships.set(memberKey(m.habitId, m.userId), m);
    for (const c of snapshot.checks) this.checks.set(checkKey(c.habitId, c.userId, c.date), c);
    for (const f of snapshot.friendships) this.friendships.set(pairKey(f.userA, f.userB), f);
    for (const l of snapshot.inviteLinks) this.inviteLinks.set(l.token, l);
    for (const r of snapshot.requests) this.requests.set(r.id, r);
    this.events = [...snapshot.events].sort(byId);
  }

  snapshot(): Snapshot {
    return copy({
      users: [...this.users.values()],
      habits: [...this.habits.values()],
      memberships: [...this.memberships.values()],
      checks: [...this.checks.values()],
      friendships: [...this.friendships.values()],
      inviteLinks: [...this.inviteLinks.values()],
      requests: [...this.requests.values()],
      events: this.events,
    });
  }

  private changed(): void {
    this.onChange();
  }

  async getUser(id: number) {
    const user = this.users.get(id);
    return user ? copy(user) : null;
  }
  async getUsers(ids: readonly number[]) {
    return ids.flatMap((id) => {
      const user = this.users.get(id);
      return user ? [copy(user)] : [];
    });
  }
  async listUsers() {
    return copy([...this.users.values()]);
  }
  async saveUser(user: User) {
    this.users.set(user.id, copy(user));
    this.changed();
  }
  async setCanMessage(userId: number, canMessage: boolean) {
    const user = this.users.get(userId);
    if (!user) return;
    user.canMessage = canMessage;
    this.changed();
  }
  async markWeeklySummarySent(userId: number, week: LocalDate | null) {
    const user = this.users.get(userId);
    if (!user) return;
    user.lastWeeklySummaryWeek = week;
    this.changed();
  }

  async getHabit(id: string) {
    const habit = this.habits.get(id);
    return habit ? copy(habit) : null;
  }
  async getHabits(ids: readonly string[]) {
    return ids.flatMap((id) => {
      const habit = this.habits.get(id);
      return habit ? [copy(habit)] : [];
    });
  }
  async saveHabit(habit: Habit) {
    this.habits.set(habit.id, copy(habit));
    this.changed();
  }

  async getMembership(habitId: string, userId: number) {
    const membership = this.memberships.get(memberKey(habitId, userId));
    return membership ? copy(membership) : null;
  }
  async listMembersOfHabit(habitId: string) {
    return copy([...this.memberships.values()].filter((m) => m.habitId === habitId));
  }
  async listMembershipsOfUser(userId: number) {
    return copy([...this.memberships.values()].filter((m) => m.userId === userId));
  }
  async listMembershipsWithReminders() {
    return copy([...this.memberships.values()].filter((m) => m.reminder !== null));
  }
  async saveMembership(membership: Membership) {
    this.memberships.set(memberKey(membership.habitId, membership.userId), copy(membership));
    this.changed();
  }
  async insertMembership(membership: Membership) {
    const key = memberKey(membership.habitId, membership.userId);
    if (this.memberships.has(key)) return false;
    this.memberships.set(key, copy(membership));
    this.changed();
    return true;
  }
  async markReminderSent(habitId: string, userId: number, date: LocalDate | null) {
    const membership = this.memberships.get(memberKey(habitId, userId));
    if (!membership) return;
    membership.lastReminderDate = date;
    this.changed();
  }
  async setCheckNotice(habitId: string, userId: number, notice: Membership['lastCheckNotice']) {
    const membership = this.memberships.get(memberKey(habitId, userId));
    if (!membership) return;
    membership.lastCheckNotice = copy(notice);
    this.changed();
  }
  async deleteHabit(id: string) {
    this.habits.delete(id);
    const drop = <K, V extends { habitId: string | null }>(map: Map<K, V>) => {
      for (const [key, value] of map) if (value.habitId === id) map.delete(key);
    };
    drop(this.memberships);
    drop(this.checks);
    drop(this.inviteLinks);
    drop(this.requests);
    this.events = this.events.filter((e) => e.habitId !== id);
    this.changed();
  }
  async deleteMembership(habitId: string, userId: number) {
    this.memberships.delete(memberKey(habitId, userId));
    this.changed();
  }

  async getCheck(habitId: string, userId: number, date: LocalDate) {
    const check = this.checks.get(checkKey(habitId, userId, date));
    return check ? copy(check) : null;
  }
  async listChecks(habitId: string, from?: LocalDate, to?: LocalDate) {
    return copy(
      [...this.checks.values()].filter(
        (c) => c.habitId === habitId && (from === undefined || c.date >= from) && (to === undefined || c.date <= to),
      ),
    );
  }
  async insertCheck(check: Check) {
    const key = checkKey(check.habitId, check.userId, check.date);
    if (this.checks.has(key)) return false;
    this.checks.set(key, copy(check));
    this.changed();
    return true;
  }
  async deleteCheck(habitId: string, userId: number, date: LocalDate) {
    this.checks.delete(checkKey(habitId, userId, date));
    this.changed();
  }

  async areFriends(a: number, b: number) {
    return this.friendships.has(pairKey(a, b));
  }
  async listFriendIds(userId: number) {
    return [...this.friendships.values()].flatMap((f) =>
      f.userA === userId ? [f.userB] : f.userB === userId ? [f.userA] : [],
    );
  }
  async saveFriendship(friendship: Friendship) {
    this.friendships.set(pairKey(friendship.userA, friendship.userB), copy(friendship));
    this.changed();
  }
  async deleteFriendship(a: number, b: number) {
    this.friendships.delete(pairKey(a, b));
    this.changed();
  }

  async getInviteLink(token: string) {
    const link = this.inviteLinks.get(token);
    return link ? copy(link) : null;
  }
  async findActiveInviteLink(ownerId: number, habitId: string | null) {
    const link = [...this.inviteLinks.values()].find(
      (l) => l.ownerId === ownerId && l.habitId === habitId && l.revokedAt === null,
    );
    return link ? copy(link) : null;
  }
  async saveInviteLink(link: InviteLink) {
    this.inviteLinks.set(link.token, copy(link));
    this.changed();
  }
  async revokeActiveInviteLinks(ownerId: number, habitId: string | null, at: string) {
    for (const link of this.inviteLinks.values()) {
      if (link.ownerId === ownerId && link.habitId === habitId && link.revokedAt === null) link.revokedAt = at;
    }
    this.changed();
  }

  async getRequest(id: string) {
    const request = this.requests.get(id);
    return request ? copy(request) : null;
  }
  async findPendingRequest(type: RequestType, fromUserId: number, toUserId: number, habitId: string | null) {
    const request = [...this.requests.values()].find(
      (r) =>
        r.status === 'pending' && r.type === type && r.fromUserId === fromUserId && r.toUserId === toUserId && r.habitId === habitId,
    );
    return request ? copy(request) : null;
  }
  async listPendingRequestsTo(userId: number) {
    return copy([...this.requests.values()].filter((r) => r.status === 'pending' && r.toUserId === userId));
  }
  async findLatestRequest(type: RequestType, fromUserId: number, toUserId: number, habitId: string | null) {
    let latest: JoinRequest | null = null;
    for (const r of this.requests.values()) {
      if (r.type !== type || r.fromUserId !== fromUserId || r.toUserId !== toUserId || r.habitId !== habitId) continue;
      if (!latest || r.createdAt > latest.createdAt) latest = r;
    }
    return latest ? copy(latest) : null;
  }
  async insertPendingRequest(request: JoinRequest) {
    const duplicate = [...this.requests.values()].some(
      (r) =>
        r.status === 'pending' &&
        r.type === request.type &&
        r.fromUserId === request.fromUserId &&
        r.toUserId === request.toUserId &&
        r.habitId === request.habitId,
    );
    if (duplicate) return false;
    this.requests.set(request.id, copy(request));
    this.changed();
    return true;
  }
  async resolveRequest(id: string, status: 'approved' | 'declined', resolvedAt: string) {
    const request = this.requests.get(id);
    if (!request || request.status !== 'pending') return false;
    request.status = status;
    request.resolvedAt = resolvedAt;
    this.changed();
    return true;
  }

  async saveEvent(event: FeedEvent) {
    this.events.push(copy(event));
    this.events.sort(byId);
    this.changed();
  }
  async deleteCheckEvents(habitId: string, actorId: number, date: LocalDate) {
    this.events = this.events.filter(
      (e) => !(e.type === 'check' && e.habitId === habitId && e.actorId === actorId && e.date === date),
    );
    this.changed();
  }
  async listEvents(actorIds: readonly number[], before: string | null, limit: number) {
    const actors = new Set(actorIds);
    const result: FeedEvent[] = [];
    for (let i = this.events.length - 1; i >= 0 && result.length < limit; i--) {
      const event = this.events[i]!;
      if (before !== null && event.id >= before) continue;
      if (actors.has(event.actorId)) result.push(copy(event));
    }
    return result;
  }
}
