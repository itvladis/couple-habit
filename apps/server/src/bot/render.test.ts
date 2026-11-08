import type { Notification } from '@habit/core';
import { describe, expect, it } from 'vitest';
import { TEXTS } from '../i18n/texts';
import { renderNotification } from './render';

const habit = { id: '11111111-1111-4111-8111-111111111111', title: 'Зал <вместе>', icon: 'dumbbell' };
const masha = { id: 2, firstName: 'Маша' };

const APP = 'https://app.example/tracker';
const buttons = (r: ReturnType<typeof renderNotification>) =>
  r.keyboard?.inline_keyboard.flat().flatMap((b) => ('callback_data' in b ? [b.callback_data] : [])) ?? [];
const opens = (r: ReturnType<typeof renderNotification>) =>
  r.keyboard?.inline_keyboard.flat().flatMap((b) => ('web_app' in b && b.web_app ? [b.web_app.url] : [])) ?? [];

describe('renderNotification', () => {
  it('offers "check mine too" when the recipient has not checked yet and escapes HTML', () => {
    const n: Notification = {
      type: 'member_checked', to: 1, actor: masha, habit, date: '2026-11-08',
      isToday: true, recipientChecked: false, dayCompleted: false,
    };

    const r = renderNotification(n, TEXTS.ru, APP);

    expect(r.text).toBe('✅ <b>Маша</b> · «Зал &lt;вместе&gt;» — готово');
    expect(buttons(r)).toEqual([`c:${habit.id}:2026-11-08`]);
  });

  it('mentions the date for past days and celebrates a completed day without a button', () => {
    const n: Notification = {
      type: 'member_checked', to: 1, actor: masha, habit, date: '2026-11-05',
      isToday: false, recipientChecked: true, dayCompleted: true,
    };

    const r = renderNotification(n, TEXTS.en, APP);

    expect(r.text).toContain('for November 5');
    expect(r.text).toContain('The day counts for everyone');
    expect(buttons(r)).toEqual([]);
    expect(opens(r)).toHaveLength(1);
  });

  it('adds accept and decline buttons to requests', () => {
    const n: Notification = {
      type: 'request_created', to: 1, requestId: '22222222-2222-4222-8222-222222222222',
      requestType: 'habit_join', from: masha, habit,
    };

    const r = renderNotification(n, TEXTS.ru, APP);

    expect(r.text).toContain('просится в привычку');
    expect(buttons(r)).toEqual(['ra:22222222-2222-4222-8222-222222222222', 'rd:22222222-2222-4222-8222-222222222222']);
  });

  it('summarizes the week with streak units', () => {
    const n: Notification = {
      type: 'weekly_summary', to: 1, weekStart: '2026-11-02',
      habits: [{ habit, done: 3, target: 3, streak: { current: 4, best: 4, unit: 'week' } }],
    };

    const r = renderNotification(n, TEXTS.ru, APP);

    expect(r.text).toContain('2 ноября – 8 ноября');
    expect(r.text).toContain('✅ Зал &lt;вместе&gt;: 3/3 · 🔥 4 нед.');
  });

  it('keeps every callback under the 64-byte Telegram limit', () => {
    const n: Notification = { type: 'reminder', to: 1, habit, date: '2026-11-08', time: '03:00' };

    for (const data of buttons(renderNotification(n, TEXTS.en, APP))) {
      expect(new TextEncoder().encode(data ?? '').length).toBeLessThanOrEqual(64);
    }
  });

  it('adds an "Open" button that lands on the right screen of the Mini App', () => {
    const checked: Notification = {
      type: 'member_checked', to: 1, actor: masha, habit, date: '2026-11-08',
      isToday: true, recipientChecked: true, dayCompleted: false,
    };
    const request: Notification = {
      type: 'request_created', to: 1, requestId: '22222222-2222-4222-8222-222222222222',
      requestType: 'friend', from: masha, habit: null,
    };

    expect(opens(renderNotification(checked, TEXTS.ru, APP))).toEqual([`${APP}?open=h_${habit.id}`]);
    expect(opens(renderNotification(request, TEXTS.ru, APP))).toEqual([`${APP}?open=requests`]);
  });

  it('leaves the "Open" button out until the Mini App is deployed', () => {
    const n: Notification = { type: 'reminder', to: 1, habit, date: '2026-11-08', time: '03:00' };

    expect(opens(renderNotification(n, TEXTS.ru, null))).toEqual([]);
    expect(buttons(renderNotification(n, TEXTS.ru, null))).toEqual([`c:${habit.id}:2026-11-08`]);
  });

  it('names the habit and the reminder time', () => {
    const n: Notification = { type: 'reminder', to: 1, habit, date: '2026-11-08', time: '03:00' };

    expect(renderNotification(n, TEXTS.ru, null).text).toBe('⏰ Напоминание: «Зал &lt;вместе&gt;» в 03:00');
    expect(renderNotification(n, TEXTS.en, null).text).toBe('⏰ Reminder: “Зал &lt;вместе&gt;” at 03:00');
  });
});
