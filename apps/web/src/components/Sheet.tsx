import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'motion/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../lib/i18n';
import { pushOverlay } from '../lib/telegram';

const SHEET_EASE = [0.32, 0.72, 0, 1] as const;
/** Spec: a flick faster than 0.11 px/ms closes the sheet (motion reports px/s). */
const DISMISS_VELOCITY = 110;
const DISMISS_DISTANCE = 140;

/** Nested sheets share one scroll lock; the page unlocks when the last one closes. */
let scrollLocks = 0;
function lockScroll(): () => void {
  if (scrollLocks++ === 0) document.documentElement.style.overflow = 'hidden';
  return () => {
    if (--scrollLocks === 0) document.documentElement.style.overflow = '';
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}

/**
 * iOS-style bottom sheet: slides up in 400 ms on the drawer curve, follows the finger from the
 * header, closes on a flick or a long pull, and rubber-bands when pulled past the top.
 * Telegram's Back button and Escape close the topmost sheet; focus moves in and comes back.
 */
export function Sheet({ open, onClose, title, left, right, children }: Props) {
  const reduce = useReducedMotion();
  const drag = useDragControls();
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const returnFocus = document.activeElement as HTMLElement | null;
    const unlock = lockScroll();
    const unregister = pushOverlay(() => closeRef.current());
    const frame = requestAnimationFrame(() => panel.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      unregister();
      unlock();
      returnFocus?.focus?.({ preventScroll: true });
    };
  }, [open]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.velocity.y > DISMISS_VELOCITY || info.offset.y > DISMISS_DISTANCE) onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40">
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: SHEET_EASE }}
            onClick={onClose}
          />
          <motion.section
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            // Telegram keeps --tg-viewport-height in sync with the keyboard, which iOS dvh does not.
            className="absolute inset-x-0 bottom-0 flex max-h-[calc(var(--tg-viewport-height,100dvh)-var(--safe-top)-48px)] flex-col rounded-t-[28px] bg-surface shadow-[0_-10px_40px_var(--shadow)] outline-none"
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={{ duration: reduce ? 0.2 : 0.4, ease: SHEET_EASE }}
            drag={reduce ? false : 'y'}
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.06, bottom: 1 }}
            dragTransition={{ bounceStiffness: 500, bounceDamping: 40 }}
            onDragEnd={onDragEnd}
          >
            <header className="shrink-0 cursor-grab touch-none px-4 pt-2 pb-3 select-none" onPointerDown={(e) => drag.start(e)}>
              <div className="mx-auto mb-3 h-[5px] w-9 rounded-full bg-ink-3" />
              {(title || left || right) && (
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="justify-self-start">{left}</div>
                  <h2 id={titleId} className="text-center text-[17px] font-semibold">
                    {title}
                  </h2>
                  <div className="justify-self-end">{right}</div>
                </div>
              )}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(24px+var(--safe-bottom))]">{children}</div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export interface SheetAction {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  icon?: ReactNode;
}

/** A sheet with a short list of actions (long-press menus, confirmations) and a Cancel button. */
export function ActionSheet({ open, onClose, title, actions }: { open: boolean; onClose: () => void; title?: ReactNode; actions: SheetAction[] }) {
  const { t } = useI18n();
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-col overflow-hidden rounded-[20px] border border-line bg-surface-2/40">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                onClose();
                a.onSelect();
              }}
              className={`press flex items-center gap-3 border-b border-line px-4 py-3.5 text-left text-[16px] last:border-b-0 ${a.destructive ? 'text-[var(--h-coral)]' : 'text-ink'}`}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="press rounded-[20px] bg-surface-2 py-3.5 text-[16px] font-semibold">
          {t.common.cancel}
        </button>
      </div>
    </Sheet>
  );
}

/**
 * State for a sheet that shows one item (a habit, a member): the item survives closing so the
 * sheet does not empty itself during its exit animation.
 */
export function useSheetItem<T>() {
  const [state, setState] = useState<{ item: T | null; open: boolean }>({ item: null, open: false });
  return {
    item: state.item,
    open: state.open,
    show: (item: T) => setState({ item, open: true }),
    close: () => setState((s) => ({ ...s, open: false })),
  };
}

