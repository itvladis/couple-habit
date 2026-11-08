import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Avatar } from '../components/Avatar';
import { SectionLabel } from '../components/Group';
import { cardStyle } from '../components/HabitCard';
import { HABIT_COLORS, HABIT_ICONS, HabitIcon, habitColor } from '../components/HabitIcon';
import { Segmented } from '../components/Segmented';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { api, type Frequency, type HabitInput, type HabitView, type Reminder } from '../lib/api';
import { errorText } from '../lib/errors';
import { frequencyLabel } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { invalidateHabits, useFriends } from '../lib/queries';
import { haptic } from '../lib/telegram';

const MAX_TITLE = 40;
const MAX_TIMES = 6;

type FreqType = Frequency['type'];
type ReminderMode = 'exact' | 'window' | 'off';

interface Draft {
  title: string;
  icon: string;
  color: string;
  freqType: FreqType;
  days: number[];
  times: number;
  completionMode: 'all' | 'any';
  visibility: 'friends' | 'private';
  reminderMode: ReminderMode;
  at: string;
  from: string;
  to: string;
  invitees: number[];
}

const emptyDraft = (): Draft => ({
  title: '',
  icon: 'zap',
  color: 'coral',
  freqType: 'daily',
  days: [1, 3, 5],
  times: 3,
  completionMode: 'all',
  visibility: 'friends',
  reminderMode: 'off',
  at: '07:30',
  from: '18:00',
  to: '21:00',
  invitees: [],
});

const fromHabit = (h: HabitView): Draft => ({
  ...emptyDraft(),
  title: h.title,
  icon: h.icon,
  color: h.color,
  freqType: h.frequency.type,
  days: h.frequency.type === 'weekdays' ? [...h.frequency.days] : [1, 3, 5],
  times: h.frequency.type === 'weekly' ? h.frequency.times : 3,
  completionMode: h.completionMode,
  visibility: h.visibility,
});

export function toFrequency(d: Pick<Draft, 'freqType' | 'days' | 'times'>): Frequency {
  if (d.freqType === 'weekdays') return { type: 'weekdays', days: [...d.days].sort((a, b) => a - b) };
  if (d.freqType === 'weekly') return { type: 'weekly', times: d.times };
  return { type: 'daily' };
}

export function toReminder(d: Pick<Draft, 'reminderMode' | 'at' | 'from' | 'to'>): Reminder | null {
  if (d.reminderMode === 'exact') return { type: 'exact', time: d.at };
  if (d.reminderMode === 'window') return { type: 'window', from: d.from, to: d.to };
  return null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Edit mode (owner only); create mode when absent. */
  habit?: HabitView;
}

/**
 * Each opening gets a fresh form: the inner sheet is keyed by the opening, so a background
 * refetch of `habit` never wipes what the user is typing.
 */
export function HabitEditor(props: Props) {
  const [opening, setOpening] = useState(0);
  const [wasOpen, setWasOpen] = useState(props.open);
  if (props.open !== wasOpen) {
    setWasOpen(props.open);
    if (props.open) setOpening((n) => n + 1);
  }
  return <HabitEditorSheet key={opening} {...props} />;
}

