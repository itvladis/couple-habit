import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, ChevronRight, Crown, Flame, Pencil, Send } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { useNavigation } from '../app/navigation';
import { Avatar } from '../components/Avatar';
import { CheckButton } from '../components/CheckButton';
import { Toggle } from '../components/Group';
import { HabitIcon, habitColor } from '../components/HabitIcon';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { ActionSheet, Sheet, useSheetItem, type SheetAction } from '../components/Sheet';
import { ErrorState, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { MAX_BACKFILL_DAYS, addDays } from '@habit/core/dates';
import { api, ApiError, type HabitView, type Reminder } from '../lib/api';
import { errorText } from '../lib/errors';
import { dayMonth, habitSubtitle, heatmapLayout, shortMonth, type HeatmapPeriod } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { invalidateHabits, qk, useCheckDates, useHabit, useMe, useToggleCheck } from '../lib/queries';
import { haptic } from '../lib/telegram';
import { HabitEditor, ReminderFields, toReminder } from './HabitEditor';

export function HabitScreen({ id }: { id: string }) {
  const { t } = useI18n();
  const nav = useNavigation();
  const me = useMe();
  const habit = useHabit(id);
  const toggle = useToggleCheck(me.id);
  const [editing, setEditing] = useState(false);

  if (habit.isPending) return <Screen onBack={nav.back}><Loading /></Screen>;
  if (habit.isError) {
    const gone = habit.error instanceof ApiError && habit.error.status === 404;
    return (
      <Screen onBack={nav.back}>
        <ErrorState message={gone ? t.habit.notFound : undefined} onRetry={gone ? undefined : () => habit.refetch()} />
      </Screen>
    );
  }
  const h = habit.data;
  const member = h.membership !== null;
  const accent = habitColor(h.color);

  return (
    <Screen onBack={nav.back}>
      <div style={{ '--hc': accent } as CSSProperties} className="flex flex-col gap-5">
        <header className="flex items-center gap-3.5">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-[18px] text-hc" style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)` }}>
            <HabitIcon name={h.icon} size={28} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="line-clamp-2 text-[26px] leading-8 font-bold tracking-[-0.02em] break-words text-hc">{h.title}</h1>
            <p className="truncate text-[15px] text-ink-2">{h.archived ? t.habit.archived : habitSubtitle(h, t)}</p>
          </div>
          {h.isOwner && (
            <button type="button" aria-label={t.sheet.editTitle} onClick={() => setEditing(true)} className="press flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
              <Pencil size={16} aria-hidden />
            </button>
          )}
          {member && !h.archived && (
            <CheckButton
              checked={h.checkedToday}
              size={40}
              label={h.checkedToday ? t.habit.checkedToday : t.habit.notCheckedToday}
              onToggle={() => {
                if (!h.checkedToday) haptic.impact('light');
                toggle.mutate({ habit: h, date: h.today, checked: !h.checkedToday });
              }}
            />
          )}
        </header>

        <Stats habit={h} />
        <Heatmap habit={h} canMark={member && !h.archived} onMark={(date, checked) => toggle.mutate({ habit: h, date, checked })} />
        <Members habit={h} viewerId={me.id} />
        {member && <MembershipSection habit={h} />}
      </div>
      {h.isOwner && <HabitEditor open={editing} onClose={() => setEditing(false)} habit={h} />}
    </Screen>
  );
}

function Stats({ habit }: { habit: HabitView }) {
  const { t } = useI18n();
  const rate = habit.stats.completionRate;
  const items = [
    { value: habit.streak.current, label: habit.streak.unit === 'week' ? t.habit.streakWeeks : t.habit.streakDays, flame: true },
    { value: habit.stats.totalDone, label: t.habit.total, flame: false },
    { value: rate === null ? '—' : `${Math.round(rate * 100)}%`, label: t.habit.rate, flame: false },
  ];
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {items.map((s) => (
        <div key={s.label} className="flex flex-col gap-0.5 rounded-[20px] border border-line bg-surface p-3.5">
          <span className="tabular flex items-center gap-1 text-[24px] font-bold tracking-[-0.02em]">
            {s.value}
            {s.flame && <Flame size={16} className="text-hc" aria-hidden />}
          </span>
          <span className="truncate text-[13px] font-medium text-ink-2">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function Heatmap({ habit, canMark, onMark }: { habit: HabitView; canMark: boolean; onMark: (date: string, checked: boolean) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [period, setPeriod] = useState<HeatmapPeriod>('halfYear');
  const layout = heatmapLayout(habit.today, period);
  const checks = useCheckDates(habit.id, layout.from, layout.to);
  const done = new Set(checks.data?.done ?? []);
  const mine = new Set(checks.data?.mine ?? []);
  // Same limit as the server: older days cannot be checked.
  const oldest = addDays(habit.today, -MAX_BACKFILL_DAYS);
  const gap = period === 'year' ? 2 : 3;

  const mark = (date: string) => {
    if (!canMark || date < oldest) return;
    const checked = !mine.has(date);
    haptic.impact('light');
    onMark(date, checked);
    toast(`${checked ? '✓' : '✕'} ${dayMonth(date, t.locale)}`);
  };

  return (
    <section className="flex flex-col gap-2.5 rounded-[24px] border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold">{t.habit.history}</h2>
        <Segmented
          size="sm"
          label={t.habit.history}
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'month', label: t.habit.month },
            { value: 'halfYear', label: t.habit.halfYear },
            { value: 'year', label: t.habit.year },
          ]}
        />
      </div>
      <div className="relative h-4 text-[11px] font-medium text-ink-3" aria-hidden>
        {layout.monthStarts.map((m) => (
          <span key={m.date} className="absolute" style={{ left: `${(m.column / layout.weeks.length) * 100}%` }}>
            {shortMonth(m.date, t.locale)}
          </span>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${layout.weeks.length}, minmax(0, 1fr))`, gap }}>
        {layout.weeks.map((week, column) => (
          <div key={column} className="grid" style={{ gap }}>
            {week.map((date, row) =>
              date === null ? (
                <span key={row} className="aspect-square rounded-[2.5px]" style={{ background: 'color-mix(in srgb, var(--hc) 5%, transparent)' }} />
              ) : (
                <button
                  key={date}
                  type="button"
                  disabled={!canMark}
                  aria-label={`${dayMonth(date, t.locale)}${done.has(date) ? ' ✓' : ''}`}
                  aria-pressed={mine.has(date)}
                  onClick={() => mark(date)}
                  className="aspect-square rounded-[2.5px] transition-colors duration-200"
                  style={{
                    background: done.has(date)
                      ? 'var(--hc)'
                      : mine.has(date)
                        ? 'color-mix(in srgb, var(--hc) 45%, transparent)'
                        : 'color-mix(in srgb, var(--hc) 12%, transparent)',
                    boxShadow: date === habit.today && !done.has(date) ? 'inset 0 0 0 1.5px var(--hc)' : 'none',
                  }}
                />
              ),
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 text-[13px]">
        <span className="text-ink-2">{t.habit.doneInPeriod(done.size)}</span>
        <span className="font-medium text-hc">{t.habit.best(habit.streak.best, habit.streak.unit === 'week')}</span>
      </div>
    </section>
  );
}

function Members({ habit, viewerId }: { habit: HabitView; viewerId: number }) {
  const { t } = useI18n();
  const nav = useNavigation();
  const toast = useToast();
  const client = useQueryClient();
  const memberSheet = useSheetItem<HabitView['members'][number]>();
  const selected = memberSheet.item;
  const act = useMutation({
    mutationFn: async ({ kind, userId }: { kind: 'owner' | 'remove'; userId: number }): Promise<void> => {
      if (kind === 'owner') await api.transfer(habit.id, userId);
      else await api.removeMember(habit.id, userId);
    },
    onSuccess: () => invalidateHabits(client),
    onError: (error) => toast(errorText(error, t)),
  });
  const actions: SheetAction[] = selected
    ? [
        { label: t.habit.makeOwner, icon: <Crown size={18} aria-hidden />, onSelect: () => act.mutate({ kind: 'owner', userId: selected.userId }) },
        { label: t.habit.remove, destructive: true, onSelect: () => act.mutate({ kind: 'remove', userId: selected.userId }) },
      ]
    : [];

  return (
    <section className="overflow-hidden rounded-[24px] border border-line bg-surface px-4">
      {habit.members.map((m) => {
        const you = m.userId === viewerId;
        const manageable = habit.isOwner && !you && !habit.archived;
        const Tag = manageable ? 'button' : 'div';
        return (
          <Tag
            key={m.userId}
            {...(manageable ? { type: 'button' as const, onClick: () => memberSheet.show(m) } : {})}
            className={`flex w-full items-center gap-3 border-b border-line py-3 text-left ${manageable ? 'press' : ''}`}
          >
            <Avatar id={m.userId} name={m.firstName} photoUrl={m.photoUrl} size={40} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                <span className="truncate">{m.firstName}{you ? ` (${t.common.you})` : ''}</span>
                {m.isOwner && <Crown size={13} className="shrink-0 text-ink-3" aria-label={t.habit.owner} />}
              </span>
              <span className="block truncate text-[13px] text-ink-2">{m.checkedToday ? t.habit.checkedToday : t.habit.notCheckedToday}</span>
            </span>
            <span className="flex gap-[3px]" aria-hidden>
              {m.week.map((d, i) => (
                <span key={i} className="size-[7px] rounded-full" style={{ background: d ? 'var(--hc)' : 'color-mix(in srgb, var(--hc) 20%, transparent)' }} />
              ))}
            </span>
          </Tag>
        );
      })}
      {habit.isOwner && !habit.archived ? (
        <button type="button" onClick={() => nav.push({ name: 'invite', habitId: habit.id })} className="press flex w-full items-center gap-2.5 py-3.5 text-[15px] font-medium text-hc">
          <Send size={18} aria-hidden />
          {t.habit.inviteMore}
        </button>
      ) : (
        <div className="-mt-px" />
      )}
      <ActionSheet open={memberSheet.open} onClose={memberSheet.close} title={selected?.firstName} actions={actions} />
    </section>
  );
}

function reminderSummary(reminder: Reminder | null, offLabel: string): string {
  if (!reminder) return offLabel;
  return reminder.type === 'exact' ? reminder.time : `${reminder.from}–${reminder.to}`;
}

function MembershipSection({ habit }: { habit: HabitView }) {
  const { t } = useI18n();
  const nav = useNavigation();
  const toast = useToast();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leave = useMutation({
    mutationFn: () => api.leave(habit.id),
    onSuccess: () => {
      nav.back();
      client.removeQueries({ queryKey: qk.habit(habit.id) });
      client.removeQueries({ queryKey: ['checks', habit.id] });
      invalidateHabits(client);
    },
    onError: (error) => toast(errorText(error, t)),
  });
  const reminder = habit.membership?.reminder ?? null;

  return (
    <>
      <button type="button" onClick={() => setEditing(true)} className="press flex items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-3.5 text-left">
        <Bell size={20} className="text-ink-2" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{t.habit.reminder}</span>
          <span className="block truncate text-[13px] text-ink-2">{reminderSummary(reminder, t.habit.reminderOff)}</span>
        </span>
        <ChevronRight size={18} className="text-ink-3" aria-hidden />
      </button>
      {habit.members.length > 1 && (
        <button type="button" onClick={() => setConfirmLeave(true)} className="press rounded-[14px] py-3 text-[15px] font-medium text-[var(--h-coral)]">
          {t.habit.leave}
        </button>
      )}
      <ReminderSheet open={editing} onClose={() => setEditing(false)} habit={habit} />
      <ActionSheet
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title={<span className="block px-2 text-[14px] font-normal text-ink-2">{t.habit.leaveConfirm}</span>}
        actions={[{ label: t.habit.leave, destructive: true, onSelect: () => leave.mutate() }]}
      />
    </>
  );
}

type ReminderDraft = { reminderMode: 'exact' | 'window' | 'off'; at: string; from: string; to: string };

const draftOf = (r: Reminder | null): ReminderDraft => ({
  reminderMode: r ? r.type : 'off',
  at: r?.type === 'exact' ? r.time : '07:30',
  from: r?.type === 'window' ? r.from : '18:00',
  to: r?.type === 'window' ? r.to : '21:00',
});

function ReminderSheet(props: { open: boolean; onClose: () => void; habit: HabitView }) {
  const [opening, setOpening] = useState(0);
  const [wasOpen, setWasOpen] = useState(props.open);
  if (props.open !== wasOpen) {
    setWasOpen(props.open);
    if (props.open) setOpening((n) => n + 1);
  }
  return <ReminderSheetBody key={opening} {...props} />;
}

function ReminderSheetBody({ open, onClose, habit }: { open: boolean; onClose: () => void; habit: HabitView }) {
  const { t } = useI18n();
  const toast = useToast();
  const client = useQueryClient();
  const [draft, setDraft] = useState<ReminderDraft>(() => draftOf(habit.membership?.reminder ?? null));
  const [notify, setNotify] = useState(habit.membership?.notifyOnCheck ?? true);
  const invalid = draft.reminderMode === 'window' && draft.from >= draft.to;
  const save = useMutation({
    mutationFn: () => api.updateMembership(habit.id, { reminder: toReminder(draft), notifyOnCheck: notify }),
    onSuccess: () => {
      haptic.success();
      invalidateHabits(client);
      onClose();
    },
    onError: (error) => toast(errorText(error, t)),
  });
  const accent = habitColor(habit.color);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.habit.reminder}
      left={<button type="button" onClick={onClose} className="press text-[16px] text-ink-2">{t.common.cancel}</button>}
      right={
        <button type="button" disabled={invalid || save.isPending} onClick={() => save.mutate()} className="press text-[16px] font-semibold disabled:opacity-40" style={{ color: accent }}>
          {t.common.save}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <ReminderFields draft={draft} set={(k, v) => setDraft((d) => ({ ...d, [k]: v }))} accent={accent} invalid={invalid} />
        {habit.members.length > 1 && (
          <div className="flex items-center justify-between gap-3 rounded-[14px] bg-surface-2 px-4 py-3">
            <span className="text-[16px]">{t.sheet.notify}</span>
            <Toggle on={notify} onChange={setNotify} label={t.sheet.notify} />
          </div>
        )}
      </div>
    </Sheet>
  );
}
