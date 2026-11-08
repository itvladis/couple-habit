import { describe, expect, it } from 'vitest';
import { feedDayLabel, frequencyLabel, habitSubtitle, headerDate, heatmapLayout, localDateOf } from './format';
import { DICTS } from './i18n';

const ru = DICTS.ru;
const en = DICTS.en;

describe('frequencyLabel', () => {
  it('describes every frequency in Russian with correct plurals', () => {
    expect(frequencyLabel({ type: 'daily' }, ru)).toBe('каждый день');
    expect(frequencyLabel({ type: 'weekly', times: 1 }, ru)).toBe('1 раз в неделю');
    expect(frequencyLabel({ type: 'weekly', times: 3 }, ru)).toBe('3 раза в неделю');
    expect(frequencyLabel({ type: 'weekly', times: 5 }, ru)).toBe('5 раз в неделю');
    expect(frequencyLabel({ type: 'weekdays', days: [5, 1, 3] }, ru)).toBe('Пн, Ср, Пт');
  });

  it('speaks English too', () => {
    expect(frequencyLabel({ type: 'weekly', times: 1 }, en)).toBe('1 time a week');
  });
});

describe('habitSubtitle', () => {
  const member = { userId: 1, firstName: 'В', photoUrl: null, isOwner: true, checkedToday: false, week: [] };

  it('mentions the completion mode only for shared habits', () => {
    const base = { frequency: { type: 'weekly', times: 3 } as const, completionMode: 'all' as const };

    expect(habitSubtitle({ ...base, members: [member] }, ru)).toBe('3 раза в неделю');
    expect(habitSubtitle({ ...base, members: [member, { ...member, userId: 2 }] }, ru)).toBe('3 раза в неделю · все участники');
  });
});

describe('dates', () => {
  it('formats the home header like the mockup', () => {
    expect(headerDate('2026-11-07', 'ru-RU')).toBe('СУББОТА, 7 НОЯБРЯ');
  });

  it('labels feed groups relative to today', () => {
    expect(feedDayLabel('2026-11-08', '2026-11-08', ru)).toBe('СЕГОДНЯ');
    expect(feedDayLabel('2026-11-07', '2026-11-08', ru)).toBe('ВЧЕРА');
    expect(feedDayLabel('2026-11-05', '2026-11-08', ru)).toBe('5 НОЯБРЯ');
  });

  it('converts an instant to the viewer’s local date', () => {
    expect(localDateOf('2026-11-08T22:30:00Z', 'Europe/Samara')).toBe('2026-11-09');
    expect(localDateOf('2026-11-08T22:30:00Z', 'America/New_York')).toBe('2026-11-08');
  });
});

describe('heatmapLayout', () => {
  it('builds Monday-first week columns ending with the current week', () => {
    const layout = heatmapLayout('2026-11-08', 'month');

    expect(layout.weeks).toHaveLength(5);
    expect(layout.weeks.at(-1)?.at(-1)).toBe('2026-11-08');
    expect(layout.weeks[0]?.[0]).toBe('2026-10-05');
    expect(layout.from).toBe('2026-10-05');
  });

  it('leaves future days of the current week empty', () => {
    const layout = heatmapLayout('2026-11-05', 'month');

    expect(layout.weeks.at(-1)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', null, null, null]);
  });

  it('marks where months start', () => {
    const layout = heatmapLayout('2026-11-08', 'month');

    expect(layout.monthStarts.map((m) => m.date.slice(0, 7))).toEqual(['2026-10', '2026-11']);
  });
});
