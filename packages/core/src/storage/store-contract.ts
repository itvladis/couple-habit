import { describe, expect, it } from 'vitest';
import type { Check, FeedEvent, Habit, InviteLink, JoinRequest, Membership, User } from '../models';
import type { Store } from './store';

/*
 * Behaviour every Store must share. The same suite runs against MemoryStore and YdbStore.
 * Ids are random so the suite can run against a shared database without cleaning it.
 */

let counter = 0;
const uid = () => 1_000_000_000 + Math.floor(Math.random() * 1_000_000_000) + counter++;
const sid = () => crypto.randomUUID();
const now = '2026-11-08T09:00:00.000Z';

const user = (id = uid()): User => ({
  id,
  firstName: 'Влад',
  lastName: null,
  username: null,
  photoUrl: null,
  telegramLanguage: 'ru',
  language: null,
  theme: 'auto',
  timeZone: 'Europe/Samara',
  timeZoneManual: false,
  remindersEnabled: true,
  weeklySummary: { enabled: true, weekday: 7, time: '20:00' },
  lastWeeklySummaryWeek: null,
  canMessage: true,
  createdAt: now,
});

const habit = (ownerId: number, id = sid()): Habit => ({
  id,
  ownerId,
  title: 'Зал вместе',
  icon: 'dumbbell',
  color: 'mint',
  frequency: { type: 'weekdays', days: [1, 3, 5] },
  completionMode: 'all',
  visibility: 'friends',
  startDate: '2026-11-01',
  archivedAt: null,
  createdAt: now,
});

const membership = (habitId: string, userId: number, extra: Partial<Membership> = {}): Membership => ({
  habitId,
  userId,
  joinedAt: now,
  joinedDate: '2026-11-01',
  notifyOnCheck: true,
  reminder: null,
  cardSize: 'normal',
  lastReminderDate: null,
  lastCheckNotice: null,
  ...extra,
});

const request = (fromUserId: number, toUserId: number, extra: Partial<JoinRequest> = {}): JoinRequest => ({
  id: sid(),
  type: 'friend',
  fromUserId,
  toUserId,
  habitId: null,
  status: 'pending',
  createdAt: now,
  resolvedAt: null,
  ...extra,
});

let eventSeq = 0;
const event = (actorId: number, extra: Partial<FeedEvent> = {}): FeedEvent => ({
  // Time-sortable like sortableId(): a fixed-width prefix that grows with each call.
  id: `${String(Date.now()).padStart(15, '0')}${String(eventSeq++).padStart(6, '0')}`,
  type: 'habit_created',
  actorId,
  habitId: null,
  otherUserId: null,
  date: null,
  createdAt: now,
  ...extra,
});

