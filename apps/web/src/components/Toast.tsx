import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

const TOAST_MS = 2200;

const ToastContext = createContext<(message: string) => void>(() => {});

/** One short message at a time above the tab bar; a new one replaces the old. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ id: number; text: string } | null>(null);
  const timer = useRef<number | null>(null);
  const nextId = useRef(0);
  const show = useCallback((text: string) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setMessage({ id: ++nextId.current, text });
    timer.current = window.setTimeout(() => setMessage(null), TOAST_MS);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
        style={{ bottom: 'calc(max(var(--safe-bottom), 12px) + 88px)' }}
      >
        <AnimatePresence>
          {message && (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, transform: 'translateY(8px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              exit={{ opacity: 0, transform: 'translateY(8px)' }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="rounded-2xl bg-ink px-4 py-2.5 text-[14px] font-medium text-base shadow-lg"
            >
              {message.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
