import type {
  CardSize,
  DeepLink,
  FeedItem,
  FriendSummary,
  Frequency,
  HabitView,
  IncomingRequest,
  InvitePreview,
  Language,
  Reminder,
  ThemePreference,
  WeeklySummarySettings,
} from '@habit/core';
import { initData } from './telegram';

export type { CardSize, DeepLink, FeedItem, FriendSummary, Frequency, HabitView, IncomingRequest, InvitePreview, Reminder };

export interface Me {
  id: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  language: Language;
  languageSetting: Language | null;
  theme: ThemePreference;
  timeZone: string;
  timeZoneManual: boolean;
  remindersEnabled: boolean;
  weeklySummary: WeeklySummarySettings;
}

export interface Session {
  user: Me;
  deepLink: DeepLink | null;
  invite: InvitePreview | null;
}

export interface HabitInput {
  title: string;
  icon: string;
  color: string;
  frequency: Frequency;
  completionMode: 'all' | 'any';
  visibility: 'friends' | 'private';
}

export interface InviteLinkInfo {
  token: string;
  habitId: string | null;
  url: string;
}

export type JoinOutcome =
  | { status: 'requested'; approver: { firstName: string }; habit: { id: string; title: string } | null; requestId: string }
  | { status: 'already_requested'; approver: { firstName: string }; habit: { id: string; title: string } | null }
  | { status: 'already_friends'; approver: { firstName: string } }
  | { status: 'already_member'; habit: { id: string; title: string } }
  | { status: 'own_link' | 'friend_list_full' }
  | { status: 'habit_full'; habit: { id: string; title: string } };

export interface MembershipSettings {
  notifyOnCheck?: boolean;
  reminder?: Reminder | null;
  cardSize?: CardSize;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = import.meta.env.VITE_API_URL ?? '';
const TIMEOUT_MS = 15_000;

let onUnauthorized: (() => void) | null = null;
/**
 * Telegram init data is valid for 24 h and only refreshes when the Mini App is reopened;
 * the app subscribes here to show a "reopen" screen instead of failing every request.
 */
export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler;
};

async function send<T>(method: string, path: string, body?: unknown): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  const data = initData();
  if (data) headers.Authorization = `tma ${data}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 204) return { data: undefined as T };
  const json = (await res.json().catch(() => null)) as { data?: T; meta?: Record<string, unknown>; error?: { code: string; message: string } } | null;
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(res.status, json?.error?.code ?? 'unknown', json?.error?.message ?? res.statusText);
  }
  // A 2xx without our JSON envelope (e.g. an HTML page from a proxy) is a failure, not empty data.
  if (json === null || !('data' in json)) throw new ApiError(res.status, 'bad_response', 'unexpected response from the server');
  return { data: json.data as T, meta: json.meta };
}

const get = async <T>(path: string) => (await send<T>('GET', path)).data;
const call = async <T>(method: string, path: string, body?: unknown) => (await send<T>(method, path, body)).data;

export const api = {
  session: (timeZone: string) => call<Session>('POST', '/session', { timeZone }),
  updateMe: (patch: Partial<Pick<Me, 'theme' | 'timeZone' | 'remindersEnabled' | 'weeklySummary'>> & { language?: Language | null }) =>
    call<Me>('PATCH', '/me', patch),

  habits: (archived = false) => get<HabitView[]>(archived ? '/habits?archived=true' : '/habits'),
  habit: (id: string) => get<HabitView>(`/habits/${id}`),
  createHabit: (input: HabitInput) => call<HabitView>('POST', '/habits', input),
  updateHabit: (id: string, patch: Partial<HabitInput>) => call<HabitView>('PATCH', `/habits/${id}`, patch),
  archive: (id: string) => call<HabitView>('POST', `/habits/${id}/archive`),
  unarchive: (id: string) => call<HabitView>('POST', `/habits/${id}/unarchive`),
  transfer: (id: string, userId: number) => call<HabitView>('POST', `/habits/${id}/transfer`, { userId }),
  updateMembership: (id: string, patch: MembershipSettings) => call<MembershipSettings>('PATCH', `/habits/${id}/membership`, patch),
  leave: (id: string) => call<void>('DELETE', `/habits/${id}/membership`),
  removeMember: (id: string, userId: number) => call<void>('DELETE', `/habits/${id}/members/${userId}`),

  checkDates: (id: string, from: string, to: string) =>
    get<{ done: string[]; mine: string[] }>(`/habits/${id}/checks?from=${from}&to=${to}`),
  check: (id: string, date: string) => call<{ created: boolean; date: string }>('PUT', `/habits/${id}/checks/${date}`),
  uncheck: (id: string, date: string) => call<void>('DELETE', `/habits/${id}/checks/${date}`),

  inviteLink: (habitId: string | null) => get<InviteLinkInfo>(habitId ? `/habits/${habitId}/invite-link` : '/invite-link'),
  resetInviteLink: (habitId: string | null) =>
    call<InviteLinkInfo>('POST', habitId ? `/habits/${habitId}/invite-link/reset` : '/invite-link/reset'),
  invitePreview: (token: string) => get<InvitePreview>(`/invites/${encodeURIComponent(token)}`),
  join: (token: string) => call<JoinOutcome>('POST', `/invites/${encodeURIComponent(token)}/requests`),
  inviteFriend: (habitId: string, userId: number) => call<{ id: string }>('POST', `/habits/${habitId}/invites`, { userId }),

  requests: () => get<IncomingRequest[]>('/requests'),
  approve: (id: string) => call<{ id: string }>('POST', `/requests/${id}/approve`),
  decline: (id: string) => call<{ id: string }>('POST', `/requests/${id}/decline`),

  friends: () => get<FriendSummary[]>('/friends'),
  removeFriend: (userId: number) => call<void>('DELETE', `/friends/${userId}`),

  async feed(before: string | null): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
    const res = await send<FeedItem[]>('GET', before ? `/feed?before=${encodeURIComponent(before)}` : '/feed');
    return { items: res.data, nextCursor: (res.meta?.nextCursor as string | null | undefined) ?? null };
  },
};
