import { Flame } from 'lucide-react';
import { AnimatePresence, motion, useAnimate, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { haptic } from '../lib/telegram';

/** Streak lengths worth a small celebration (spec: the only place for "delight"). */
const RECORDS = new Set([7, 30, 100]);

/**
 * Spec: digits cross-fade with a 2 px blur in 200 ms and keep tabular widths so nothing jumps.
 * Reaching 7/30/100 for the first time this session springs the badge and buzzes once.
 */
export function StreakCount({ value, size = 13, label }: { value: number; size?: number; label: string }) {
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLSpanElement>();
  const highest = useRef(value);
  useEffect(() => {
    // Unchecking and checking again (7 → 6 → 7) must not celebrate twice.
    if (value <= highest.current) return;
    highest.current = value;
    if (!RECORDS.has(value)) return;
    haptic.success();
    if (!reduce && scope.current) {
      void animate(scope.current, { transform: ['scale(1)', 'scale(1.25)', 'scale(1)'] }, { type: 'spring', bounce: 0.2, duration: 0.4 });
    }
  }, [value, reduce, animate, scope]);
  return (
    <span ref={scope} role="img" aria-label={label} className="tabular inline-flex items-center gap-0.5 text-ink-2" style={{ fontSize: size }}>
      <Flame size={size} strokeWidth={2.2} aria-hidden />
      <span className="relative inline-grid" aria-hidden>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={value}
            initial={{ opacity: 0, filter: reduce ? 'blur(0px)' : 'blur(2px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, filter: reduce ? 'blur(0px)' : 'blur(2px)' }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="col-start-1 row-start-1"
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}
