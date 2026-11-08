import { habitRef, userRef, type Ctx } from '../context';
import { conflict, forbidden, notFound } from '../errors';
import { newId, newToken, sortableId } from '../ids';
import type { Habit, InviteLink, JoinRequest, RequestType, User } from '../models';
import type { HabitRef, UserRef } from '../notifications';
import type { CompletionMode } from '../domain/completion';
import type { Frequency } from '../domain/schedule';
import { MAX_MEMBERS, type HabitsService } from './habits';

export type RequestOutcome =
  | { status: 'requested'; request: JoinRequest; approver: UserRef; habit: HabitRef | null }
  | { status: 'already_requested'; approver: UserRef; habit: HabitRef | null }
  | { status: 'already_friends'; approver: UserRef }
  | { status: 'already_member'; habit: HabitRef }
  | { status: 'own_link' }
  | { status: 'habit_full'; habit: HabitRef }
  | { status: 'friend_list_full' }
  | { status: 'invalid_link' };

export type InviteState =
  | 'can_join'
  | 'already_requested'
  | 'already_friends'
  | 'already_member'
  | 'own_link'
  | 'habit_full'
  | 'friend_list_full';

/** What a link holder may see about people: no Telegram ids. */
export interface PersonCard {
  firstName: string;
  photoUrl: string | null;
}

export interface InvitePreview {
  state: InviteState;
  /** The friend-link owner, or the habit's current owner who will approve. */
  inviter: PersonCard;
  habit: {
    id: string;
    title: string;
    icon: string;
    color: string;
    frequency: Frequency;
    completionMode: CompletionMode;
    members: PersonCard[];
  } | null;
}

interface Inspection {
  state: InviteState;
  type: 'friend' | 'habit_join';
  requester: User;
  inviter: User;
  habit: Habit | null;
  members: User[];
}

export interface IncomingRequest {
  id: string;
  type: RequestType;
  from: UserRef & { photoUrl: string | null };
  habit: HabitRef | null;
  createdAt: string;
}

export interface FriendSummary {
  id: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  sharedHabits: number;
}

/** After a decline the same person cannot ping the link owner again for a week. */
export const DECLINE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_FRIENDS = 200;

const pair = (a: number, b: number) => (a < b ? { userA: a, userB: b } : { userA: b, userB: a });

export class SocialService {
  constructor(
    private readonly ctx: Ctx,
    private readonly habits: HabitsService,
  ) {}

  private async linkScope(userId: number, habitId: string | null): Promise<void> {
    await this.ctx.requireUser(userId);
    if (habitId === null) return;
    const habit = await this.ctx.requireHabit(habitId);
    await this.ctx.requireMembership(habitId, userId);
    this.ctx.requireOwner(habit, userId);
  }

  private async createLink(userId: number, habitId: string | null): Promise<InviteLink> {
    const link: InviteLink = { token: newToken(), ownerId: userId, habitId, createdAt: this.ctx.nowIso(), revokedAt: null };
    await this.ctx.store.saveInviteLink(link);
    return link;
  }

  /** The user's reusable invite link: a friend link when `habitId` is null, otherwise a habit link (owner only). */
  async getInviteLink(userId: number, habitId: string | null): Promise<InviteLink> {
    await this.linkScope(userId, habitId);
    return (await this.ctx.store.findActiveInviteLink(userId, habitId)) ?? this.createLink(userId, habitId);
  }

  async resetInviteLink(userId: number, habitId: string | null): Promise<InviteLink> {
    await this.linkScope(userId, habitId);
    await this.ctx.store.revokeActiveInviteLinks(userId, habitId, this.ctx.nowIso());
    return this.createLink(userId, habitId);
  }

