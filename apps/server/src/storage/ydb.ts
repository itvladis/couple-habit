import type {
  Check,
  FeedEvent,
  Friendship,
  Habit,
  InviteLink,
  JoinRequest,
  LocalDate,
  Membership,
  RequestType,
  Store,
  User,
} from '@habit/core';
import type { QueryClient, SQL } from '@ydbjs/query';

/*
 * YDB (serverless) implementation of the Store contract.
 *
 * Layout: every table keeps the whole entity as JSON in `data` and copies the fields that queries
 * filter on into their own columns (with global indexes where needed). Keys are Utf8 strings, so
 * Telegram ids above 2^31 need no special integer typing. Read-modify-write operations run in
 * serializable transactions, which gives the atomic "insert if absent" and "resolve once" the
 * services rely on.
 */

type Sql = QueryClient;
/** Either the client or a transaction: both are callable YQL tags. */
type Runner = SQL;
type DataRow = { data: string };

const FIRST_DATE = '0000-01-01';
const LAST_DATE = '9999-12-31';
/** Sorts after every event id (ids are time-sortable ASCII). */
const CURSOR_MAX = '\u{10FFFF}';

const key = (id: number) => String(id);
const habitKey = (habitId: string | null) => habitId ?? '';
const parse = <T>(rows: DataRow[] | undefined): T[] => (rows ?? []).map((r) => JSON.parse(r.data) as T);
const first = <T>(rows: DataRow[] | undefined): T | null => parse<T>(rows)[0] ?? null;

export const TABLES = ['users', 'habits', 'memberships', 'checks', 'friendships', 'invite_links', 'requests', 'events'] as const;

/** DDL for all tables; `prefix` isolates test runs inside one database. */
export function schema(prefix = ''): string[] {
  const t = (name: string) => `\`${prefix}${name}\``;
  return [
    `CREATE TABLE IF NOT EXISTS ${t('users')} (id Utf8, data Utf8, PRIMARY KEY (id))`,
    `CREATE TABLE IF NOT EXISTS ${t('habits')} (id Utf8, data Utf8, PRIMARY KEY (id))`,
    `CREATE TABLE IF NOT EXISTS ${t('memberships')} (
      habit_id Utf8, user_id Utf8, has_reminder Bool, data Utf8,
      PRIMARY KEY (habit_id, user_id),
      INDEX by_user GLOBAL SYNC ON (user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS ${t('checks')} (
      habit_id Utf8, date Utf8, user_id Utf8, data Utf8,
      PRIMARY KEY (habit_id, date, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS ${t('friendships')} (
      user_id Utf8, friend_id Utf8, data Utf8,
      PRIMARY KEY (user_id, friend_id)
    )`,
    `CREATE TABLE IF NOT EXISTS ${t('invite_links')} (
      token Utf8, owner_id Utf8, habit_key Utf8, revoked Bool, data Utf8,
      PRIMARY KEY (token),
      INDEX by_owner GLOBAL SYNC ON (owner_id, habit_key)
    )`,
    `CREATE TABLE IF NOT EXISTS ${t('requests')} (
      id Utf8, to_id Utf8, from_id Utf8, type Utf8, habit_key Utf8, status Utf8, created_at Utf8, data Utf8,
      PRIMARY KEY (id),
      INDEX by_to GLOBAL SYNC ON (to_id, from_id)
    )`,
    `CREATE TABLE IF NOT EXISTS ${t('events')} (
      id Utf8, actor_id Utf8, type Utf8, habit_id Utf8, date Utf8, data Utf8,
      PRIMARY KEY (id),
      INDEX by_actor GLOBAL SYNC ON (actor_id, id)
    )`,
  ];
}

export async function createSchema(sql: Sql, prefix = ''): Promise<void> {
  for (const statement of schema(prefix)) await sql`${sql.unsafe(statement)}`;
}

