import { describe, expect, it } from 'vitest';
import { DEFAULT_HABIT, setup } from './test-helpers';

describe('friend invite links', () => {
  it('creates a friend request that the link owner approves', async () => {
    const { app, user, sent } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    const link = await app.social.getInviteLink(1, null);

    const outcome = await app.social.requestByToken(2, link.token);
    expect(outcome.status).toBe('requested');
    expect(sent).toContainEqual(expect.objectContaining({ type: 'request_created', to: 1 }));

    if (outcome.status !== 'requested') return;
    await app.social.approve(1, outcome.request.id);

    expect((await app.social.friends(1)).map((u) => u.id)).toEqual([2]);
    expect(sent).toContainEqual(expect.objectContaining({ type: 'request_approved', to: 2 }));
  });

  it('reuses the same link until it is reset', async () => {
    const { app, user } = setup();
    await user(1, 'Влад');
    const first = await app.social.getInviteLink(1, null);

    expect((await app.social.getInviteLink(1, null)).token).toBe(first.token);
    const reset = await app.social.resetInviteLink(1, null);
    expect(reset.token).not.toBe(first.token);
    expect((await app.social.requestByToken(2, first.token)).status).toBe('invalid_link');
  });

  it('reports own links, duplicates and existing friendships without new requests', async () => {
    const { app, user, friends } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    await user(3, 'Дима');
    const link = await app.social.getInviteLink(1, null);

    expect((await app.social.requestByToken(1, link.token)).status).toBe('own_link');
    expect((await app.social.requestByToken(3, link.token)).status).toBe('requested');
    expect((await app.social.requestByToken(3, link.token)).status).toBe('already_requested');
    await friends(1, 2);
    expect((await app.social.requestByToken(2, link.token)).status).toBe('already_friends');
  });

  it('only lets the addressee approve or decline', async () => {
    const { app, user } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    const link = await app.social.getInviteLink(1, null);
    const outcome = await app.social.requestByToken(2, link.token);
    if (outcome.status !== 'requested') throw new Error('expected request');

    await expect(app.social.approve(2, outcome.request.id)).rejects.toMatchObject({ code: 'forbidden' });
    await app.social.decline(1, outcome.request.id);
    await expect(app.social.approve(1, outcome.request.id)).rejects.toMatchObject({ code: 'conflict' });
    expect(await app.social.friends(1)).toEqual([]);
  });
});