  /**
   * Works out what opening an invite link would do for `userId`, without changing anything.
   * Preview and request share this, so the screen never promises something the request would refuse.
   */
  private async inspect(userId: number, token: string): Promise<Inspection | null> {
    const link = await this.ctx.store.getInviteLink(token);
    if (!link || link.revokedAt) return null;
    const requester = await this.ctx.requireUser(userId);

    if (link.habitId === null) {
      const inviter = await this.ctx.store.getUser(link.ownerId);
      if (!inviter) return null;
      const base = { type: 'friend' as const, requester, inviter, habit: null, members: [] };
      if (link.ownerId === userId) return { ...base, state: 'own_link' };
      if (await this.ctx.store.areFriends(userId, inviter.id)) return { ...base, state: 'already_friends' };
      return { ...base, state: await this.joinState('friend', requester, inviter, null) };
    }

    const habit = await this.ctx.store.getHabit(link.habitId);
    if (!habit || habit.archivedAt) return null;
    const inviter = await this.ctx.store.getUser(habit.ownerId);
    if (!inviter) return null;
    const memberships = await this.ctx.store.listMembersOfHabit(habit.id);
    const members = await this.ctx.store.getUsers(memberships.map((m) => m.userId));
    const base = { type: 'habit_join' as const, requester, inviter, habit, members };
    if (memberships.some((m) => m.userId === userId)) return { ...base, state: 'already_member' };
    if (memberships.length >= MAX_MEMBERS) return { ...base, state: 'habit_full' };
    return { ...base, state: await this.joinState('habit_join', requester, inviter, habit.id) };
  }

  /** Mirrors what approve() will check, so the invite screen never promises something that fails later. */
  private async joinState(type: 'friend' | 'habit_join', requester: User, inviter: User, habitId: string | null): Promise<InviteState> {
    if (await this.hasOpenRequest(type, requester.id, inviter.id, habitId)) return 'already_requested';
    if (!(await this.ctx.store.areFriends(requester.id, inviter.id))) {
      for (const id of [requester.id, inviter.id]) {
        if ((await this.ctx.store.listFriendIds(id)).length >= MAX_FRIENDS) return 'friend_list_full';
      }
    }
    return 'can_join';
  }

  /** A pending request, or one declined within the cooldown (shown as pending so the sender cannot spam). */
  private async hasOpenRequest(type: RequestType, fromUserId: number, toUserId: number, habitId: string | null) {
    const latest = await this.ctx.store.findLatestRequest(type, fromUserId, toUserId, habitId);
    if (latest?.status === 'pending') return true;
    return (
      latest?.status === 'declined' &&
      latest.resolvedAt !== null &&
      this.ctx.now().getTime() - Date.parse(latest.resolvedAt) < DECLINE_COOLDOWN_MS
    );
  }

  /** What the invite screen shows before the user taps "Join". Null for an invalid or revoked link. */
  async previewInvite(userId: number, token: string): Promise<InvitePreview | null> {
    const found = await this.inspect(userId, token);
    if (!found) return null;
    const card = (u: User): PersonCard => ({ firstName: u.firstName, photoUrl: u.photoUrl });
    return {
      state: found.state,
      inviter: card(found.inviter),
      habit: found.habit && {
        id: found.habit.id,
        title: found.habit.title,
        icon: found.habit.icon,
        color: found.habit.color,
        frequency: found.habit.frequency,
        completionMode: found.habit.completionMode,
        members: found.members.map(card),
      },
    };
  }

  /** The user tapped "Join" on an invite. Creates a request for the link owner (or the habit's current owner). */
  async requestByToken(userId: number, token: string): Promise<RequestOutcome> {
    const found = await this.inspect(userId, token);
    if (!found) return { status: 'invalid_link' };
    const habitInfo = found.habit ? habitRef(found.habit) : null;
    const approver = userRef(found.inviter);
    switch (found.state) {
      case 'own_link':
        return { status: 'own_link' };
      case 'already_friends':
        return { status: 'already_friends', approver };
      case 'already_member':
        return { status: 'already_member', habit: habitInfo! };
      case 'habit_full':
        return { status: 'habit_full', habit: habitInfo! };
      case 'already_requested':
        return { status: 'already_requested', approver, habit: habitInfo };
      case 'friend_list_full':
        return { status: 'friend_list_full' };
      case 'can_join': {
        const request = await this.createRequest(found.type, userId, found.inviter.id, found.habit?.id ?? null);
        // Lost a race with a parallel tap: the other call already created and announced it.
        if (!request) return { status: 'already_requested', approver, habit: habitInfo };
        await this.ctx.notify({
          type: 'request_created',
          to: found.inviter.id,
          requestId: request.id,
          requestType: found.type,
          from: userRef(found.requester),
          habit: habitInfo,
        });
        return { status: 'requested', request, approver, habit: habitInfo };
      }
    }
  }

