import type { ErrorCode, Language, RequestType } from '@habit/core';

const escapeMap: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
/** Escapes user-provided text for Telegram's HTML parse mode. */
export const esc = (value: string) => value.replace(/[&<>"]/g, (ch) => escapeMap[ch]!);

const b = (value: string) => `<b>${esc(value)}</b>`;

/** Bot texts only: greetings and notifications. Everything interactive lives in the Mini App. */
export interface Texts {
  locale: string;
  welcome(name: string): string;
  welcomeNoApp: string;
  openApp: string;
  open: string;
  memberChecked(actor: string, habit: string, date: string | null): string;
  dayCompleted: string;
  checkMineToo: string;
  checkIt: string;
  requestCreated(type: RequestType, from: string, habit: string | null): string;
  requestApproved(type: RequestType, by: string, habit: string | null): string;
  accept: string;
  decline: string;
  accepted: string;
  declined: string;
  ownershipReceived(habit: string, from: string): string;
  habitDeleted(habit: string, by: string): string;
  reminder(habit: string, time: string): string;
  weeklyTitle(range: string): string;
  weeklyLine(habit: string, done: number, target: number, streak: number, unit: 'day' | 'week'): string;
  checked: string;
  alreadyChecked: string;
  error(code: ErrorCode | 'unknown'): string;
}

const ru: Texts = {
  locale: 'ru-RU',
  welcome: (name) =>
    `Привет, ${esc(name)}! 👋\n\nЭто трекер привычек для тебя и друзей: отмечайте привычки вместе и держите серию.`,
  welcomeNoApp: 'Приложение скоро появится.',
  openApp: 'Открыть трекер',
  open: 'Открыть',
  memberChecked: (actor, habit, date) => `✅ ${b(actor)} · «${esc(habit)}» — готово${date ? ` за ${date}` : ''}`,
  dayCompleted: '🔥 День засчитан для всех!',
  checkMineToo: 'Отметить и мне',
  checkIt: 'Отметить',
  requestCreated: (type, from, habit) => {
    if (type === 'friend') return `${b(from)} хочет добавить тебя в друзья.`;
    if (type === 'habit_join') return `${b(from)} просится в привычку «${esc(habit ?? '')}».`;
    return `${b(from)} зовёт тебя в привычку «${esc(habit ?? '')}».`;
  },
  requestApproved: (type, by, habit) => {
    if (type === 'friend') return `Готово: вы с ${b(by)} теперь друзья 🤝`;
    if (type === 'habit_join') return `Тебя приняли в «${esc(habit ?? '')}» 🎉`;
    return `${b(by)} теперь с тобой в «${esc(habit ?? '')}» 🎉`;
  },
  accept: 'Принять',
  decline: 'Отклонить',
  accepted: 'Принято ✓',
  declined: 'Отклонено',
  ownershipReceived: (habit, from) => `${b(from)} передаёт тебе привычку «${esc(habit)}» — теперь ты владелец.`,
  habitDeleted: (habit, by) => `${b(by)} удалил привычку «${esc(habit)}» вместе со всеми отметками.`,
  reminder: (habit, time) => `⏰ Напоминание: «${esc(habit)}» в ${time}`,
  weeklyTitle: (range) => `📊 Итоги недели · ${range}`,
  weeklyLine: (habit, done, target, streak, unit) =>
    `${done >= target ? '✅' : '▫️'} ${esc(habit)}: ${done}/${target}` +
    (streak > 0 ? ` · 🔥 ${streak} ${unit === 'week' ? 'нед.' : 'дн.'}` : ''),
  checked: 'Отмечено ✓',
  alreadyChecked: 'Уже отмечено',
  error: (code) =>
    ({
      not_found: 'Не нашёл — возможно, привычку удалили или тебя убрали из неё.',
      forbidden: 'Это действие не для тебя.',
      invalid: 'Так нельзя.',
      conflict: 'Уже обработано.',
      unknown: 'Что-то пошло не так, попробуй ещё раз.',
    })[code],
};

const en: Texts = {
  locale: 'en-US',
  welcome: (name) =>
    `Hi, ${esc(name)}! 👋\n\nThis is a habit tracker for you and your friends: check habits off together and keep the streak.`,
  welcomeNoApp: 'The app is coming soon.',
  openApp: 'Open tracker',
  open: 'Open',
  memberChecked: (actor, habit, date) => `✅ ${b(actor)} checked off “${esc(habit)}”${date ? ` for ${date}` : ''}`,
  dayCompleted: '🔥 The day counts for everyone!',
  checkMineToo: 'Check mine too',
  checkIt: 'Check off',
  requestCreated: (type, from, habit) => {
    if (type === 'friend') return `${b(from)} wants to be friends.`;
    if (type === 'habit_join') return `${b(from)} asks to join “${esc(habit ?? '')}”.`;
    return `${b(from)} invites you to “${esc(habit ?? '')}”.`;
  },
  requestApproved: (type, by, habit) => {
    if (type === 'friend') return `Done: you and ${b(by)} are friends now 🤝`;
    if (type === 'habit_join') return `You're in “${esc(habit ?? '')}” 🎉`;
    return `${b(by)} joined you in “${esc(habit ?? '')}” 🎉`;
  },
  accept: 'Accept',
  decline: 'Decline',
  accepted: 'Accepted ✓',
  declined: 'Declined',
  ownershipReceived: (habit, from) => `${b(from)} hands “${esc(habit)}” over to you — you are the owner now.`,
  habitDeleted: (habit, by) => `${b(by)} deleted “${esc(habit)}” along with all its check-ins.`,
  reminder: (habit, time) => `⏰ Reminder: “${esc(habit)}” at ${time}`,
  weeklyTitle: (range) => `📊 Your week · ${range}`,
  weeklyLine: (habit, done, target, streak, unit) =>
    `${done >= target ? '✅' : '▫️'} ${esc(habit)}: ${done}/${target}` +
    (streak > 0 ? ` · 🔥 ${streak} ${unit === 'week' ? (streak === 1 ? 'week' : 'weeks') : streak === 1 ? 'day' : 'days'}` : ''),
  checked: 'Checked ✓',
  alreadyChecked: 'Already checked',
  error: (code) =>
    ({
      not_found: "Not found — the habit may be gone or you're no longer in it.",
      forbidden: "This action isn't for you.",
      invalid: "That's not allowed.",
      conflict: 'Already handled.',
      unknown: 'Something went wrong, please try again.',
    })[code],
};

export const TEXTS: Record<Language, Texts> = { ru, en };

/** "8 ноября" / "November 8" for a YYYY-MM-DD date. */
export function formatDay(date: string, t: Texts): string {
  return new Intl.DateTimeFormat(t.locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}
