import { motion, useAnimate, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

interface Props {
  checked: boolean;
  onToggle: () => void;
  label: string;
  size?: number;
  disabled?: boolean;
}

/**
 * The main action of the app. Spec: the circle fills in 200 ms ease-out, then the tick draws
 * in 220 ms (+40 ms); unchecking runs the reverse in 150 ms. Colors come from the card's --hc.
 */
export function CheckButton({ checked, onToggle, label, size = 36, disabled }: Props) {
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate<SVGSVGElement>();
  const previous = useRef(checked);

  // Redraw the tick only when it becomes checked now, not when a checked habit first renders
  // or re-renders for any other reason.
  useEffect(() => {
    const becameChecked = checked && !previous.current;
    previous.current = checked;
    if (!becameChecked || reduce || !scope.current) return;
    void animate('path', { pathLength: [0, 1] }, { duration: 0.22, delay: 0.04, ease: EASE_OUT });
  }, [checked, reduce, animate, scope]);

  const fill = { duration: checked ? 0.2 : 0.15, ease: EASE_OUT };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-no-long-press
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="press relative z-10 shrink-0 rounded-full disabled:opacity-50"
      style={{ width: size, height: size }}
    >
      <svg ref={scope} viewBox="0 0 36 36" width={size} height={size} aria-hidden>
        <circle cx="18" cy="18" r="17" fill="none" stroke="var(--ink-2)" strokeWidth="1.5" />
        <motion.circle
          cx="18"
          cy="18"
          r="18"
          fill="var(--hc)"
          initial={false}
          animate={{ opacity: checked ? 1 : 0, transform: reduce || checked ? 'scale(1)' : 'scale(0.9)' }}
          style={{ transformOrigin: '18px 18px' }}
          transition={fill}
        />
        {/* Unchecked shows a faint tick, as in the mockup. */}
        <motion.path
          d="M11.5 18.5l4.5 4.5 8.5-9"
          fill="none"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ stroke: checked ? 'var(--on-accent)' : 'var(--ink-3)' }}
          transition={{ duration: checked ? 0.2 : 0.15 }}
        />
      </svg>
    </button>
  );
}
