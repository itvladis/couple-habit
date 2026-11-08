import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '../app/navigation';
import { HabitIcon, habitColor } from '../components/HabitIcon';
import { PageTitle, Screen } from '../components/Screen';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { habitSubtitle } from '../lib/format';
import { errorText } from '../lib/errors';
import { useI18n } from '../lib/i18n';
import { invalidateHabits, useHabits } from '../lib/queries';

export function ArchiveScreen() {
  const { t } = useI18n();
  const nav = useNavigation();
  const toast = useToast();
  const client = useQueryClient();
  const habits = useHabits(true);
  const restore = useMutation({
    mutationFn: (id: string) => api.unarchive(id),
    onSuccess: (_d, id) => invalidateHabits(client),
    onError: (error) => toast(errorText(error, t)),
  });
  return (
    <Screen onBack={nav.back}>
      <PageTitle title={t.archive.title} />
      {habits.isPending ? (
        <Loading />
      ) : habits.isError ? (
        <ErrorState onRetry={() => habits.refetch()} />
      ) : habits.data.length === 0 ? (
        <EmptyState text={t.archive.empty} />
      ) : (
        <ul className="overflow-hidden rounded-[20px] border border-line bg-surface">
          {habits.data.map((h) => (
            <li key={h.id} className="flex items-center gap-3 border-b border-line px-3.5 py-3 last:border-b-0">
              <button type="button" onClick={() => nav.push({ name: 'habit', id: h.id })} className="press flex min-w-0 flex-1 items-center gap-3 text-left">
                <span style={{ color: habitColor(h.color) }}>
                  <HabitIcon name={h.icon} size={22} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-medium">{h.title}</span>
                  <span className="block truncate text-[13px] text-ink-2">{habitSubtitle(h, t)}</span>
                </span>
              </button>
              {h.isOwner && (
                <button
                  type="button"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(h.id)}
                  className="press rounded-xl bg-surface-2 px-3 py-1.5 text-[14px] font-semibold disabled:opacity-50"
                >
                  {t.archive.restore}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