export function describeStoreContract(name: string, create: () => Promise<Store>) {
  describe(`${name} — Store contract`, () => {
    it('stores and reads users, ignoring unknown ids', async () => {
      const store = await create();
      const a = user();
      const b = user();
      await store.saveUser(a);
      await store.saveUser(b);

      expect(await store.getUser(a.id)).toEqual(a);
      expect(await store.getUser(uid())).toBeNull();
      expect((await store.getUsers([a.id, uid(), b.id])).map((u) => u.id).sort()).toEqual([a.id, b.id].sort());
      expect(await store.getUsers([])).toEqual([]);
      expect((await store.listUsers()).map((u) => u.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    });

    it('updates single user fields without touching the rest', async () => {
      const store = await create();
      const a = user();
      await store.saveUser(a);

      await store.setCanMessage(a.id, false);
      await store.markWeeklySummarySent(a.id, '2026-11-02');

      expect(await store.getUser(a.id)).toEqual({ ...a, canMessage: false, lastWeeklySummaryWeek: '2026-11-02' });
    });

    it('stores habits', async () => {
      const store = await create();
      const h1 = habit(uid());
      const h2 = habit(uid());
      await store.saveHabit(h1);
      await store.saveHabit({ ...h2, title: 'Бег' });

      expect(await store.getHabit(h1.id)).toEqual(h1);
      expect(await store.getHabit(sid())).toBeNull();
      expect((await store.getHabits([h2.id, h1.id])).map((h) => h.title).sort()).toEqual(['Бег', 'Зал вместе']);
      expect(await store.getHabits([])).toEqual([]);
    });

    it('lists memberships by habit, by user and with reminders', async () => {
      const store = await create();
      const habitId = sid();
      const [a, b] = [uid(), uid()];
      await store.saveMembership(membership(habitId, a, { reminder: { type: 'exact', time: '09:00' } }));
      await store.saveMembership(membership(habitId, b));

      expect((await store.listMembersOfHabit(habitId)).map((m) => m.userId).sort()).toEqual([a, b].sort());
      expect((await store.listMembershipsOfUser(a)).map((m) => m.habitId)).toEqual([habitId]);
      const withReminders = (await store.listMembershipsWithReminders()).filter((m) => m.habitId === habitId);
      expect(withReminders.map((m) => m.userId)).toEqual([a]);
    });

    it('inserts a membership only once and keeps the existing settings', async () => {
      const store = await create();
      const habitId = sid();
      const a = uid();

      expect(await store.insertMembership(membership(habitId, a, { cardSize: 'wide' }))).toBe(true);
      expect(await store.insertMembership(membership(habitId, a))).toBe(false);

      expect((await store.getMembership(habitId, a))?.cardSize).toBe('wide');
    });

    it('updates reminder and check-notice markers and deletes memberships', async () => {
      const store = await create();
      const habitId = sid();
      const a = uid();
      await store.saveMembership(membership(habitId, a));

      await store.markReminderSent(habitId, a, '2026-11-08');
      await store.setCheckNotice(habitId, a, { date: '2026-11-08', at: now });
      expect(await store.getMembership(habitId, a)).toMatchObject({ lastReminderDate: '2026-11-08', lastCheckNotice: { date: '2026-11-08', at: now } });

      await store.deleteMembership(habitId, a);
      expect(await store.getMembership(habitId, a)).toBeNull();
    });

    it('inserts checks once and lists them by date range', async () => {
      const store = await create();
      const habitId = sid();
      const a = uid();
      const check = (date: string): Check => ({ habitId, userId: a, date, createdAt: now });

      expect(await store.insertCheck(check('2026-11-05'))).toBe(true);
      expect(await store.insertCheck(check('2026-11-05'))).toBe(false);
      await store.insertCheck(check('2026-11-07'));
      await store.insertCheck(check('2026-11-08'));

      expect(await store.getCheck(habitId, a, '2026-11-05')).toEqual(check('2026-11-05'));
      expect((await store.listChecks(habitId)).map((c) => c.date).sort()).toEqual(['2026-11-05', '2026-11-07', '2026-11-08']);
      expect((await store.listChecks(habitId, '2026-11-06', '2026-11-07')).map((c) => c.date)).toEqual(['2026-11-07']);

      await store.deleteCheck(habitId, a, '2026-11-07');
      expect(await store.getCheck(habitId, a, '2026-11-07')).toBeNull();
    });

    it('keeps friendships symmetric', async () => {
      const store = await create();
      const [a, b, c] = [uid(), uid(), uid()];
      await store.saveFriendship({ userA: Math.min(a, b), userB: Math.max(a, b), createdAt: now });

      expect(await store.areFriends(a, b)).toBe(true);
      expect(await store.areFriends(b, a)).toBe(true);
      expect(await store.areFriends(a, c)).toBe(false);
      expect(await store.listFriendIds(a)).toEqual([b]);
      expect(await store.listFriendIds(b)).toEqual([a]);

      await store.deleteFriendship(b, a);
      expect(await store.areFriends(a, b)).toBe(false);
      expect(await store.listFriendIds(a)).toEqual([]);
    });

    it('finds and revokes active invite links', async () => {
      const store = await create();
      const owner = uid();
      const habitId = sid();
      const friendLink: InviteLink = { token: sid(), ownerId: owner, habitId: null, createdAt: now, revokedAt: null };
      const habitLink: InviteLink = { token: sid(), ownerId: owner, habitId, createdAt: now, revokedAt: null };
      await store.saveInviteLink(friendLink);
      await store.saveInviteLink(habitLink);

      expect(await store.getInviteLink(friendLink.token)).toEqual(friendLink);
      expect(await store.findActiveInviteLink(owner, null)).toEqual(friendLink);
      expect(await store.findActiveInviteLink(owner, habitId)).toEqual(habitLink);

      await store.revokeActiveInviteLinks(owner, null, now);
      expect(await store.findActiveInviteLink(owner, null)).toBeNull();
      expect((await store.getInviteLink(friendLink.token))?.revokedAt).toBe(now);
      expect(await store.findActiveInviteLink(owner, habitId)).toEqual(habitLink);
    });

    it('keeps one pending request per pair and resolves it once', async () => {
      const store = await create();
      const [from, to] = [uid(), uid()];
      const first = request(from, to);

      expect(await store.insertPendingRequest(first)).toBe(true);
      expect(await store.insertPendingRequest(request(from, to))).toBe(false);
      expect(await store.findPendingRequest('friend', from, to, null)).toEqual(first);
      expect((await store.listPendingRequestsTo(to)).map((r) => r.id)).toEqual([first.id]);

      expect(await store.resolveRequest(first.id, 'declined', now)).toBe(true);
      expect(await store.resolveRequest(first.id, 'approved', now)).toBe(false);
      expect(await store.getRequest(first.id)).toMatchObject({ status: 'declined', resolvedAt: now });
      expect(await store.listPendingRequestsTo(to)).toEqual([]);
    });

    it('returns the latest request of a kind in any status', async () => {
      const store = await create();
      const [from, to] = [uid(), uid()];
      const old = request(from, to, { createdAt: '2026-11-01T00:00:00.000Z', status: 'declined' });
      const fresh = request(from, to, { createdAt: '2026-11-07T00:00:00.000Z' });
      await store.insertPendingRequest({ ...old, status: 'pending' });
      await store.resolveRequest(old.id, 'declined', now);
      await store.insertPendingRequest(fresh);

      expect((await store.findLatestRequest('friend', from, to, null))?.id).toBe(fresh.id);
      expect(await store.findLatestRequest('friend', to, from, null)).toBeNull();
    });

    it('lists events of the given actors newest first, with a cursor', async () => {
      const store = await create();
      const [a, b, stranger] = [uid(), uid(), uid()];
      const e1 = event(a);
      const e2 = event(b);
      const e3 = event(stranger);
      const e4 = event(a);
      for (const e of [e1, e2, e3, e4]) await store.saveEvent(e);

      const first = await store.listEvents([a, b], null, 2);
      expect(first.map((e) => e.id)).toEqual([e4.id, e2.id]);
      expect((await store.listEvents([a, b], e2.id, 10)).map((e) => e.id)).toEqual([e1.id]);
    });

    it('deletes a habit with everything that belongs to it and nothing else', async () => {
      const store = await create();
      const [owner, friend] = [uid(), uid()];
      const gone = habit(owner);
      const kept = habit(owner);
      for (const h of [gone, kept]) {
        await store.saveHabit(h);
        await store.saveMembership(membership(h.id, owner));
        await store.saveMembership(membership(h.id, friend));
        await store.insertCheck({ habitId: h.id, userId: friend, date: '2026-11-07', createdAt: now });
        await store.saveInviteLink({ token: sid(), ownerId: owner, habitId: h.id, createdAt: now, revokedAt: null });
      }
      const friendLink: InviteLink = { token: sid(), ownerId: owner, habitId: null, createdAt: now, revokedAt: null };
      await store.saveInviteLink(friendLink);
      const goneRequest = request(friend, owner, { type: 'habit_join', habitId: gone.id });
      const keptRequest = request(friend, owner, { type: 'habit_join', habitId: kept.id });
      for (const r of [goneRequest, keptRequest]) await store.insertPendingRequest(r);
      const goneEvents = [event(owner, { habitId: gone.id }), event(friend, { type: 'check', habitId: gone.id, date: '2026-11-07' })];
      const keptEvents = [event(owner, { habitId: kept.id }), event(owner, { type: 'friendship', otherUserId: friend })];
      for (const e of [...goneEvents, ...keptEvents]) await store.saveEvent(e);

      await store.deleteHabit(gone.id);
      await store.deleteHabit(sid()); // unknown ids are fine: a retried request may delete twice

      expect(await store.getHabit(gone.id)).toBeNull();
      expect(await store.listMembersOfHabit(gone.id)).toEqual([]);
      expect(await store.listChecks(gone.id)).toEqual([]);
      expect(await store.findActiveInviteLink(owner, gone.id)).toBeNull();
      expect(await store.getRequest(goneRequest.id)).toBeNull();
      expect((await store.listMembershipsOfUser(friend)).map((m) => m.habitId)).toEqual([kept.id]);
      expect(await store.getHabit(kept.id)).toEqual(kept);
      expect(await store.listChecks(kept.id)).toHaveLength(1);
      expect(await store.findActiveInviteLink(owner, kept.id)).not.toBeNull();
      expect(await store.findActiveInviteLink(owner, null)).toEqual(friendLink);
      expect(await store.getRequest(keptRequest.id)).not.toBeNull();
      expect((await store.listEvents([owner, friend], null, 10)).map((e) => e.id).sort()).toEqual(keptEvents.map((e) => e.id).sort());
    });

    it('deletes only the matching check events', async () => {
      const store = await create();
      const a = uid();
      const habitId = sid();
      const keep = event(a, { type: 'check', habitId, date: '2026-11-07' });
      const drop = event(a, { type: 'check', habitId, date: '2026-11-08' });
      const created = event(a, { type: 'habit_created', habitId });
      for (const e of [keep, drop, created]) await store.saveEvent(e);

      await store.deleteCheckEvents(habitId, a, '2026-11-08');

      expect((await store.listEvents([a], null, 10)).map((e) => e.id).sort()).toEqual([keep.id, created.id].sort());
    });
  });
}