export async function dropSchema(sql: Sql, prefix: string): Promise<void> {
  if (!prefix) throw new Error('refusing to drop unprefixed (production) tables');
  for (const name of TABLES) await sql`${sql.unsafe(`DROP TABLE IF EXISTS \`${prefix}${name}\``)}`;
}

export class YdbStore implements Store {
  constructor(
    private readonly sql: Sql,
    private readonly prefix = '',
  ) {}

  private t(name: (typeof TABLES)[number]) {
    return this.sql.identifier(`${this.prefix}${name}`);
  }

  // ---------- users ----------

  private async readUser(run: Runner, id: number): Promise<User | null> {
    const [rows] = await run<[DataRow]>`SELECT data FROM ${this.t('users')} WHERE id = ${key(id)}`;
    return first<User>(rows);
  }

  private writeUser(run: Runner, user: User) {
    return run`UPSERT INTO ${this.t('users')} (id, data) VALUES (${key(user.id)}, ${JSON.stringify(user)})`;
  }

  getUser(id: number) {
    return this.readUser(this.sql, id);
  }

  async getUsers(ids: readonly number[]) {
    if (ids.length === 0) return [];
    const [rows] = await this.sql<[DataRow]>`SELECT data FROM ${this.t('users')} WHERE id IN ${ids.map(key)}`;
    return parse<User>(rows);
  }

  async listUsers() {
    const [rows] = await this.sql<[DataRow]>`SELECT data FROM ${this.t('users')}`;
    return parse<User>(rows);
  }

  async saveUser(user: User) {
    await this.writeUser(this.sql, user);
  }

  private updateUser(id: number, change: (u: User) => User) {
    return this.sql.begin(async (tx) => {
      const user = await this.readUser(tx, id);
      if (user) await this.writeUser(tx, change(user));
    });
  }

  setCanMessage(userId: number, canMessage: boolean) {
    return this.updateUser(userId, (u) => ({ ...u, canMessage }));
  }

  markWeeklySummarySent(userId: number, week: LocalDate | null) {
    return this.updateUser(userId, (u) => ({ ...u, lastWeeklySummaryWeek: week }));
  }

  // ---------- habits ----------

  async getHabit(id: string) {
    const [rows] = await this.sql<[DataRow]>`SELECT data FROM ${this.t('habits')} WHERE id = ${id}`;
    return first<Habit>(rows);
  }

  async getHabits(ids: readonly string[]) {
    if (ids.length === 0) return [];
    const [rows] = await this.sql<[DataRow]>`SELECT data FROM ${this.t('habits')} WHERE id IN ${[...ids]}`;
    return parse<Habit>(rows);
  }

  async saveHabit(habit: Habit) {
    await this.sql`UPSERT INTO ${this.t('habits')} (id, data) VALUES (${habit.id}, ${JSON.stringify(habit)})`;
  }

  // ---------- memberships ----------

  private async readMembership(run: Runner, habitId: string, userId: number) {
    const [rows] = await run<[DataRow]>`
      SELECT data FROM ${this.t('memberships')} WHERE habit_id = ${habitId} AND user_id = ${key(userId)}`;
    return first<Membership>(rows);
  }

  private writeMembership(run: Runner, m: Membership) {
    return run`
      UPSERT INTO ${this.t('memberships')} (habit_id, user_id, has_reminder, data)
      VALUES (${m.habitId}, ${key(m.userId)}, ${m.reminder !== null}, ${JSON.stringify(m)})`;
  }

  getMembership(habitId: string, userId: number) {
    return this.readMembership(this.sql, habitId, userId);
  }

  async listMembersOfHabit(habitId: string) {
    const [rows] = await this.sql<[DataRow]>`SELECT data FROM ${this.t('memberships')} WHERE habit_id = ${habitId}`;
    return parse<Membership>(rows);
  }

  async listMembershipsOfUser(userId: number) {
    const [rows] = await this.sql<[DataRow]>`
      SELECT data FROM ${this.t('memberships')} VIEW by_user WHERE user_id = ${key(userId)}`;
    return parse<Membership>(rows);
  }

  async listMembershipsWithReminders() {
    const [rows] = await this.sql<[DataRow]>`SELECT data FROM ${this.t('memberships')} WHERE has_reminder = true`;
    return parse<Membership>(rows);
  }

  async saveMembership(membership: Membership) {
    await this.writeMembership(this.sql, membership);
  }

  insertMembership(membership: Membership) {
    return this.sql.begin(async (tx) => {
      if (await this.readMembership(tx, membership.habitId, membership.userId)) return false;
      await this.writeMembership(tx, membership);
      return true;
    });
  }

  private updateMembership(habitId: string, userId: number, change: (m: Membership) => Membership) {
    return this.sql.begin(async (tx) => {
      const m = await this.readMembership(tx, habitId, userId);
      if (m) await this.writeMembership(tx, change(m));
    });
  }

  markReminderSent(habitId: string, userId: number, date: LocalDate | null) {
    return this.updateMembership(habitId, userId, (m) => ({ ...m, lastReminderDate: date }));
  }

  setCheckNotice(habitId: string, userId: number, notice: Membership['lastCheckNotice']) {
    return this.updateMembership(habitId, userId, (m) => ({ ...m, lastCheckNotice: notice }));
  }

  async deleteMembership(habitId: string, userId: number) {
    await this.sql`DELETE FROM ${this.t('memberships')} WHERE habit_id = ${habitId} AND user_id = ${key(userId)}`;
  }

  // ---------- checks ----------

  private async readCheck(run: Runner, habitId: string, userId: number, date: LocalDate) {
    const [rows] = await run<[DataRow]>`
      SELECT data FROM ${this.t('checks')} WHERE habit_id = ${habitId} AND date = ${date} AND user_id = ${key(userId)}`;
    return first<Check>(rows);
  }

  getCheck(habitId: string, userId: number, date: LocalDate) {
    return this.readCheck(this.sql, habitId, userId, date);
  }

  async listChecks(habitId: string, from?: LocalDate, to?: LocalDate) {
    const [rows] = await this.sql<[DataRow]>`
      SELECT data FROM ${this.t('checks')}
      WHERE habit_id = ${habitId} AND date >= ${from ?? FIRST_DATE} AND date <= ${to ?? LAST_DATE}`;
    return parse<Check>(rows);
  }

  insertCheck(check: Check) {
    return this.sql.begin(async (tx) => {
      if (await this.readCheck(tx, check.habitId, check.userId, check.date)) return false;
      await tx`
        UPSERT INTO ${this.t('checks')} (habit_id, date, user_id, data)
        VALUES (${check.habitId}, ${check.date}, ${key(check.userId)}, ${JSON.stringify(check)})`;
      return true;
    });
  }

  async deleteCheck(habitId: string, userId: number, date: LocalDate) {
    await this.sql`
      DELETE FROM ${this.t('checks')} WHERE habit_id = ${habitId} AND date = ${date} AND user_id = ${key(userId)}`;
  }

  // ---------- friendships (stored once per direction) ----------

  async areFriends(a: number, b: number) {
    const [rows] = await this.sql<[{ user_id: string }]>`
      SELECT user_id FROM ${this.t('friendships')} WHERE user_id = ${key(a)} AND friend_id = ${key(b)}`;
    return (rows?.length ?? 0) > 0;
  }

  async listFriendIds(userId: number) {
    const [rows] = await this.sql<[{ friend_id: string }]>`
      SELECT friend_id FROM ${this.t('friendships')} WHERE user_id = ${key(userId)}`;
    return (rows ?? []).map((r) => Number(r.friend_id));
  }

  async saveFriendship(friendship: Friendship) {
    const data = JSON.stringify(friendship);
    await this.sql.begin(async (tx) => {
      await tx`
        UPSERT INTO ${this.t('friendships')} (user_id, friend_id, data) VALUES
        (${key(friendship.userA)}, ${key(friendship.userB)}, ${data}),
        (${key(friendship.userB)}, ${key(friendship.userA)}, ${data})`;
    });
  }

  async deleteFriendship(a: number, b: number) {
    await this.sql.begin(async (tx) => {
      await tx`DELETE FROM ${this.t('friendships')} WHERE user_id = ${key(a)} AND friend_id = ${key(b)}`;
      await tx`DELETE FROM ${this.t('friendships')} WHERE user_id = ${key(b)} AND friend_id = ${key(a)}`;
    });
  }

  // ---------- invite links ----------

  private writeLink(run: Runner, link: InviteLink) {
    return run`
      UPSERT INTO ${this.t('invite_links')} (token, owner_id, habit_key, revoked, data)
      VALUES (${link.token}, ${key(link.ownerId)}, ${habitKey(link.habitId)}, ${link.revokedAt !== null}, ${JSON.stringify(link)})`;
  }

  async getInviteLink(token: string) {
    const [rows] = await this.sql<[DataRow]>`SELECT data FROM ${this.t('invite_links')} WHERE token = ${token}`;
    return first<InviteLink>(rows);
  }

  private async activeLinks(run: Runner, ownerId: number, habitId: string | null) {
    const [rows] = await run<[DataRow]>`
      SELECT data FROM ${this.t('invite_links')} VIEW by_owner
      WHERE owner_id = ${key(ownerId)} AND habit_key = ${habitKey(habitId)} AND revoked = false`;
    return parse<InviteLink>(rows);
  }

  async findActiveInviteLink(ownerId: number, habitId: string | null) {
    return (await this.activeLinks(this.sql, ownerId, habitId))[0] ?? null;
  }

  async saveInviteLink(link: InviteLink) {
    await this.writeLink(this.sql, link);
  }

  async revokeActiveInviteLinks(ownerId: number, habitId: string | null, at: string) {
    await this.sql.begin(async (tx) => {
      for (const link of await this.activeLinks(tx, ownerId, habitId)) await this.writeLink(tx, { ...link, revokedAt: at });
    });
  }

  // ---------- requests ----------

  private writeRequest(run: Runner, r: JoinRequest) {
    return run`
      UPSERT INTO ${this.t('requests')} (id, to_id, from_id, type, habit_key, status, created_at, data)
      VALUES (${r.id}, ${key(r.toUserId)}, ${key(r.fromUserId)}, ${r.type}, ${habitKey(r.habitId)}, ${r.status}, ${r.createdAt}, ${JSON.stringify(r)})`;
  }

  private async readRequest(run: Runner, id: string) {
    const [rows] = await run<[DataRow]>`SELECT data FROM ${this.t('requests')} WHERE id = ${id}`;
    return first<JoinRequest>(rows);
  }

  private async pending(run: Runner, type: RequestType, fromUserId: number, toUserId: number, habitId: string | null) {
    const [rows] = await run<[DataRow]>`
      SELECT data FROM ${this.t('requests')} VIEW by_to
      WHERE to_id = ${key(toUserId)} AND from_id = ${key(fromUserId)} AND type = ${type}
        AND habit_key = ${habitKey(habitId)} AND status = 'pending'`;
    return first<JoinRequest>(rows);
  }

  getRequest(id: string) {
    return this.readRequest(this.sql, id);
  }

  findPendingRequest(type: RequestType, fromUserId: number, toUserId: number, habitId: string | null) {
    return this.pending(this.sql, type, fromUserId, toUserId, habitId);
  }

  async findLatestRequest(type: RequestType, fromUserId: number, toUserId: number, habitId: string | null) {
    const [rows] = await this.sql<[DataRow]>`
      SELECT data, created_at FROM ${this.t('requests')} VIEW by_to
      WHERE to_id = ${key(toUserId)} AND from_id = ${key(fromUserId)} AND type = ${type} AND habit_key = ${habitKey(habitId)}
      ORDER BY created_at DESC LIMIT 1`;
    return first<JoinRequest>(rows);
  }

  async listPendingRequestsTo(userId: number) {
    const [rows] = await this.sql<[DataRow]>`
      SELECT data FROM ${this.t('requests')} VIEW by_to WHERE to_id = ${key(userId)} AND status = 'pending'`;
    return parse<JoinRequest>(rows);
  }

  insertPendingRequest(request: JoinRequest) {
    return this.sql.begin(async (tx) => {
      if (await this.pending(tx, request.type, request.fromUserId, request.toUserId, request.habitId)) return false;
      await this.writeRequest(tx, request);
      return true;
    });
  }

  resolveRequest(id: string, status: 'approved' | 'declined', resolvedAt: string) {
    return this.sql.begin(async (tx) => {
      const request = await this.readRequest(tx, id);
      if (!request || request.status !== 'pending') return false;
      await this.writeRequest(tx, { ...request, status, resolvedAt });
      return true;
    });
  }

  // ---------- events ----------

  async saveEvent(e: FeedEvent) {
    await this.sql`
      UPSERT INTO ${this.t('events')} (id, actor_id, type, habit_id, date, data)
      VALUES (${e.id}, ${key(e.actorId)}, ${e.type}, ${e.habitId ?? ''}, ${e.date ?? ''}, ${JSON.stringify(e)})`;
  }

  async deleteCheckEvents(habitId: string, actorId: number, date: LocalDate) {
    await this.sql.begin(async (tx) => {
      const [rows] = await tx<[{ id: string }]>`
        SELECT id FROM ${this.t('events')} VIEW by_actor
        WHERE actor_id = ${key(actorId)} AND type = 'check' AND habit_id = ${habitId} AND date = ${date}`;
      const ids = (rows ?? []).map((r) => r.id);
      if (ids.length > 0) await tx`DELETE FROM ${this.t('events')} WHERE id IN ${ids}`;
    });
  }

  async listEvents(actorIds: readonly number[], before: string | null, limit: number) {
    if (actorIds.length === 0) return [];
    const [rows] = await this.sql<[DataRow]>`
      SELECT data, id FROM ${this.t('events')} VIEW by_actor
      WHERE actor_id IN ${actorIds.map(key)} AND id < ${before ?? CURSOR_MAX}
      ORDER BY id DESC LIMIT ${limit}`;
    return parse<FeedEvent>(rows);
  }
}
