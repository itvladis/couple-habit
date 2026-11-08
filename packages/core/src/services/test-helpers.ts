import { createApp } from '../app';
import type { Notification } from '../notifications';
import { MemoryStore } from '../storage/memory';
import type { HabitInput } from '../schemas';

export const DEFAULT_HABIT: HabitInput = {
  title: 'Зал вместе',
  icon: 'dumbbell',
  color: 'mint',
  frequency: { type: 'daily' },
  completionMode: 'all',
  visibility: 'friends',
};

/** Fresh app over an in-memory store with a controllable clock and captured notifications. */
export function setup(nowIso = '2026-11-08T09:00:00Z') {
  const store = new MemoryStore();
  let now = new Date(nowIso);
  const clock = { now: () => now };
  const sent: Notification[] = [];
  let failures = 0;
  const notifier = {
    send: async (n: Notification) => {
      if (failures > 0) {
        failures--;
        throw new Error('telegram is down');
      }
      sent.push(n);
    },
  };
  /** The next `count` deliveries fail as a transient Telegram error would. */
  const failNextSends = (count: number) => {
    failures = count;
  };
  const app = createApp({ store, clock, notifier });

  const user = (id: number, firstName: string, timeZone = 'Europe/Moscow') =>
    app.users.upsertFromTelegram({ id, first_name: firstName }, timeZone);

  /** Two users who are already friends. */
  const friends = async (a: number, b: number) => {
    const link = await app.social.getInviteLink(a, null);
    const outcome = await app.social.requestByToken(b, link.token);
    if (outcome.status !== 'requested') throw new Error(`unexpected ${outcome.status}`);
    await app.social.approve(a, outcome.request.id);
  };

  /** Owner `a` creates a habit and `b` joins it through a direct invite. */
  const sharedHabit = async (a: number, b: number, input: Partial<HabitInput> = {}) => {
    await friends(a, b);
    const habit = await app.habits.create(a, { ...DEFAULT_HABIT, ...input });
    const invite = await app.social.inviteToHabit(a, habit.id, b);
    await app.social.approve(b, invite.id);
    sent.length = 0;
    return habit;
  };

  const setNow = (iso: string) => {
    now = new Date(iso);
  };

  return { app, store, sent, user, friends, sharedHabit, setNow, failNextSends };
}
