import type { CompletionMode } from './domain/completion';
import type { LocalDate } from './domain/dates';
import type { Reminder } from './domain/reminder';
import type { Frequency } from './domain/schedule';

export type Language = 'ru' | 'en';
export type ThemePreference = 'auto' | 'dark' | 'light';
export type HabitVisibility = 'friends' | 'private';
/** How a member shows the habit on their home grid: half width or a full row. */
export type CardSize = 'normal' | 'wide';
/** ISO 8601 UTC timestamp. */
export type Timestamp = string;

export interface WeeklySummarySettings {
  enabled: boolean;
  /** ISO weekday, Monday = 1 … Sunday = 7. */
  weekday: number;
  time: string;
}

export interface User {
  /** Telegram user id. */
  id: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  telegramLanguage: string | null;
  /** Manual override; null follows the Telegram language. */
  language: Language | null;
  theme: ThemePreference;
  timeZone: string;
  /** True once the user picked a time zone by hand, so the Mini App stops auto-updating it. */
  timeZoneManual: boolean;
  remindersEnabled: boolean;
  weeklySummary: WeeklySummarySettings;
  lastWeeklySummaryWeek: LocalDate | null;
  /** False after the user blocked the bot; nothing is sent until they /start again. */
  canMessage: boolean;
  createdAt: Timestamp;
}

export interface Habit {
  id: string;
  ownerId: number;
  title: string;
  icon: string;
  color: string;
  frequency: Frequency;
  completionMode: CompletionMode;
  visibility: HabitVisibility;
  /** Owner's local date when the habit was created. */
  startDate: LocalDate;
  archivedAt: Timestamp | null;
  createdAt: Timestamp;
}

export interface Membership {
  habitId: string;
  userId: number;
  joinedAt: Timestamp;
  /** Member's local date when they joined; "all" mode requires them from this day on. */
  joinedDate: LocalDate;
  notifyOnCheck: boolean;
  reminder: Reminder | null;
  /** Personal: each member arranges their own home screen. */
  cardSize: CardSize;
  lastReminderDate: LocalDate | null;
  /** Last day this member's check notified others; stops repeat pings when a day is toggled off and on. */
  lastCheckNotice: { date: LocalDate; at: Timestamp } | null;
}

export interface Check {
  habitId: string;
  userId: number;
  date: LocalDate;
  createdAt: Timestamp;
}

export interface Friendship {
  /** Always the smaller id of the pair. */
  userA: number;
  userB: number;
  createdAt: Timestamp;
}

export interface InviteLink {
  token: string;
  ownerId: number;
  /** null for a friend link. */
  habitId: string | null;
  createdAt: Timestamp;
  revokedAt: Timestamp | null;
}

/** friend: become friends · habit_join: requester asks to join · habit_invite: owner invites a friend. */
export type RequestType = 'friend' | 'habit_join' | 'habit_invite';
export type RequestStatus = 'pending' | 'approved' | 'declined';

export interface JoinRequest {
  id: string;
  type: RequestType;
  fromUserId: number;
  /** The only user who may approve or decline. */
  toUserId: number;
  habitId: string | null;
  status: RequestStatus;
  createdAt: Timestamp;
  resolvedAt: Timestamp | null;
}

export type FeedEventType = 'check' | 'habit_created' | 'habit_joined' | 'friendship';

export interface FeedEvent {
  /** Time-sortable id, used as the feed cursor. */
  id: string;
  type: FeedEventType;
  actorId: number;
  habitId: string | null;
  otherUserId: number | null;
  date: LocalDate | null;
  createdAt: Timestamp;
}