function HabitEditorSheet({ open, onClose, habit }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const client = useQueryClient();
  const friends = useFriends();
  const [draft, setDraft] = useState<Draft>(() => (habit ? fromHabit(habit) : emptyDraft()));
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const shared = habit ? habit.members.length > 1 : draft.invitees.length > 0;
  const windowInvalid = draft.reminderMode === 'window' && draft.from >= draft.to;
  const valid = draft.title.trim().length > 0 && (draft.freqType !== 'weekdays' || draft.days.length > 0) && !windowInvalid;

  const save = useMutation({
    mutationFn: async () => {
      const input: HabitInput = {
        title: draft.title.trim(),
        icon: draft.icon,
        color: draft.color,
        frequency: toFrequency(draft),
        completionMode: draft.completionMode,
        visibility: draft.visibility,
      };
      if (habit) return api.updateHabit(habit.id, input);
      const created = await api.createHabit(input);
      const reminder = toReminder(draft);
      // The habit exists from here on; follow-up failures are reported but do not undo it.
      const followUps = await Promise.allSettled([
        reminder ? api.updateMembership(created.id, { reminder }) : Promise.resolve(),
        ...draft.invitees.map((id) => api.inviteFriend(created.id, id)),
      ]);
      const failed = followUps.find((r) => r.status === 'rejected');
      if (failed) toast(errorText(failed.reason, t));
      return created;
    },
    onSuccess: (view) => {
      haptic.success();
      invalidateHabits(client);
      onClose();
    },
    onError: (error) => {
      haptic.error();
      toast(errorText(error, t));
    },
  });

  const archive = useMutation({
    mutationFn: () => api.archive(habit!.id),
    onSuccess: () => {
      invalidateHabits(client);
      onClose();
    },
    onError: (error) => toast(errorText(error, t)),
  });

  const previewHabit = {
    frequency: toFrequency(draft),
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={habit ? t.sheet.editTitle : t.sheet.newTitle}
      left={
        <button type="button" onClick={onClose} className="press text-[16px] text-ink-2">
          {t.common.cancel}
        </button>
      }
      right={
        <button
          type="button"
          disabled={!valid || save.isPending}
          onClick={() => save.mutate()}
          className="press text-[16px] font-semibold disabled:opacity-40"
          style={{ color: habitColor(draft.color) }}
        >
          {habit ? t.common.save : t.sheet.create}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Live preview of the home card */}
        <div style={cardStyle(draft.color)} className="flex min-h-[112px] flex-col rounded-[24px] border border-line p-4" aria-hidden>
          <span className="text-hc">
            <HabitIcon name={draft.icon} />
          </span>
          <p className="mt-2 line-clamp-2 text-[17px] font-semibold break-words text-hc">{draft.title.trim() || t.sheet.preview}</p>
          <p className="text-[13px] text-ink-2">
            {frequencyLabel(previewHabit.frequency, t)}
            {shared ? ` · ${draft.completionMode === 'all' ? t.freq.all : t.freq.any}` : ''}
          </p>
        </div>

        <label className="flex items-center gap-1 rounded-[14px] bg-surface-2 px-4 py-3">
          <span className="sr-only">{t.sheet.name}</span>
          <input
            value={draft.title}
            maxLength={MAX_TITLE}
            onChange={(e) => set('title', e.target.value)}
            placeholder={t.sheet.namePlaceholder}
            enterKeyHint="done"
            className="w-full bg-transparent text-[16px] outline-none placeholder:text-ink-3"
            style={{ caretColor: habitColor(draft.color) }}
          />
        </label>

        <Field label={t.sheet.icon}>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {Object.keys(HABIT_ICONS).map((name) => {
              const on = draft.icon === name;
              return (
                <button
                  key={name}
                  type="button"
                  aria-label={name}
                  aria-pressed={on}
                  onClick={() => set('icon', name)}
                  className="press flex size-[42px] shrink-0 items-center justify-center rounded-full"
                  style={{
                    color: on ? habitColor(draft.color) : 'var(--ink-2)',
                    background: on ? `color-mix(in srgb, ${habitColor(draft.color)} 18%, transparent)` : 'var(--surface-2)',
                    boxShadow: on ? `inset 0 0 0 1.5px ${habitColor(draft.color)}` : 'none',
                  }}
                >
                  <HabitIcon name={name} size={19} />
                </button>
              );
            })}
          </div>
        </Field>

        <Field label={t.sheet.color}>
          <div className="flex justify-between">
            {HABIT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={draft.color === c}
                onClick={() => set('color', c)}
                className="press flex size-[38px] items-center justify-center rounded-full"
                style={{ boxShadow: draft.color === c ? `inset 0 0 0 2px ${habitColor(c)}` : 'none' }}
              >
                <span className="size-7 rounded-full" style={{ background: habitColor(c) }} />
              </button>
            ))}
          </div>
        </Field>

        <Field label={t.sheet.frequency}>
          <Segmented
            label={t.sheet.frequency}
            value={draft.freqType}
            onChange={(v) => set('freqType', v)}
            options={[
              { value: 'daily', label: t.sheet.daily },
              { value: 'weekly', label: t.sheet.nPerWeek },
              { value: 'weekdays', label: t.sheet.weekdays },
            ]}
          />
          {draft.freqType === 'weekdays' && (
            <div className="flex gap-1.5">
              {t.freq.days.map((name, i) => {
                const day = i + 1;
                const on = draft.days.includes(day);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('days', on ? draft.days.filter((d) => d !== day) : [...draft.days, day])}
                    className="press flex-1 rounded-[10px] py-[9px] text-[13px] font-semibold"
                    style={{
                      color: on ? habitColor(draft.color) : 'var(--ink-2)',
                      background: on ? `color-mix(in srgb, ${habitColor(draft.color)} 18%, transparent)` : 'var(--surface-2)',
                    }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
          {draft.freqType === 'weekly' && (
            <div className="flex items-center justify-between rounded-[14px] bg-surface-2 px-4 py-2">
              <span className="text-[16px]">{t.sheet.timesPerWeek}</span>
              <span className="flex items-center gap-3">
                <Stepper label="−" disabled={draft.times <= 1} onClick={() => set('times', draft.times - 1)}>
                  <Minus size={16} />
                </Stepper>
                <span className="tabular w-4 text-center text-[17px] font-semibold">{draft.times}</span>
                <Stepper label="+" disabled={draft.times >= MAX_TIMES} onClick={() => set('times', draft.times + 1)}>
                  <Plus size={16} />
                </Stepper>
              </span>
            </div>
          )}
        </Field>

        {!habit && (friends.data?.length ?? 0) > 0 && (
          <Field label={t.sheet.participants}>
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
              {friends.data!.map((f) => {
                const on = draft.invitees.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('invitees', on ? draft.invitees.filter((id) => id !== f.id) : [...draft.invitees, f.id])}
                    className="press flex w-14 shrink-0 flex-col items-center gap-1"
                  >
                    <span className="rounded-full p-0.5" style={{ boxShadow: on ? `0 0 0 2px ${habitColor(draft.color)}` : 'none' }}>
                      <Avatar id={f.id} name={f.firstName} photoUrl={f.photoUrl} size={40} />
                    </span>
                    <span className={`w-full truncate text-center text-[12px] ${on ? 'text-ink' : 'text-ink-2'}`}>{f.firstName}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[13px] text-ink-3">{t.sheet.participantsHint}</p>
          </Field>
        )}

        {shared && (
          <Field label={t.sheet.whenCounts}>
            {(['all', 'any'] as const).map((mode) => {
              const on = draft.completionMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set('completionMode', mode)}
                  className="press flex gap-3 rounded-[14px] px-3.5 py-3 text-left"
                  style={{
                    background: on ? `color-mix(in srgb, ${habitColor(draft.color)} 10%, transparent)` : 'var(--surface-2)',
                    boxShadow: on ? `inset 0 0 0 1.5px ${habitColor(draft.color)}` : 'none',
                  }}
                >
                  <span
                    className="mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full"
                    style={{ boxShadow: `inset 0 0 0 2px ${on ? habitColor(draft.color) : 'var(--ink-3)'}` }}
                  >
                    {on && <span className="size-2.5 rounded-full" style={{ background: habitColor(draft.color) }} />}
                  </span>
                  <span className="flex flex-col gap-[3px]">
                    <span className="text-[15px] font-semibold">{mode === 'all' ? t.sheet.allTitle : t.sheet.anyTitle}</span>
                    <span className="text-[13px] leading-[18px] text-ink-2">{mode === 'all' ? t.sheet.allDesc : t.sheet.anyDesc}</span>
                    <span className="text-[13px] leading-[18px] text-ink-3">{mode === 'all' ? t.sheet.allExample : t.sheet.anyExample}</span>
                  </span>
                </button>
              );
            })}
          </Field>
        )}

        <Field label={t.sheet.visibility}>
          <Segmented
            label={t.sheet.visibility}
            value={draft.visibility}
            onChange={(v) => set('visibility', v)}
            options={[
              { value: 'friends', label: t.sheet.visFriends },
              { value: 'private', label: t.sheet.visPrivate },
            ]}
          />
        </Field>

        {!habit && <ReminderFields draft={draft} set={set} accent={habitColor(draft.color)} invalid={windowInvalid} />}

        {habit && !habit.archived && (
          <button
            type="button"
            onClick={() => archive.mutate()}
            disabled={archive.isPending}
            className="press rounded-[14px] bg-surface-2 py-3 text-[16px] font-medium text-[var(--h-coral)]"
          >
            {t.sheet.archive}
          </button>
        )}
      </div>
    </Sheet>
  );
}

export function ReminderFields({
  draft,
  set,
  accent,
  invalid,
}: {
  draft: Pick<Draft, 'reminderMode' | 'at' | 'from' | 'to'>;
  set: (key: 'reminderMode' | 'at' | 'from' | 'to', value: string) => void;
  accent: string;
  invalid: boolean;
}) {
  const { t } = useI18n();
  return (
    <Field label={t.sheet.reminder}>
      <Segmented
        label={t.sheet.reminder}
        value={draft.reminderMode}
        onChange={(v) => set('reminderMode', v)}
        options={[
          { value: 'exact', label: t.sheet.exact },
          { value: 'window', label: t.sheet.window },
          { value: 'off', label: t.sheet.off },
        ]}
      />
      {draft.reminderMode === 'exact' && (
        <TimeRow label={t.sheet.remindAt} value={draft.at} onChange={(v) => set('at', v)} accent={accent} />
      )}
      {draft.reminderMode === 'window' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <TimeRow label={t.sheet.from} value={draft.from} onChange={(v) => set('from', v)} accent={accent} />
            <TimeRow label={t.sheet.to} value={draft.to} onChange={(v) => set('to', v)} accent={accent} />
          </div>
          <p className={`text-[13px] ${invalid ? 'text-[var(--h-coral)]' : 'text-ink-3'}`}>{t.sheet.windowHint}</p>
        </>
      )}
    </Field>
  );
}

function TimeRow({ label, value, onChange, accent }: { label: string; value: string; onChange: (v: string) => void; accent: string }) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-[14px] bg-surface-2 px-4 py-3">
      <span className="text-[16px]">{label}</span>
      <input
        type="time"
        value={value}
        required
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="tabular bg-transparent text-right text-[16px] font-semibold outline-none"
        style={{ color: accent }}
      />
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>{label}</SectionLabel>
      {children}
    </section>
  );
}

function Stepper({ children, onClick, disabled, label }: { children: ReactNode; onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="press flex size-8 items-center justify-center rounded-full bg-surface disabled:opacity-30"
    >
      {children}
    </button>
  );
}
