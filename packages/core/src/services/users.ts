import type { Ctx } from '../context';
import { isValidTimeZone } from '../domain/dates';
import type { Language, User } from '../models';
import { parseInput, settingsPatchSchema } from '../schemas';

export const DEFAULT_TIME_ZONE = 'Europe/Moscow';
const DEFAULT_SUMMARY = { enabled: true, weekday: 7, time: '20:00' };
const RUSSIAN_SPEAKING = ['ru', 'uk', 'be', 'kk'];

/** Subset of Telegram's User object that the app relies on. */
export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

export function resolveLanguage(user: Pick<User, 'language' | 'telegramLanguage'>): Language {
  if (user.language) return user.language;
  const code = user.telegramLanguage?.slice(0, 2).toLowerCase();
  return code && RUSSIAN_SPEAKING.includes(code) ? 'ru' : 'en';
}

export class UsersService {
  constructor(private readonly ctx: Ctx) {}

  /**
   * Creates or refreshes a user from Telegram data.
   * @param timeZone the browser time zone reported by the Mini App; ignored once the user picked one by hand.
   */
  async upsertFromTelegram(tg: TelegramUser, timeZone?: string): Promise<User> {
    const detectedZone = timeZone && isValidTimeZone(timeZone) ? timeZone : undefined;
    if (timeZone && !detectedZone) console.warn(`[users] ignoring unknown time zone "${timeZone}" for user ${tg.id}`);
    const existing = await this.ctx.store.getUser(tg.id);
    const profile = {
      firstName: tg.first_name,
      lastName: tg.last_name ?? null,
      username: tg.username ?? null,
      photoUrl: tg.photo_url ?? existing?.photoUrl ?? null,
      telegramLanguage: tg.language_code ?? existing?.telegramLanguage ?? null,
    };

    const user: User = existing
      ? {
          ...existing,
          ...profile,
          timeZone: !existing.timeZoneManual && detectedZone ? detectedZone : existing.timeZone,
        }
      : {
          id: tg.id,
          ...profile,
          language: null,
          theme: 'auto',
          timeZone: detectedZone ?? DEFAULT_TIME_ZONE,
          timeZoneManual: false,
          remindersEnabled: true,
          weeklySummary: { ...DEFAULT_SUMMARY },
          lastWeeklySummaryWeek: null,
          canMessage: true,
          createdAt: this.ctx.nowIso(),
        };
    await this.ctx.store.saveUser(user);
    return user;
  }

  /** Returns the stored user, creating it on first contact. Unlike upsert, it does not write for known users. */
  async ensure(tg: TelegramUser): Promise<User> {
    return (await this.ctx.store.getUser(tg.id)) ?? this.upsertFromTelegram(tg);
  }

  get(userId: number): Promise<User> {
    return this.ctx.requireUser(userId);
  }

  async updateSettings(userId: number, patch: unknown): Promise<User> {
    const data = parseInput(settingsPatchSchema, patch);
    const user = await this.ctx.requireUser(userId);
    const updated: User = {
      ...user,
      ...(data.timeZone !== undefined && { timeZone: data.timeZone, timeZoneManual: true }),
      ...(data.language !== undefined && { language: data.language }),
      ...(data.theme !== undefined && { theme: data.theme }),
      ...(data.remindersEnabled !== undefined && { remindersEnabled: data.remindersEnabled }),
      ...(data.weeklySummary !== undefined && { weeklySummary: data.weeklySummary }),
    };
    await this.ctx.store.saveUser(updated);
    return updated;
  }

  /** The bot calls this with false when Telegram says the user blocked it, and true on /start. */
  async setReachable(userId: number, canMessage: boolean): Promise<void> {
    await this.ctx.store.setCanMessage(userId, canMessage);
  }
}
