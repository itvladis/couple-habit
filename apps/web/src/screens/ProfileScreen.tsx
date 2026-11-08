import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, Bell, Calendar, Clock, Contrast, Globe, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigation } from '../app/navigation';
import { Avatar } from '../components/Avatar';
import { Group, Row, Tile, Toggle } from '../components/Group';
import { Screen } from '../components/Screen';
import { Segmented } from '../components/Segmented';
import { ActionSheet, Sheet, useSheetItem } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { api, type FriendSummary, type Me } from '../lib/api';
import { errorText } from '../lib/errors';
import { useI18n } from '../lib/i18n';
import { qk, useFriends, useHabits, useMe, useRequests, useUpdateMe } from '../lib/queries';
import { RequestList } from './RequestsScreen';

const ALL_ZONES: string[] = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

export function ProfileScreen() {
  const { t } = useI18n();
  const me = useMe();
  const nav = useNavigation();
  const toast = useToast();
  const client = useQueryClient();
  const habits = useHabits();
  const archived = useHabits(true);
  const friends = useFriends();
  const requests = useRequests();
  const update = useUpdateMe();
  const [sheet, setSheet] = useState<'theme' | 'language' | 'weekly' | null>(null);
  const friendSheet = useSheetItem<FriendSummary>();
  const friend = friendSheet.item;

  const removeFriend = useMutation({
    mutationFn: (id: number) => api.removeFriend(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.friends });
      void client.invalidateQueries({ queryKey: qk.feed });
    },
    onError: (error) => toast(errorText(error, t)),
  });

  // useUpdateMe applies the change instantly and reports failures itself.
  const save = (patch: Parameters<typeof api.updateMe>[0]) => update.mutate(patch);
  const best = Math.max(0, ...(habits.data ?? []).map((h) => h.streak.best));
  const themeLabel = { auto: t.profile.themeAuto, dark: t.profile.themeDark, light: t.profile.themeLight }[me.theme];
  const languageLabel = me.languageSetting === null ? t.profile.languageAuto : me.languageSetting === 'ru' ? 'Русский' : 'English';
  const weeklyLabel = me.weeklySummary.enabled ? `${t.freq.days[me.weeklySummary.weekday - 1]}, ${me.weeklySummary.time}` : t.profile.weeklyOff;
  const zones = useMemo(() => (ALL_ZONES.includes(me.timeZone) ? ALL_ZONES : [me.timeZone, ...ALL_ZONES]), [me.timeZone]);

  return (
    <Screen withTabBar>
      <header className="flex flex-col items-center gap-1.5 pt-2 text-center">
        <Avatar id={me.id} name={me.firstName} photoUrl={me.photoUrl} size={72} />
        <h1 className="text-[22px] font-bold tracking-[-0.01em]">{me.firstName}</h1>
        <p className="text-[14px] text-ink-2">{t.profile.summary(habits.data?.length ?? 0, friends.data?.length ?? 0, best)}</p>
      </header>

      {(requests.data?.length ?? 0) > 0 && (
        <Group label={t.profile.requests}>
          <RequestList requests={requests.data!} />
        </Group>
      )}

      <Group label={t.profile.friends}>
        {(friends.data ?? []).map((f) => (
          <Row key={f.id} lead={<Avatar id={f.id} name={f.firstName} photoUrl={f.photoUrl} size={30} />} title={f.firstName} value={t.profile.shared(f.sharedHabits)} onClick={() => friendSheet.show(f)} />
        ))}
        <Row
          lead={
            <span className="flex size-[30px] items-center justify-center rounded-full text-[var(--h-mint)]" style={{ background: 'color-mix(in srgb, var(--h-mint) 16%, transparent)' }}>
              <Send size={15} aria-hidden />
            </span>
          }
          title={t.profile.invite}
          accent="var(--h-mint)"
          chevron={false}
          onClick={() => nav.push({ name: 'invite', habitId: null })}
        />
      </Group>

      <Group label={t.profile.settings}>
        <Row lead={<Tile color="var(--h-lavender)"><Contrast size={17} /></Tile>} title={t.profile.theme} value={themeLabel} onClick={() => setSheet('theme')} />
        <Row lead={<Tile color="var(--h-sky)"><Globe size={17} /></Tile>} title={t.profile.language} value={languageLabel} onClick={() => setSheet('language')} />
        <Row
          lead={<Tile color="var(--h-peach)"><Clock size={17} /></Tile>}
          title={t.profile.timezone}
          chevron={false}
          trailing={
            <select
              aria-label={t.profile.timezone}
              value={me.timeZone}
              onChange={(e) => save({ timeZone: e.target.value })}
              className="max-w-[45%] truncate bg-transparent text-right text-[15px] text-ink-2 outline-none"
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          }
        />
        <Row
          lead={<Tile color="var(--h-coral)"><Bell size={17} /></Tile>}
          title={t.profile.reminders}
          chevron={false}
          trailing={<Toggle on={me.remindersEnabled} onChange={(on) => save({ remindersEnabled: on })} label={t.profile.reminders} />}
        />
        <Row lead={<Tile color="var(--h-green)"><Calendar size={17} /></Tile>} title={t.profile.weekly} value={weeklyLabel} onClick={() => setSheet('weekly')} />
      </Group>

      <Group>
        <Row lead={<Tile color="var(--h-gold)"><Archive size={17} /></Tile>} title={t.profile.archive} value={String(archived.data?.length ?? 0)} onClick={() => nav.push({ name: 'archive' })} />
      </Group>

      <Sheet open={sheet === 'theme'} onClose={() => setSheet(null)} title={t.profile.theme}>
        <Segmented
          label={t.profile.theme}
          value={me.theme}
          onChange={(theme) => save({ theme })}
          options={[
            { value: 'auto', label: t.profile.themeAuto },
            { value: 'dark', label: t.profile.themeDark },
            { value: 'light', label: t.profile.themeLight },
          ]}
        />
      </Sheet>
      <Sheet open={sheet === 'language'} onClose={() => setSheet(null)} title={t.profile.language}>
        <Segmented
          label={t.profile.language}
          value={me.languageSetting ?? 'auto'}
          onChange={(v) => save({ language: v === 'auto' ? null : v })}
          options={[
            { value: 'auto', label: t.profile.languageAuto },
            { value: 'ru', label: 'Русский' },
            { value: 'en', label: 'English' },
          ]}
        />
      </Sheet>
      <WeeklySheet open={sheet === 'weekly'} onClose={() => setSheet(null)} me={me} onSave={(weeklySummary) => save({ weeklySummary })} />
      <ActionSheet
        open={friendSheet.open}
        onClose={friendSheet.close}
        title={friend ? <span className="block px-2 text-[14px] font-normal text-ink-2">{t.profile.removeFriendConfirm(friend.firstName)}</span> : undefined}
        actions={friend ? [{ label: t.profile.removeFriend, destructive: true, onSelect: () => removeFriend.mutate(friend.id) }] : []}
      />
    </Screen>
  );
}