  /** Returns null when the same request is already pending (the store checks and inserts in one step). */
  private async createRequest(
    type: RequestType,
    fromUserId: number,
    toUserId: number,
    habitId: string | null,
  ): Promise<JoinRequest | null> {
    const request: JoinRequest = {
      id: newId(),
      type,
      fromUserId,
      toUserId,
      habitId,
      status: 'pending',
      createdAt: this.ctx.nowIso(),
      resolvedAt: null,
    };
    return (await this.ctx.store.insertPendingRequest(request)) ? request : null;
  }

  /** The owner invites an existing friend; the friend accepts or declines. */
  async inviteToHabit(userId: number, habitId: string, friendId: number): Promise<JoinRequest> {
    const habit = await this.ctx.requireHabit(habitId);
    await this.ctx.requireMembership(habitId, userId);
    this.ctx.requireOwner(habit, userId);
    if (habit.archivedAt) throw conflict('habit is archived');
    if (!(await this.ctx.store.areFriends(userId, friendId))) throw forbidden('you can only invite friends');
    if (await this.ctx.store.getMembership(habitId, friendId)) throw conflict('already a member');
    if ((await this.ctx.store.listMembersOfHabit(habitId)).length >= MAX_MEMBERS) throw conflict('habit is full');

    const owner = await this.ctx.requireUser(userId);
    const request = await this.createRequest('habit_invite', userId, friendId, habitId);
    if (!request) {
      const existing = await this.ctx.store.findPendingRequest('habit_invite', userId, friendId, habitId);
      if (!existing) throw conflict('invite changed meanwhile, try again');
      return existing;
    }
    await this.ctx.notify({
      type: 'request_created',
      to: friendId,
      requestId: request.id,
      requestType: 'habit_invite',
      from: userRef(owner),
      habit: habitRef(habit),
    });
    return request;
  }

  private async pendingFor(userId: number, requestId: string): Promise<JoinRequest> {
    const request = await this.ctx.store.getRequest(requestId);
    if (!request) throw notFound('request');
    if (request.toUserId !== userId) throw forbidden('this request is addressed to someone else');
    if (request.status !== 'pending') throw conflict(`request already ${request.status}`);
    return request;
  }

  async approve(userId: number, requestId: string): Promise<JoinRequest> {
    const request = await this.pendingFor(userId, requestId);
    const habit = request.habitId ? await this.ctx.store.getHabit(request.habitId) : null;
    await this.ensureStillValid(request, habit);

    const resolvedAt = this.ctx.nowIso();
    // The status flip is the lock: a double tap or a parallel approve from the Mini App stops here.
    if (!(await this.ctx.store.resolveRequest(request.id, 'approved', resolvedAt))) throw conflict('request already handled');

    if (request.type !== 'friend' && habit) {
      const joinerId = request.type === 'habit_join' ? request.fromUserId : request.toUserId;
      await this.join(habit, joinerId);
    }
    if (request.type !== 'habit_invite') await this.befriend(request.toUserId, request.fromUserId);

    const approver = await this.ctx.requireUser(userId);
    await this.ctx.notify({
      type: 'request_approved',
      to: request.fromUserId,
      requestType: request.type,
      by: userRef(approver),
      habit: habit ? habitRef(habit) : null,
    });
    return { ...request, status: 'approved', resolvedAt };
  }

  /**
   * Requests can outlive the situation they were made in (owner changed, friendship ended).
   * Stale ones are declined; a full habit or friend list only blocks for now.
   */
  private async ensureStillValid(request: JoinRequest, habit: Habit | null): Promise<void> {
    let staleReason: string | null = null;
    if (request.type !== 'friend') {
      if (!habit || habit.archivedAt) staleReason = 'habit is no longer active';
      else if (request.type === 'habit_join' && habit.ownerId !== request.toUserId) staleReason = 'habit has a new owner';
      else if (
        request.type === 'habit_invite' &&
        (habit.ownerId !== request.fromUserId || !(await this.ctx.store.areFriends(request.fromUserId, request.toUserId)))
      ) {
        staleReason = 'invite is no longer valid';
      }
    }
    if (staleReason) {
      await this.ctx.store.resolveRequest(request.id, 'declined', this.ctx.nowIso());
      throw conflict(staleReason);
    }

    if (habit && request.type !== 'friend') {
      const joinerId = request.type === 'habit_join' ? request.fromUserId : request.toUserId;
      const members = await this.ctx.store.listMembersOfHabit(habit.id);
      if (!members.some((m) => m.userId === joinerId) && members.length >= MAX_MEMBERS) throw conflict('habit is full');
    }
    if (request.type !== 'habit_invite' && !(await this.ctx.store.areFriends(request.fromUserId, request.toUserId))) {
      for (const id of [request.fromUserId, request.toUserId]) {
        if ((await this.ctx.store.listFriendIds(id)).length >= MAX_FRIENDS) throw conflict('friend list is full');
      }
    }
  }

