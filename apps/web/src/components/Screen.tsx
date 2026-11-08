import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '../lib/i18n';
import { hasNativeBackButton } from '../lib/telegram';

interface Props {
  children: ReactNode;
  /** Set on pushed screens; outside Telegram (no native back button) the screen draws its own. */
  onBack?: () => void;
  /** Leaves room for the floating tab bar. */
  withTabBar?: boolean;
}

export function Screen({ children, onBack, withTabBar }: Props) {
  const { t } = useI18n();
  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col gap-4 px-4"
      style={{
        paddingTop: 'calc(var(--safe-top) + 12px)',
        paddingBottom: withTabBar ? 'calc(max(var(--safe-bottom), 12px) + 96px)' : 'calc(var(--safe-bottom) + 24px)',
      }}
    >
      {onBack && !hasNativeBackButton() && (
        <button type="button" onClick={onBack} className="press -mb-1 flex w-fit items-center gap-1 rounded-2xl bg-surface-2 py-1.5 pr-3 pl-2 text-[14px] font-medium">
          <ChevronLeft size={16} aria-hidden />
          {t.common.back}
        </button>
      )}
      {children}
    </main>
  );
}

export function PageTitle({ kicker, title, action }: { kicker?: string; title: string; action?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        {kicker && <p className="text-[13px] font-semibold tracking-[0.02em] text-ink-2">{kicker}</p>}
        <h1 className="truncate text-[32px] leading-10 font-bold tracking-[-0.02em]">{title}</h1>
      </div>
      {action}
    </header>
  );
}
