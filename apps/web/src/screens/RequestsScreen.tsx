import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '../app/navigation';
import { Avatar } from '../components/Avatar';
import { PageTitle, Screen } from '../components/Screen';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { api, type IncomingRequest } from '../lib/api';
import { errorText } from '../lib/errors';
import { useI18n } from '../lib/i18n';
import { invalidateHabits, qk, useRequests } from '../lib/queries';
import { haptic } from '../lib/telegram';

/** Incoming friend / join / habit-invite requests with inline accept and decline. */
export function RequestList({ requests }: { requests: IncomingRequest[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const client = useQueryClient();
  const answer = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => (accept ? api.approve(id) : api.decline(id)),
    onSuccess: (_d, { accept }) => {
      if (accept) haptic.success();
      void client.invalidateQueries({ queryKey: qk.requests });
      invalidateHabits(client);
    },
    onError: (error) => {
      toast(errorText(error, t));
      void client.invalidateQueries({ queryKey: qk.requests });
    },
  });
  return (
    <>
      {requests.map((r) => {
        const text = r.type === 'friend' ? t.requests.friend : r.type === 'habit_join' ? t.requests.join(r.habit?.title ?? '') : t.requests.invite(r.habit?.title ?? '');
        const busy = answer.isPending && answer.variables?.id === r.id;
        return (
          <div key={r.id} className="flex items-center gap-3 border-b border-line px-3.5 py-3 last:border-b-0">
            <Avatar id={r.from.id} name={r.from.firstName} photoUrl={r.from.photoUrl} size={36} />
            <p className="min-w-0 flex-1 text-[14px] leading-[18px]">
              <span className="font-semibold">{r.from.firstName}</span> <span className="text-ink-2">{text}</span>
            </p>
            <div className="flex shrink-0 gap-1.5">
              <button type="button" disabled={busy} onClick={() => answer.mutate({ id: r.id, accept: false })} className="press rounded-xl bg-surface-2 px-2.5 py-1.5 text-[13px] font-medium text-ink-2 disabled:opacity-50">
                {t.requests.decline}
              </button>
              <button type="button" disabled={busy} onClick={() => answer.mutate({ id: r.id, accept: true })} className="press rounded-xl bg-ink px-2.5 py-1.5 text-[13px] font-semibold text-base disabled:opacity-50">
                {t.requests.accept}
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

export function RequestsScreen() {
  const { t } = useI18n();
  const nav = useNavigation();
  const requests = useRequests();
  return (
    <Screen onBack={nav.canGoBack ? nav.back : undefined}>
      <PageTitle title={t.requests.title} />
      {requests.isPending ? (
        <Loading />
      ) : requests.isError ? (
        <ErrorState onRetry={() => requests.refetch()} />
      ) : requests.data.length === 0 ? (
        <EmptyState text={t.requests.empty} />
      ) : (
        <div className="overflow-hidden rounded-[20px] border border-line bg-surface">
          <RequestList requests={requests.data} />
        </div>
      )}
    </Screen>
  );
}
