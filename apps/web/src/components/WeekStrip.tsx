import type { HabitView } from '../lib/api';

interface Props {
  week: HabitView['week'];
  today: string;
  variant: 'bars' | 'dots';
}

/**
 * Last seven days, today last. Done days are filled with the habit color; today is outlined
 * until it is done. Fill changes use a 200 ms color transition, per the motion spec.
 */
export function WeekStrip({ week, today, variant }: Props) {
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {week.map((day) => {
        const isToday = day.date === today;
        const base = variant === 'bars' ? 'h-1.5 flex-1 rounded-full' : 'size-[7px] rounded-[2px]';
        return (
          <span
            key={day.date}
            className={`${base} transition-[background-color,box-shadow] duration-200 ease-[var(--ease-out-quint)]`}
            style={{
              backgroundColor: day.done ? 'var(--hc)' : 'color-mix(in srgb, var(--hc) 18%, transparent)',
              boxShadow: isToday && !day.done ? 'inset 0 0 0 1.5px color-mix(in srgb, var(--hc) 90%, transparent)' : 'none',
            }}
          />
        );
      })}
    </div>
  );
}
