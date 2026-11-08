import { HabitIcon, habitColor } from '../components/HabitIcon';
import { Avatar } from '../components/Avatar';
import { SectionLabel } from '../components/Group';
import { PageTitle, Screen } from '../components/Screen';
import { EmptyState, ErrorState, Loading } from '../components/States';
import type { FeedItem } from '../lib/api';
import { dayMonth, feedDayLabel, localDateOf, timeOf } from '../lib/format';
import { useI18n, type Dict } from '../lib/i18n';
import { useFeed, useMe } from '../lib/queries';

/**
 * Neutral wording: the app does not know anyone's gender.
 * @param eventDay the day the event happened (its feed group); a check names its day only when made for an earlier one
 */
export function feedText(item: FeedItem, eventDay: string, t: Dict): string {
  switch (item.type) {
    case 'check':
      return item.date === eventDay || item.date === null ? t.feed.check : t.feed.checkDate(dayMonth(item.date, t.locale));
    case 'habit_created':
      return t.feed.created;
    case 'habit_joined':
      return t.feed.joined;
    case 'friendship':
      return t.feed.friends(item.otherUser?.firstName ?? '…');
  }
}

export function FeedScreen() {
  const { t } = useI18n();
  const me = useMe();
  const feed = useFeed();
  const today = localDateOf(new Date().toISOString(), me.timeZone);
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  const groups: { day: string; items: FeedItem[] }[] = [];
  for (const item of items) {
    const day = localDateOf(item.createdAt, me.timeZone);
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }

  return (
    <Screen withTabBar>
      <PageTitle title={t.feed.title} />
      {feed.isPending ? (
        <Loading />
      ) : feed.isError ? (
        <ErrorState onRetry={() => feed.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState text={t.feed.empty} />
      ) : (
        <>
          {groups.map((g) => (
            <section key={g.day} className="flex flex-col gap-2">
              <SectionLabel>{feedDayLabel(g.day, today, t)}</SectionLabel>
              <ul className="rounded-[24px] border border-line bg-surface px-4">
                {g.items.map((item) => (
                  <li key={item.id} className="flex gap-3 border-b border-line py-3 last:border-b-0">
                    <Avatar id={item.actor.id} name={item.actor.firstName} photoUrl={item.actor.photoUrl} size={40} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[15px] font-semibold">{item.actor.id === me.id ? `${item.actor.firstName} (${t.common.you})` : item.actor.firstName}</span>
                        <time className="tabular shrink-0 text-[13px] text-ink-3" dateTime={item.createdAt}>
                          {timeOf(item.createdAt, me.timeZone, t.locale)}
                        </time>
                      </div>
                      <p className="text-[14px] text-ink-2">{feedText(item, g.day, t)}</p>
                      {item.habit && (
                        <span
                          className="inline-flex w-fit max-w-full items-center gap-1 rounded-lg py-[3px] pr-2 pl-1.5 text-[13px] font-medium"
                          style={{ color: habitColor(item.habit.color), background: `color-mix(in srgb, ${habitColor(item.habit.color)} 14%, transparent)` }}
                        >
                          <HabitIcon name={item.habit.icon} size={13} />
                          <span className="truncate">{item.habit.title}</span>
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {feed.hasNextPage && (
            <button
              type="button"
              disabled={feed.isFetchingNextPage}
              onClick={() => feed.fetchNextPage()}
              className="press self-center rounded-2xl bg-surface-2 px-4 py-2 text-[15px] font-medium disabled:opacity-50"
            >
              {feed.isFetchingNextPage ? t.common.loading : t.feed.more}
            </button>
          )}
        </>
      )}
    </Screen>
  );
}
