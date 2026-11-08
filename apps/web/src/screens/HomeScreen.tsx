import { Plus, Send } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigation } from '../app/navigation';
import { AvatarStack } from '../components/Avatar';
import { HabitCard } from '../components/HabitCard';
import { PageTitle, Screen } from '../components/Screen';
import { ActionSheet, useSheetItem } from '../components/Sheet';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { api, type HabitView } from '../lib/api';
import { errorText } from '../lib/errors';
import { headerDate, localDateOf } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { qk, useFriends, useHabits, useMe, useToggleCheck } from '../lib/queries';
import { haptic } from '../lib/telegram';
import { HabitEditor } from './HabitEditor';

type Filter = 'all' | 'shared' | 'mine';

export function HomeScreen() {
  const { t } = useI18n();
  const me = useMe();
  const nav = useNavigation();
  const client = useQueryClient();
  const toast = useToast();
  const habits = useHabits();
  const friends = useFriends();
  const toggle = useToggleCheck(me.id);
  const [filter, setFilter] = useState<Filter>('all');
  const [creating, setCreating] = useState(false);
  const menu = useSheetItem<HabitView>();
  const menuFor = menu.item;

  const resize = useMutation({
    mutationFn: ({ id, wide }: { id: string; wide: boolean }) => api.updateMembership(id, { cardSize: wide ? 'wide' : 'normal' }),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.habits(false) }),
    onError: (error) => toast(errorText(error, t)),
  });

  const today = habits.data?.[0]?.today ?? localDateOf(new Date().toISOString(), me.timeZone);
  const list = (habits.data ?? []).filter((h) =>
    filter === 'all' ? true : filter === 'shared' ? h.members.length > 1 : h.members.length < 2,
  );

  const onToggle = (habit: HabitView) => {
    if (!habit.checkedToday) haptic.impact('light');
    toggle.mutate({ habit, date: habit.today, checked: !habit.checkedToday });
  };

  const friendPeople = (friends.data ?? []).map((f) => ({ id: f.id, name: f.firstName, photoUrl: f.photoUrl }));
  const menuWide = menuFor?.membership?.cardSize === 'wide';

  return (
    <Screen withTabBar>
      <PageTitle
        kicker={headerDate(today, t.locale)}
        title={t.home.title}
        action={
          <button
            type="button"
            aria-label={t.home.create}
            onClick={() => setCreating(true)}
            className="press mb-1 flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2"
          >
            <Plus size={22} aria-hidden />
          </button>
        }
      />

      <div className="flex gap-2" role="radiogroup" aria-label={t.home.title}>
        {(['all', 'shared', 'mine'] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filter === f}
            onClick={() => setFilter(f)}
            className={`press rounded-2xl px-3.5 py-1.5 text-[14px] font-medium transition-colors duration-150 ${filter === f ? 'bg-ink text-base' : 'bg-surface-2 text-ink-2'}`}
          >
            {t.home[f]}
          </button>
        ))}
      </div>

      {habits.isPending ? (
        <Loading />
      ) : habits.isError ? (
        <ErrorState onRetry={() => habits.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          title={filter === 'all' ? t.home.emptyTitle : undefined}
          text={filter === 'all' ? t.home.emptyText : t.home.emptyFiltered}
          action={
            filter === 'all' && (
              <button type="button" onClick={() => setCreating(true)} className="press mt-2 rounded-2xl bg-ink px-4 py-2.5 text-[15px] font-semibold text-base">
                {t.home.create}
              </button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {list.map((h) => (
            <HabitCard
              key={h.id}
              habit={h}
              wide={h.membership?.cardSize === 'wide'}
              onOpen={() => nav.push({ name: 'habit', id: h.id })}
              onToggle={() => onToggle(h)}
              onLongPress={() => menu.show(h)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => nav.push({ name: 'invite', habitId: null })}
        className="press flex items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-3 text-left"
      >
        <Send size={18} className="text-ink-2" aria-hidden />
        <span className="flex-1 text-[15px] text-ink-2">{t.home.invite}</span>
        {friendPeople.length > 0 && <AvatarStack people={friendPeople} size={26} />}
      </button>

      <ActionSheet
        open={menu.open}
        onClose={menu.close}
        title={menuFor?.title}
        actions={
          menuFor
            ? [
                { label: menuWide ? t.home.normal : t.home.wide, onSelect: () => resize.mutate({ id: menuFor.id, wide: !menuWide }) },
                { label: t.common.open, onSelect: () => nav.push({ name: 'habit', id: menuFor.id }) },
              ]
            : []
        }
      />
      <HabitEditor open={creating} onClose={() => setCreating(false)} />
    </Screen>
  );
}
