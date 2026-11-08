import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, RefreshCw, Send } from 'lucide-react';
import { useState } from 'react';
import { useNavigation } from '../app/navigation';
import { Avatar } from '../components/Avatar';
import { Group } from '../components/Group';
import { habitColor } from '../components/HabitIcon';
import { InviteHero } from '../components/InviteHero';
import { Screen } from '../components/Screen';
import { ErrorState, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { qk, useFriends, useHabit, useInviteLink, useMe } from '../lib/queries';
import { errorText } from '../lib/errors';
import { copyText, haptic, shareLink } from '../lib/telegram';

/** Share a friend link (habitId null) or a habit link, plus direct invites for existing friends. */
export function InviteScreen({ habitId }: { habitId: string | null }) {
  const { t } = useI18n();
  const nav = useNavigation();
  const me = useMe();
  const toast = useToast();
  const client = useQueryClient();
  const link = useInviteLink(habitId);
  const habit = useHabit(habitId);
  const friends = useFriends();
  const [invited, setInvited] = useState<number[]>([]);

  const reset = useMutation({
    mutationFn: () => api.resetInviteLink(habitId),
    onSuccess: (fresh) => client.setQueryData(qk.inviteLink(habitId), fresh),
    onError: (error) => toast(errorText(error, t)),
  });
  const callFriend = useMutation({
    mutationFn: (userId: number) => api.inviteFriend(habitId!, userId),
    onSuccess: (_d, userId) => {
      haptic.success();
      setInvited((ids) => [...ids, userId]);
    },
    onError: (error) => toast(errorText(error, t)),
  });

  const h = habitId ? habit.data : undefined;
  if (link.isPending || (habitId && habit.isPending)) return <Screen onBack={nav.back}><Loading /></Screen>;
  if (link.isError) return <Screen onBack={nav.back}><ErrorState onRetry={() => link.refetch()} /></Screen>;

  const color = h?.color ?? 'mint';
  const people = h
    ? h.members.map((m) => ({ id: m.userId, name: m.firstName, photoUrl: m.photoUrl }))
    : [{ id: me.id, name: me.firstName, photoUrl: me.photoUrl }];
  const memberIds = new Set(h?.members.map((m) => m.userId) ?? []);
  const candidates = habitId ? (friends.data ?? []).filter((f) => !memberIds.has(f.id)) : [];

  const copy = async () => {
    if (await copyText(link.data.url)) {
      haptic.success();
      toast(t.invite.copied);
    } else {
      toast(t.errors.unknown);
    }
  };
  const share = () => shareLink(link.data.url, t.invite.shareText).catch((error: unknown) => toast(errorText(error, t)));

  return (
    <Screen onBack={nav.back}>
      <InviteHero color={color} icon={h?.icon ?? null} people={people} />
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-[13px] font-semibold tracking-[0.06em] text-ink-2">{t.invite.kicker}</p>
        <h1 className="text-[24px] leading-8 font-bold tracking-[-0.02em]">{t.invite.title}</h1>
        {h && <p className="text-[24px] leading-8 font-bold tracking-[-0.02em] break-words" style={{ color: habitColor(color) }}>{h.title}</p>}
        <p className="max-w-[320px] text-[15px] leading-[21px] text-ink-2">
          {!h ? t.invite.friendSub : h.completionMode === 'all' ? t.invite.allSub : t.invite.anySub}
        </p>
      </div>

      {candidates.length > 0 && (
        <Group label={t.invite.friends}>
          {candidates.map((f) => {
            const done = invited.includes(f.id);
            return (
              <div key={f.id} className="flex items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0">
                <Avatar id={f.id} name={f.firstName} photoUrl={f.photoUrl} size={30} />
                <span className="min-w-0 flex-1 truncate text-[16px]">{f.firstName}</span>
                <button
                  type="button"
                  disabled={done || callFriend.isPending}
                  onClick={() => callFriend.mutate(f.id)}
                  className="press rounded-xl px-3 py-1.5 text-[14px] font-semibold disabled:opacity-60"
                  style={{ color: habitColor(color), background: `color-mix(in srgb, ${habitColor(color)} 14%, transparent)` }}
                >
                  {done ? t.invite.called : t.invite.call}
                </button>
              </div>
            );
          })}
        </Group>
      )}

      <div className="mt-auto flex flex-col gap-2.5 pt-4">
        <button
          type="button"
          onClick={() => void share()}
          className="press flex items-center justify-center gap-2 rounded-2xl bg-ink py-4 text-[16px] font-semibold text-base"
        >
          <Send size={18} aria-hidden />
          {t.invite.send}
        </button>
        <button type="button" onClick={() => void copy()} className="press flex items-center justify-center gap-2 rounded-2xl bg-surface-2 py-4 text-[16px] font-semibold">
          <Link2 size={18} aria-hidden />
          {t.invite.copy}
        </button>
        <button
          type="button"
          disabled={reset.isPending}
          onClick={() => reset.mutate()}
          className="press flex items-center justify-center gap-1.5 py-2 text-[14px] text-ink-3 disabled:opacity-50"
        >
          <RefreshCw size={14} aria-hidden />
          {t.invite.reset}
        </button>
      </div>
    </Screen>
  );
}