describe('habit invites', () => {
  it('joins a habit through its link after the owner approves and makes them friends', async () => {
    const { app, user } = setup();
    await user(1, 'Влад');
    await user(2, 'Аня');
    const habit = await app.habits.create(1, DEFAULT_HABIT);
    const link = await app.social.getInviteLink(1, habit.id);

    const outcome = await app.social.requestByToken(2, link.token);
    if (outcome.status !== 'requested') throw new Error('expected request');
    await app.social.approve(1, outcome.request.id);

    expect((await app.views.myHabits(2)).map((h) => h.id)).toEqual([habit.id]);
    expect((await app.social.friends(2)).map((u) => u.id)).toEqual([1]);
  });

  it('only the owner can create a habit link', async () => {
    const { app, user, sharedHabit } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    const habit = await sharedHabit(1, 2);

    await expect(app.social.getInviteLink(2, habit.id)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('invites an existing friend directly; the friend accepts', async () => {
    const { app, user, friends, sent } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    await friends(1, 2);
    const habit = await app.habits.create(1, DEFAULT_HABIT);

    const invite = await app.social.inviteToHabit(1, habit.id, 2);
    expect(sent).toContainEqual(expect.objectContaining({ type: 'request_created', to: 2, requestType: 'habit_invite' }));
    await app.social.approve(2, invite.id);

    expect((await app.views.myHabits(2)).map((h) => h.id)).toEqual([habit.id]);
  });

  it('cannot directly invite someone who is not a friend', async () => {
    const { app, user } = setup();
    await user(1, 'Влад');
    await user(3, 'Незнакомец');
    const habit = await app.habits.create(1, DEFAULT_HABIT);

    await expect(app.social.inviteToHabit(1, habit.id, 3)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('reports when the requester is already a member', async () => {
    const { app, user, sharedHabit } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    const habit = await sharedHabit(1, 2);
    const link = await app.social.getInviteLink(1, habit.id);

    expect((await app.social.requestByToken(2, link.token)).status).toBe('already_member');
  });
});

describe('feed and visibility', () => {
  it('shows friends’ checks on visible habits but hides private ones', async () => {
    const { app, user, friends } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    await friends(1, 2);
    const open = await app.habits.create(2, { ...DEFAULT_HABIT, title: 'Чтение' });
    const secret = await app.habits.create(2, { ...DEFAULT_HABIT, title: 'Дневник', visibility: 'private' });

    await app.checks.check(2, open.id);
    await app.checks.check(2, secret.id);
    const { items: feed } = await app.feed.list(1);

    const checks = feed.filter((e) => e.type === 'check');
    expect(checks.map((e) => e.habit?.title)).toEqual(['Чтение']);
    await expect(app.views.habit(1, secret.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(app.views.habit(1, open.id)).resolves.toMatchObject({ title: 'Чтение' });
  });

  it('does not show strangers’ activity', async () => {
    const { app, user } = setup();
    await user(1, 'Влад');
    await user(2, 'Незнакомка');
    const habit = await app.habits.create(2, DEFAULT_HABIT);

    await app.checks.check(2, habit.id);

    expect((await app.feed.list(1)).items).toEqual([]);
  });

  it('removes the feed entry when a check is undone', async () => {
    const { app, user } = setup();
    await user(1, 'Влад');
    const habit = await app.habits.create(1, DEFAULT_HABIT);

    await app.checks.check(1, habit.id);
    await app.checks.uncheck(1, habit.id, '2026-11-08');

    expect((await app.feed.list(1)).items.filter((e) => e.type === 'check')).toEqual([]);
  });
});

describe('friend list', () => {
  it('shows how many active habits each friend shares with the user', async () => {
    const { app, user, sharedHabit, friends } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    await user(3, 'Дима');
    await sharedHabit(1, 2);
    await friends(1, 3);

    const list = await app.social.friendList(1);

    expect(list.map((f) => [f.firstName, f.sharedHabits])).toEqual([
      ['Дима', 0],
      ['Маша', 1],
    ]);
  });
});

describe('request integrity', () => {
  it('approving the same request twice at once only applies it once', async () => {
    const { app, user, sent } = setup();
    await user(1, 'Влад');
    await user(2, 'Аня');
    const habit = await app.habits.create(1, DEFAULT_HABIT);
    const outcome = await app.social.requestByToken(2, (await app.social.getInviteLink(1, habit.id)).token);
    if (outcome.status !== 'requested') throw new Error('expected request');

    const results = await Promise.allSettled([
      app.social.approve(1, outcome.request.id),
      app.social.approve(1, outcome.request.id),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(sent.filter((n) => n.type === 'request_approved')).toHaveLength(1);
    expect((await app.feed.list(1)).items.filter((e) => e.type === 'habit_joined')).toHaveLength(1);
  });

  it('rejects a join request approved by someone who no longer owns the habit', async () => {
    const { app, user, sharedHabit } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    await user(3, 'Аня');
    const habit = await sharedHabit(1, 2);
    const outcome = await app.social.requestByToken(3, (await app.social.getInviteLink(1, habit.id)).token);
    if (outcome.status !== 'requested') throw new Error('expected request');

    await app.habits.transferOwnership(1, habit.id, 2);

    await expect(app.social.approve(1, outcome.request.id)).rejects.toMatchObject({ code: 'conflict' });
    expect((await app.views.habit(2, habit.id)).members.map((m) => m.userId)).toEqual([1, 2]);
  });

  it('revokes the previous owner’s habit link on transfer', async () => {
    const { app, user, sharedHabit } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    await user(3, 'Аня');
    const habit = await sharedHabit(1, 2);
    const link = await app.social.getInviteLink(1, habit.id);

    await app.habits.transferOwnership(1, habit.id, 2);

    expect((await app.social.requestByToken(3, link.token)).status).toBe('invalid_link');
  });

  it('rejects a habit invite after the friendship ended', async () => {
    const { app, user, friends } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    await friends(1, 2);
    const habit = await app.habits.create(1, DEFAULT_HABIT);
    const invite = await app.social.inviteToHabit(1, habit.id, 2);

    await app.social.removeFriend(1, 2);

    await expect(app.social.approve(2, invite.id)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('quietly ignores repeated friend requests for a week after a decline', async () => {
    const { app, user, sent } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    const link = await app.social.getInviteLink(1, null);
    const first = await app.social.requestByToken(2, link.token);
    if (first.status !== 'requested') throw new Error('expected request');
    await app.social.decline(1, first.request.id);
    sent.length = 0;

    const again = await app.social.requestByToken(2, link.token);

    expect(again.status).toBe('already_requested');
    expect(sent).toEqual([]);
  });

  it('reset revokes every active link, not just one', async () => {
    const { app, user, store } = setup();
    await user(1, 'Влад');
    const first = await app.social.getInviteLink(1, null);
    await store.saveInviteLink({ ...first, token: 'second-token' });

    await app.social.resetInviteLink(1, null);

    expect((await app.social.requestByToken(2, 'second-token')).status).toBe('invalid_link');
  });
});

describe('feed pagination', () => {
  it('keeps a cursor when hidden events filled the scanned pages', async () => {
    const { app, user, friends, setNow } = setup('2026-11-08T09:00:00Z');
    await user(1, 'Влад');
    await user(2, 'Маша');
    await friends(1, 2);
    setNow('2026-11-08T09:01:00Z');
    const secret = await app.habits.create(2, { ...DEFAULT_HABIT, visibility: 'private' });
    const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
    for (const [i, day] of days.entries()) {
      setNow(`2026-11-08T09:0${i + 2}:00Z`);
      await app.checks.check(2, secret.id, day);
    }

    const page = await app.feed.list(1, { limit: 1 });

    expect(page.items).toEqual([]);
    expect(page.nextCursor).not.toBeNull();
  });
});

describe('invite preview', () => {
  it('shows who invites and to which habit without sending anything', async () => {
    const { app, user, sharedHabit, sent } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    await user(3, 'Аня');
    const habit = await sharedHabit(1, 2);
    const link = await app.social.getInviteLink(1, habit.id);

    const preview = await app.social.previewInvite(3, link.token);

    expect(preview).toMatchObject({
      state: 'can_join',
      inviter: { firstName: 'Влад' },
      habit: { id: habit.id, title: 'Зал вместе', completionMode: 'all' },
    });
    expect(preview?.habit?.members.map((m) => m.firstName)).toEqual(['Влад', 'Маша']);
    expect(sent).toEqual([]);
    expect(await app.social.incomingRequests(1)).toEqual([]);
  });

  it('previews a friend link', async () => {
    const { app, user } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');

    const preview = await app.social.previewInvite(2, (await app.social.getInviteLink(1, null)).token);

    expect(preview).toMatchObject({ state: 'can_join', inviter: { firstName: 'Влад' }, habit: null });
    expect(preview?.inviter).not.toHaveProperty('id');
  });

  it('reflects what joining would do: own link, pending request, already in', async () => {
    const { app, user, sharedHabit } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    await user(3, 'Аня');
    const habit = await sharedHabit(1, 2);
    const friendLink = await app.social.getInviteLink(1, null);
    const habitLink = await app.social.getInviteLink(1, habit.id);
    await app.social.requestByToken(3, habitLink.token);

    expect((await app.social.previewInvite(1, friendLink.token))?.state).toBe('own_link');
    expect((await app.social.previewInvite(3, habitLink.token))?.state).toBe('already_requested');
    expect((await app.social.previewInvite(2, habitLink.token))?.state).toBe('already_member');
    expect((await app.social.previewInvite(2, friendLink.token))?.state).toBe('already_friends');
  });

  it('returns null for a revoked or unknown link', async () => {
    const { app, user } = setup();
    await user(1, 'Влад');
    const link = await app.social.getInviteLink(1, null);
    await app.social.resetInviteLink(1, null);

    expect(await app.social.previewInvite(2, link.token)).toBeNull();
    expect(await app.social.previewInvite(2, 'nope')).toBeNull();
  });
});

describe('invite edge cases', () => {
  it('shows a declined requester "already requested" during the cooldown and lets them retry after it', async () => {
    const { app, user, setNow } = setup('2026-11-08T09:00:00Z');
    await user(1, 'Влад');
    await user(2, 'Маша');
    const link = await app.social.getInviteLink(1, null);
    const first = await app.social.requestByToken(2, link.token);
    if (first.status !== 'requested') throw new Error('expected request');
    await app.social.decline(1, first.request.id);

    expect((await app.social.previewInvite(2, link.token))?.state).toBe('already_requested');
    setNow('2026-11-16T09:00:00Z');
    expect((await app.social.previewInvite(2, link.token))?.state).toBe('can_join');
  });

  it('creates one request and one notification when "Join" is tapped twice at once', async () => {
    const { app, user, sent } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    const link = await app.social.getInviteLink(1, null);

    const outcomes = await Promise.all([app.social.requestByToken(2, link.token), app.social.requestByToken(2, link.token)]);

    expect(outcomes.map((o) => o.status).sort()).toEqual(['already_requested', 'requested']);
    expect(sent.filter((n) => n.type === 'request_created')).toHaveLength(1);
  });

  it('does not promise a friendship that a full friend list would refuse', async () => {
    const { app, user, store } = setup();
    await user(1, 'Влад');
    await user(2, 'Маша');
    for (let id = 100; id < 300; id++) {
      await store.saveFriendship({ userA: 1, userB: id, createdAt: '2026-11-08T00:00:00Z' });
    }
    const link = await app.social.getInviteLink(1, null);

    expect((await app.social.previewInvite(2, link.token))?.state).toBe('friend_list_full');
    expect((await app.social.requestByToken(2, link.token)).status).toBe('friend_list_full');
  });
});
