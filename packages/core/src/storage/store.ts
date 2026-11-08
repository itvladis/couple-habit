import type { LocalDate } from '../domain/dates';
import type { Check, FeedEvent, Friendship, Habit, InviteLink, JoinRequest, Membership, RequestType, User } from '../models';

/**
 * Persistence boundary. Every method is async so the in-memory store and YDB share one contract.
 * Returned objects are copies: changing them does nothing until they are saved.
 */
export interface Store {
  getUser(id: number): Promise<User | null>;
  getUsers(ids: readonly number[]): Promise<User[]>;
  listUsers(): Promise<User[]>;
  saveUser(user: User): Promise<void>;
  setCanMessage(userId: number, canMessage: boolean): Promise<void>;
  markWeeklySummarySent(userId: number, week: LocalDate | null): Promise<void>;

  getHabit(id: string): Promise<Habit | null>;
  getHabits(ids: readonly string[]): Promise<Habit[]>;
  saveHabit(habit: Habit): Promise<void>;

  getMembership(habitId: string, userId: number): Promise<Membership | null>;
  listMembersOfHabit(habitId: string): Promise<Membership[]>;
  listMembershipsOfUser(userId: number): Promise<Membership[]>;
  listMembershipsWithReminders(): Promise<Membership[]>;
  saveMembership(membership: Membership): Promise<void>;
  /** Creates the membership unless it exists; returns whether it was created. */
  insertMembership(membership: Membership): Promise<boolean>;
  markReminderSent(habitId: string, userId: number, date: LocalDate | null): Promise<void>;
  setCheckNotice(habitId: string, userId: number, notice: Membership['lastCheckNotice']): Promise<void>;
  deleteMembership(habitId: string, userId: number): Promise<void>;

  getCheck(habitId: string, userId: number, date: LocalDate): Promise<Check | null>;
  /** Checks of a habit, optionally limited to an inclusive date range. */
  listChecks(habitId: string, from?: LocalDate, to?: LocalDate): Promise<Check[]>;
  /** Creates the check unless it exists; returns whether it was created. */
  insertCheck(check: Check): Promise<boolean>;
  deleteCheck(habitId: string, userId: number, date: LocalDate): Promise<void>;

  areFriends(a: number, b: number): Promise<boolean>;
  listFriendIds(userId: number): Promise<number[]>;
  saveFriendship(friendship: Friendship): Promise<void>;
  deleteFriendship(a: number, b: number): Promise<void>;

  getInviteLink(token: string): Promise<InviteLink | null>;
  findActiveInviteLink(ownerId: number, habitId: string | null): Promise<InviteLink | null>;
  saveInviteLink(link: InviteLink): Promise<void>;
  revokeActiveInviteLinks(ownerId: number, habitId: string | null, at: string): Promise<void>;

  getRequest(id: string): Promise<JoinRequest | null>;
  findPendingRequest(type: RequestType, fromUserId: number, toUserId: number, habitId: string | null): Promise<JoinRequest | null>;
  listPendingRequestsTo(userId: number): Promise<JoinRequest[]>;
  /** Most recent request of this kind in any status. */
  findLatestRequest(type: RequestType, fromUserId: number, toUserId: number, habitId: string | null): Promise<JoinRequest | null>;
  /** Saves a new pending request unless the same one is already pending; returns whether it was saved. */
  insertPendingRequest(request: JoinRequest): Promise<boolean>;
  /** Moves a pending request to `status`; returns false if it was no longer pending (someone else got there first). */
  resolveRequest(id: string, status: 'approved' | 'declined', resolvedAt: string): Promise<boolean>;

  saveEvent(event: FeedEvent): Promise<void>;
  deleteCheckEvents(habitId: string, actorId: number, date: LocalDate): Promise<void>;
  /** Newest first; `before` is an exclusive event-id cursor. */
  listEvents(actorIds: readonly number[], before: string | null, limit: number): Promise<FeedEvent[]>;
}