  async decline(userId: number, requestId: string): Promise<JoinRequest> {
    const request = await this.pendingFor(userId, requestId);
    const resolvedAt = this.ctx.nowIso();
    if (!(await this.ctx.store.resolveRequest(request.id, 'declined', resolvedAt))) throw conflict('request already handled');
    return { ...request, status: 'declined', resolvedAt };
  }

  private async join(habit: Habit, userId: number): Promise<void> {
    const user = await this.ctx.requireUser(userId);
    if (!(await this.habits.addMember(habit.id, userId, this.ctx.todayOf(user)))) return;
    const now = this.ctx.now();
    await this.ctx.store.saveEvent({
      id: sortableId(now),
      type: 'habit_joined',
      actorId: userId,
      habitId: habit.id,
      otherUserId: null,
      date: null,
      createdAt: now.toISOString(),
    });
  }

  /** `actorId` is the one who approved; the feed reads "other is now friends with actor". */
  private async befriend(actorId: number, otherId: number): Promise<void> {
    if (await this.ctx.store.areFriends(actorId, otherId)) return;
    const now = this.ctx.now();
    await this.ctx.store.saveFriendship({ ...pair(actorId, otherId), createdAt: now.toISOString() });
    await this.ctx.store.saveEvent({
      id: sortableId(now),
      type: 'friendship',
      actorId,
      habitId: null,
      otherUserId: otherId,
      date: null,
      createdAt: now.toISOString(),
    });
  }

  async incomingRequests(userId: number): Promise<IncomingRequest[]> {
    const requests = await this.ctx.store.listPendingRequestsTo(userId);
    const users = new Map((await this.ctx.store.getUsers(requests.map((r) => r.fromUserId))).map((u) => [u.id, u]));
    const habits = new Map(
      (await this.ctx.store.getHabits(requests.flatMap((r) => (r.habitId ? [r.habitId] : [])))).map((h) => [h.id, h]),
    );
    return requests
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .flatMap((r) => {
        const from = users.get(r.fromUserId);
        if (!from) return [];
        const habit = r.habitId ? habits.get(r.habitId) : undefined;
        return [
          {
            id: r.id,
            type: r.type,
            from: { ...userRef(from), photoUrl: from.photoUrl },
            habit: habit ? habitRef(habit) : null,
            createdAt: r.createdAt,
          },
        ];
      });
  }

  async friends(userId: number): Promise<User[]> {
    const ids = await this.ctx.store.listFriendIds(userId);
    return (await this.ctx.store.getUsers(ids)).sort((a, b) => a.firstName.localeCompare(b.firstName));
  }

  /** Friends with the number of active habits they share with the user, for the profile screen. */
  async friendList(userId: number): Promise<FriendSummary[]> {
    const friends = await this.friends(userId);
    const mine = await this.ctx.store.listMembershipsOfUser(userId);
    const active = new Set(
      (await this.ctx.store.getHabits(mine.map((m) => m.habitId))).filter((h) => !h.archivedAt).map((h) => h.id),
    );
    const result: FriendSummary[] = [];
    for (const friend of friends) {
      const theirs = await this.ctx.store.listMembershipsOfUser(friend.id);
      result.push({
        id: friend.id,
        firstName: friend.firstName,
        lastName: friend.lastName,
        username: friend.username,
        photoUrl: friend.photoUrl,
        sharedHabits: theirs.filter((m) => active.has(m.habitId)).length,
      });
    }
    return result;
  }

  /** Shared habits stay as they are; only the friendship (and feed visibility) goes away. */
  async removeFriend(userId: number, friendId: number): Promise<void> {
    await this.ctx.store.deleteFriendship(userId, friendId);
  }
}
