import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useToast } from '../components/Toast';
import { api, ApiError, type HabitView, type Me, type Session } from './api';
import { errorText } from './errors';
import { useI18n } from './i18n';
import { haptic } from './telegram';

export const qk = {
  session: ['session'] as const,
  habits: (archived: boolean) => ['habits', archived] as const,
  habit: (id: string) => ['habit', id] as const,
  checks: (id: string, from: string, to: string) => ['checks', id, from, to] as const,
  feed: ['feed'] as const,
  friends: ['friends'] as const,
  requests: ['requests'] as const,
  inviteLink: (habitId: string | null) => ['invite-link', habitId] as const,
  invite: (token: string) => ['invite', token] as const,
};

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Started once per app launch: refreshes the profile, reports the time zone, resolves deep links. */
export const useSession = () =>
  useQuery({ queryKey: qk.session, queryFn: () => api.session(browserTimeZone()), staleTime: Infinity, retry: 1 });

export function useMe(): Me {
  const { data } = useSession();
  if (!data) throw new Error('useMe() before the session loaded');
  return data.user;
}

type MePatch = Parameters<typeof api.updateMe>[0];

/** Settings apply instantly; the server answer replaces the guess, an error rolls it back. */
export function useUpdateMe() {
  const client = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationFn: api.updateMe,
    onMutate: async (patch: MePatch) => {
      await client.cancelQueries({ queryKey: qk.session });
      const before = client.getQueryData<Session>(qk.session);
      client.setQueryData<Session>(qk.session, (s) => (s ? { ...s, user: { ...s.user, ...patch, language: patch.language ?? s.user.language } } : s));
      return before;
    },
    onError: (error, _patch, before) => {
      client.setQueryData(qk.session, before);
      toast(errorText(error, t));
    },
    onSuccess: (user, patch) => {
      client.setQueryData<Session>(qk.session, (s) => (s ? { ...s, user } : s));
      // "Today", weeks and streaks are computed on the server in the user's time zone.
      if (patch.timeZone !== undefined) invalidateHabits(client);
    },
  });
}

export const useHabits = (archived = false) => useQuery({ queryKey: qk.habits(archived), queryFn: () => api.habits(archived) });
export const useHabit = (id: string | null) =>
  useQuery({
    queryKey: qk.habit(id ?? ''),
    queryFn: () => api.habit(id!),
    enabled: id !== null,
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });
export const useCheckDates = (id: string, from: string, to: string) =>
  useQuery({ queryKey: qk.checks(id, from, to), queryFn: () => api.checkDates(id, from, to), placeholderData: (prev) => prev });
export const useFriends = () => useQuery({ queryKey: qk.friends, queryFn: api.friends });
export const useRequests = () => useQuery({ queryKey: qk.requests, queryFn: api.requests });
export const useInviteLink = (habitId: string | null) => useQuery({ queryKey: qk.inviteLink(habitId), queryFn: () => api.inviteLink(habitId) });
export const useInvitePreview = (token: string) =>
  useQuery({ queryKey: qk.invite(token), queryFn: () => api.invitePreview(token), retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2 });

export const useFeed = () =>
  useInfiniteQuery({
    queryKey: qk.feed,
    queryFn: ({ pageParam }) => api.feed(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

/**
 * What the viewer sees right after tapping the check, before the server answers.
 * The group's "done" is only predictable for personal habits; shared ones wait for the refetch.
 */
export function applyCheck(view: HabitView, viewerId: number, date: string, checked: boolean): HabitView {
  const personal = view.members.length < 2;
  const week = view.week.map((d) => (d.date === date ? { ...d, mine: checked, done: personal ? checked : d.done } : d));
  const dayIndex = view.week.findIndex((d) => d.date === date);
  return {
    ...view,
    checkedToday: date === view.today ? checked : view.checkedToday,
    doneToday: date === view.today && personal ? checked : view.doneToday,
    week,
    members: view.members.map((m) =>
      m.userId !== viewerId
        ? m
        : {
            ...m,
            checkedToday: date === view.today ? checked : m.checkedToday,
            week: m.week.map((v, i) => (i === dayIndex ? checked : v)),
          },
    ),
  };
}

function patchHabitEverywhere(client: QueryClient, id: string, update: (v: HabitView) => HabitView) {
  client.setQueryData<HabitView[]>(qk.habits(false), (list) => list?.map((h) => (h.id === id ? update(h) : h)));
  client.setQueryData<HabitView>(qk.habit(id), (h) => (h ? update(h) : h));
}

const TOGGLE_KEY = ['toggle-check'] as const;

type Checks = { done: string[]; mine: string[] };

function applyCheckToDates(checks: Checks | undefined, date: string, checked: boolean, personal: boolean): Checks | undefined {
  if (!checks) return checks;
  const toggle = (list: string[]) => (checked ? [...new Set([...list, date])] : list.filter((d) => d !== date));
  return { mine: toggle(checks.mine), done: personal ? toggle(checks.done) : checks.done };
}

export function useToggleCheck(viewerId: number) {
  const client = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  return useMutation({
    mutationKey: TOGGLE_KEY,
    mutationFn: async ({ habit, date, checked }: { habit: HabitView; date: string; checked: boolean }): Promise<void> => {
      if (checked) await api.check(habit.id, date);
      else await api.uncheck(habit.id, date);
    },
    onMutate: async ({ habit, date, checked }) => {
      await Promise.all([
        client.cancelQueries({ queryKey: qk.habits(false) }),
        client.cancelQueries({ queryKey: qk.habit(habit.id) }),
        client.cancelQueries({ queryKey: ['checks', habit.id] }),
      ]);
      const before = {
        list: client.getQueryData<HabitView[]>(qk.habits(false)),
        one: client.getQueryData<HabitView>(qk.habit(habit.id)),
        checks: client.getQueriesData<Checks>({ queryKey: ['checks', habit.id] }),
      };
      patchHabitEverywhere(client, habit.id, (v) => applyCheck(v, viewerId, date, checked));
      const personal = habit.members.length < 2;
      client.setQueriesData<Checks>({ queryKey: ['checks', habit.id] }, (c) => applyCheckToDates(c, date, checked, personal));
      return before;
    },
    onError: (error, { habit }, before) => {
      client.setQueryData(qk.habits(false), before?.list);
      client.setQueryData(qk.habit(habit.id), before?.one);
      for (const [key, data] of before?.checks ?? []) client.setQueryData(key, data);
      haptic.error();
      toast(errorText(error, t));
    },
    onSettled: (_data, _error, { habit }) => {
      // With taps still in flight, a refetch would overwrite their optimistic state and flicker.
      if (client.isMutating({ mutationKey: TOGGLE_KEY }) > 1) return;
      void client.invalidateQueries({ queryKey: qk.habits(false) });
      void client.invalidateQueries({ queryKey: qk.habit(habit.id) });
      void client.invalidateQueries({ queryKey: ['checks', habit.id] });
      void client.invalidateQueries({ queryKey: qk.feed });
    },
  });
}

/**
 * Refetches everything that shows habits after a structural change (create, edit, join, leave,
 * archive, approve). Cheap: only queries that are on screen actually refetch.
 */
export function invalidateHabits(client: QueryClient) {
  for (const key of [['habits'], ['habit'], ['checks'], qk.feed, qk.friends, qk.requests]) {
    void client.invalidateQueries({ queryKey: key });
  }
}
