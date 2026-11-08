import { useId, useRef, type CSSProperties, type PointerEvent } from 'react';
import type { HabitView } from '../lib/api';
import { habitSubtitle } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { haptic } from '../lib/telegram';
import { AvatarStack } from './Avatar';
import { CheckButton } from './CheckButton';
import { HabitIcon, habitColor } from './HabitIcon';
import { StreakCount } from './StreakCount';
import { WeekStrip } from './WeekStrip';

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 8;

interface Props {
  habit: HabitView;
  wide: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onLongPress: () => void;
}

/** Card background: the surface plus a vertical wash of the habit color (stronger in dark theme). */
export const cardStyle = (color: string): CSSProperties =>
  ({
    '--hc': habitColor(color),
    background:
      'linear-gradient(180deg, color-mix(in srgb, var(--hc) var(--tint-top), transparent), color-mix(in srgb, var(--hc) var(--tint-bottom), transparent)), var(--surface)',
  }) as CSSProperties;

/**
 * Plain container with two siblings for assistive tech: the title button opens the habit
 * (stretched over the whole card) and the check button toggles today. Long-press or right-click
 * anywhere except the check opens the card menu.
 */
export function HabitCard({ habit, wide, onOpen, onToggle, onLongPress }: Props) {
  const { t } = useI18n();
  const subtitleId = useId();
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const fire = () => {
    if (fired.current) return;
    fired.current = true;
    haptic.impact('medium');
    onLongPress();
  };

  const onPointerDown = (e: PointerEvent) => {
    fired.current = false;
    cancel();
    if ((e.target as Element).closest('[data-no-long-press]')) return;
    start.current = { x: e.clientX, y: e.clientY };
    timer.current = window.setTimeout(fire, LONG_PRESS_MS);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!start.current) return;
    if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_TOLERANCE_PX) cancel();
  };

  const people = habit.members.map((m) => ({ id: m.userId, name: m.firstName, photoUrl: m.photoUrl }));
  const weeks = habit.streak.unit === 'week';

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => {
        if ((e.target as Element).closest('[data-no-long-press]')) return;
        // Android fires contextmenu after our own timer; open the menu once.
        e.preventDefault();
        cancel();
        fire();
      }}
      style={cardStyle(habit.color)}
      className={`press relative flex min-h-[128px] flex-col rounded-[24px] border border-line p-4 select-none [-webkit-touch-callout:none] has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-hc ${wide ? 'col-span-2' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="pt-1 text-hc" aria-hidden>
          <HabitIcon name={habit.icon} size={22} />
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden>
            <AvatarStack people={people} size={26} />
          </span>
          <CheckButton
            checked={habit.checkedToday}
            onToggle={onToggle}
            label={`${habit.title}: ${habit.checkedToday ? t.habit.checkedToday : t.habit.notCheckedToday}`}
            disabled={habit.archived}
          />
        </span>
      </div>
      <div className="mt-2 min-w-0">
        <h3 className="line-clamp-2 text-[17px] leading-[22px] font-semibold break-words text-hc">
          <button
            type="button"
            aria-describedby={subtitleId}
            onClick={() => {
              if (!fired.current) onOpen();
            }}
            className="text-left outline-none after:absolute after:inset-0 after:rounded-[24px]"
          >
            {habit.title}
          </button>
        </h3>
        <p id={subtitleId} className="mt-0.5 truncate text-[13px] text-ink-2">
          {habitSubtitle(habit, t)}
        </p>
      </div>
      <div className="mt-auto flex items-center gap-2 pt-3">
        <div className="flex-1">
          <WeekStrip week={habit.week} today={habit.today} variant={wide ? 'bars' : 'dots'} />
        </div>
        {habit.streak.current > 0 && <StreakCount value={habit.streak.current} label={t.habit.streakAria(habit.streak.current, weeks)} />}
      </div>
    </div>
  );
}
