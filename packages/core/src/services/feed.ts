import { habitRef, type Ctx } from '../context';
import type { LocalDate } from '../domain/dates';
import type { FeedEvent, FeedEventType, Habit } from '../models';
import type { HabitRef } from '../notifications';

export const DEFAULT_FEED_LIMIT = 30;
const MAX_FEED_LIMIT = 100;
const MAX_BATCHES = 5;

export interface FeedPerson {
  id: number;
  firstName: string;
  photoUrl: string | null;
}

export interface FeedPage {
  items: FeedItem[];
  /** Pass as `before` for the next page; null when there is nothing older. */
  nextCursor: string | null;
}

export interface FeedItem {
  id: string;
  type: FeedEventType;
  createdAt: string;
  date: LocalDate | null;
  actor: FeedPerson;
  otherUser: FeedPerson | null;
  habit: (HabitRef & { color: string }) | null;
}

export class FeedService {
  constructor(private readonly ctx: Ctx) {}

  /** The viewer's and their friends' activity, newest first. Pass the last item's id as `before` for the next page. */
  async list(viewerId: number, options: { before?: string | null; limit?: number } = {}): Promise<FeedPage> {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_FEED_LIMIT, 1), MAX_FEED_LIMIT);
    const actorIds = [viewerId, ...(await this.ctx.store.listFriendIds(viewerId))];
    const habits = new Map<string, Habit | null>();
    const visibility = new Map<string, boolean>();

    const isVisible = async (event: FeedEvent): Promise<boolean> => {
      if (event.habitId === null) return true;
      const cached = visibility.get(event.habitId);
      if (cached !== undefined) return cached;
      const habit = await this.ctx.store.getHabit(event.habitId);
      habits.set(event.habitId, habit);
      const visible =
        habit !== null &&
        (habit.visibility === 'friends' || (await this.ctx.store.getMembership(habit.id, viewerId)) !== null);
      visibility.set(event.habitId, visible);
      return visible;
    };

    // Hidden events are skipped, so a page may need several batches. The cursor always points at the
    // last event looked at, never at the last one shown, so nothing is lost between pages.
    const events: FeedEvent[] = [];
    let cursor = options.before ?? null;
    let exhausted = false;
    for (let batch = 0; batch < MAX_BATCHES && events.length < limit && !exhausted; batch++) {
      const page = await this.ctx.store.listEvents(actorIds, cursor, limit);
      for (const event of page) {
        if (events.length === limit) break;
        cursor = event.id;
        if (await isVisible(event)) events.push(event);
      }
      exhausted = page.length < limit && events.length < limit;
    }

    const userIds = new Set(events.flatMap((e) => (e.otherUserId === null ? [e.actorId] : [e.actorId, e.otherUserId])));
    const users = new Map((await this.ctx.store.getUsers([...userIds])).map((u) => [u.id, u]));
    const person = (id: number): FeedPerson | null => {
      const user = users.get(id);
      return user ? { id: user.id, firstName: user.firstName, photoUrl: user.photoUrl } : null;
    };

    const items = events.flatMap((event) => {
      const actor = person(event.actorId);
      if (!actor) return [];
      const habit = event.habitId ? habits.get(event.habitId) : null;
      return [
        {
          id: event.id,
          type: event.type,
          createdAt: event.createdAt,
          date: event.date,
          actor,
          otherUser: event.otherUserId === null ? null : person(event.otherUserId),
          habit: habit ? { ...habitRef(habit), color: habit.color } : null,
        },
      ];
    });
    return { items, nextCursor: exhausted ? null : cursor };
  }
}