function WeeklySheet({ open, onClose, me, onSave }: { open: boolean; onClose: () => void; me: Me; onSave: (v: Me['weeklySummary']) => void }) {
  const { t } = useI18n();
  const settings = me.weeklySummary;
  const [time, setTime] = useState(settings.time);
  return (
    <Sheet open={open} onClose={onClose} title={t.profile.weekly}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-[14px] bg-surface-2 px-4 py-3">
          <span className="text-[16px]">{t.profile.weekly}</span>
          <Toggle on={settings.enabled} onChange={(enabled) => onSave({ ...settings, enabled })} label={t.profile.weekly} />
        </div>
        <div className={`flex flex-col gap-3 transition-opacity duration-200 ${settings.enabled ? '' : 'pointer-events-none opacity-40'}`}>
          <div className="flex gap-1.5" role="radiogroup" aria-label={t.profile.weeklyDay}>
            {t.freq.days.map((name, i) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={settings.weekday === i + 1}
                onClick={() => onSave({ ...settings, weekday: i + 1 })}
                className={`press flex-1 rounded-[10px] py-[9px] text-[13px] font-semibold ${settings.weekday === i + 1 ? 'bg-ink text-base' : 'bg-surface-2 text-ink-2'}`}
              >
                {name}
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between rounded-[14px] bg-surface-2 px-4 py-3">
            <span className="text-[16px]">{t.profile.weeklyTime}</span>
            <input
              type="time"
              value={time}
              onChange={(e) => e.target.value && setTime(e.target.value)}
              // iOS fires change on every wheel tick; one request when the picker closes.
              onBlur={() => time !== settings.time && onSave({ ...settings, time })}
              className="tabular bg-transparent text-right text-[16px] font-semibold outline-none"
            />
          </label>
        </div>
      </div>
    </Sheet>
  );
}
