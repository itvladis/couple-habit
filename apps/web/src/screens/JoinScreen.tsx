import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '../app/navigation';
import { habitColor } from '../components/HabitIcon';
import { InviteHero } from '../components/InviteHero';
import { Screen } from '../components/Screen';
import { Loading } from '../components/States';
import { api, ApiError, type InvitePreview, type JoinOutcome } from '../lib/api';
import { frequencyLabel } from '../lib/format';
import { errorText } from '../lib/errors';
import { useI18n, type Dict } from '../lib/i18n';
import { invalidateHabits, qk, useInvitePreview } from '../lib/queries';
import { haptic } from '../lib/telegram';

type State = InvitePreview['state'] | JoinOutcome['status'];

function statusText(state: State, inviter: string, t: Dict): string | null {
  switch (state) {
    case 'can_join':
      return null;
    case 'requested':
      return t.join.requested(inviter);
    default:
      return t.join[state];
  }
}

/** Opened from a startapp invite link: shows who invites and to what, and joins only on tap. */
export function JoinScreen({ token }: { token: string }) {
  const { t } = useI18n();
  const nav = useNavigation();
  const client = useQueryClient();
  const preview = useInvitePreview(token);
  const join = useMutation({
    mutationFn: () => api.join(token),
    onSuccess: (outcome) => {
      if (outcome.status === 'requested') haptic.success();
      // After a successful request the link now reads as "already requested" for this user.
      const state: InvitePreview['state'] = outcome.status === 'requested' ? 'already_requested' : outcome.status;
      client.setQueryData<InvitePreview>(qk.invite(token), (p) => (p ? { ...p, state } : p));
      invalidateHabits(client);
    },
  });

  const leave = () => (nav.canGoBack ? nav.back() : nav.switchTab('home'));

  if (preview.isPending) return <Screen onBack={leave}><Loading /></Screen>;
  if (preview.isError) {
    const invalid = preview.error instanceof ApiError && preview.error.status === 404;
    return (
      <Screen onBack={leave}>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="max-w-[300px] text-[16px] text-ink-2">{invalid ? t.join.invalid : t.common.error}</p>
          <button type="button" onClick={() => nav.switchTab('home')} className="press rounded-2xl bg-surface-2 px-4 py-2.5 text-[15px] font-semibold">
            {t.join.toHome}
          </button>
        </div>
      </Screen>
    );
  }

  const p = preview.data;
  const state: State = join.data?.status ?? p.state;
  const h = p.habit;
  const color = h?.color ?? 'mint';
  const people = h ? h.members.map((m, i) => ({ id: i + 1, name: m.firstName, photoUrl: m.photoUrl })) : [{ id: 1, name: p.inviter.firstName, photoUrl: p.inviter.photoUrl }];
  const message = statusText(state, p.inviter.firstName, t);

  return (
    <Screen onBack={leave}>
      <InviteHero color={color} icon={h?.icon ?? null} people={people} />
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-[13px] font-semibold tracking-[0.06em] text-ink-2">{t.invite.kicker}</p>
        <h1 className="text-[22px] leading-7 font-bold tracking-[-0.02em]">{h ? t.join.habitTitle(p.inviter.firstName) : t.join.friendTitle(p.inviter.firstName)}</h1>
        {h && (
          <>
            <p className="text-[24px] leading-8 font-bold tracking-[-0.02em] break-words" style={{ color: habitColor(color) }}>{h.title}</p>
            <p className="text-[15px] text-ink-2">
              {frequencyLabel(h.frequency, t)} · {h.completionMode === 'all' ? t.freq.all : t.freq.any}
            </p>
            <p className="max-w-[320px] text-[15px] leading-[21px] text-ink-2">{h.completionMode === 'all' ? t.invite.allSub : t.invite.anySub}</p>
          </>
        )}
      </div>

      <div className="mt-auto flex flex-col items-center gap-3 pt-4" aria-live="polite">
        {message && <p className="max-w-[320px] text-center text-[15px] font-medium">{message}</p>}
        {join.isError && (
          <p className="text-[14px] text-[var(--h-coral)]">
            {join.error instanceof ApiError && join.error.status === 404 ? t.join.invalid : errorText(join.error, t)}
          </p>
        )}
        {state === 'can_join' && (
          <button
            type="button"
            disabled={join.isPending}
            onClick={() => join.mutate()}
            className="press w-full rounded-2xl bg-ink py-4 text-[16px] font-semibold text-base disabled:opacity-60"
          >
            {h ? t.join.join : t.join.addFriend}
          </button>
        )}
        {state === 'already_member' && h && (
          <button type="button" onClick={() => nav.push({ name: 'habit', id: h.id })} className="press w-full rounded-2xl bg-ink py-4 text-[16px] font-semibold text-base">
            {t.join.openHabit}
          </button>
        )}
        {state !== 'can_join' && (
          <button type="button" onClick={() => nav.switchTab('home')} className="press w-full rounded-2xl bg-surface-2 py-4 text-[16px] font-semibold">
            {t.join.toHome}
          </button>
        )}
      </div>
    </Screen>
  );
}
