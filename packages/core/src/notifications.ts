import type { LocalDate } from './domain/dates';
import type { Streak } from './domain/streak';
import type { RequestType } from './models';

export interface UserRef {
  id: number;
  firstName: string;
}

export interface HabitRef {
  id: string;
  title: string;
  icon: string;
}

/** Something a user should hear about from the bot. Rendering and delivery live in the server. */
export type Notification =
  | {
      type: 'member_checked';
      to: number;
      actor: UserRef;
      habit: HabitRef;
      date: LocalDate;
      isToday: boolean;
      recipientChecked: boolean;
      /** This check completed the day for the whole habit. */
      dayCompleted: boolean;
    }
  | { type: 'request_created'; to: number; requestId: string; requestType: RequestType; from: UserRef; habit: HabitRef | null }
  | { type: 'request_approved'; to: number; requestType: RequestType; by: UserRef; habit: HabitRef | null }
  | { type: 'ownership_received'; to: number; habit: HabitRef; from: UserRef }
  /** `time` is the reminder's local "HH:MM": the set time, or the minute picked inside a window. */
  | { type: 'reminder'; to: number; habit: HabitRef; date: LocalDate; time: string }
  | {
      type: 'weekly_summary';
      to: number;
      weekStart: LocalDate;
      habits: Array<{ habit: HabitRef; done: number; target: number; streak: Streak }>;
    };

export interface Notifier {
  /** Resolves when sent or permanently undeliverable; rejects only for transient failures worth a retry. */
  send(notification: Notification): Promise<void>;
}
