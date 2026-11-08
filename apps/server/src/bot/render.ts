import { addDays, encodeDeepLink, type DeepLink, type Notification } from '@habit/core';
import { InlineKeyboard } from 'grammy';
import { formatDay, type Texts } from '../i18n/texts';
import { cb } from './callbacks';

export interface Rendered {
  text: string;
  keyboard?: InlineKeyboard;
}

const DAYS_IN_WEEK = 7;

/** web_app button URL that opens the Mini App on a given screen via the `open` query parameter. */
export function openUrl(webAppUrl: string, link: DeepLink): string {
  const url = new URL(webAppUrl);
  url.searchParams.set('open', encodeDeepLink(link));
  return url.toString();
}

function body(n: Notification, t: Texts): { text: string; quick?: InlineKeyboard; opens: DeepLink } {
  switch (n.type) {
    case 'member_checked': {
      const lines = [t.memberChecked(n.actor.firstName, n.habit.title, n.isToday ? null : formatDay(n.date, t))];
      if (n.dayCompleted) lines.push(t.dayCompleted);
      const quick = n.recipientChecked ? undefined : new InlineKeyboard().text(t.checkMineToo, cb.check(n.habit.id, n.date));
      return { text: lines.join('\n'), quick, opens: { screen: 'habit', habitId: n.habit.id } };
    }
    case 'request_created':
      return {
        text: t.requestCreated(n.requestType, n.from.firstName, n.habit?.title ?? null),
        quick: new InlineKeyboard().text(t.accept, cb.approve(n.requestId)).text(t.decline, cb.decline(n.requestId)),
        opens: { screen: 'requests' },
      };
    case 'request_approved':
      return {
        text: t.requestApproved(n.requestType, n.by.firstName, n.habit?.title ?? null),
        opens: n.habit ? { screen: 'habit', habitId: n.habit.id } : { screen: 'feed' },
      };
    case 'ownership_received':
      return { text: t.ownershipReceived(n.habit.title, n.from.firstName), opens: { screen: 'habit', habitId: n.habit.id } };
    case 'reminder':
      return {
        text: t.reminder(n.habit.title, n.time),
        quick: new InlineKeyboard().text(t.checkIt, cb.check(n.habit.id, n.date)),
        opens: { screen: 'habit', habitId: n.habit.id },
      };
    case 'weekly_summary': {
      const range = `${formatDay(n.weekStart, t)} – ${formatDay(addDays(n.weekStart, DAYS_IN_WEEK - 1), t)}`;
      const lines = n.habits.map((h) => t.weeklyLine(h.habit.title, h.done, h.target, h.streak.current, h.streak.unit));
      return { text: [t.weeklyTitle(range), '', ...lines].join('\n'), opens: { screen: 'home' } };
    }
  }
}

/**
 * Message text plus buttons: quick actions on the first row, then "Open" into the matching
 * Mini App screen (left out while there is no deployed Mini App).
 */
export function renderNotification(n: Notification, t: Texts, webAppUrl: string | null): Rendered {
  const { text, quick, opens } = body(n, t);
  const keyboard = quick ?? new InlineKeyboard();
  if (webAppUrl) keyboard.row().webApp(t.open, openUrl(webAppUrl, opens));
  return { text, keyboard: keyboard.inline_keyboard.flat().length > 0 ? keyboard : undefined };
}
