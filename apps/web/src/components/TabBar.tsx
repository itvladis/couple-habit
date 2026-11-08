import { Activity, House, User } from 'lucide-react';
import { motion } from 'motion/react';
import { useI18n } from '../lib/i18n';
import { haptic } from '../lib/telegram';

export type Tab = 'home' | 'feed' | 'profile';

const ITEMS = [
  { tab: 'home', Icon: House },
  { tab: 'feed', Icon: Activity },
  { tab: 'profile', Icon: User },
] as const;

/**
 * Floating glass tab bar. Spec: content switches instantly; only the active pill slides
 * (spring, bounce 0, 0.3 s).
 */
export function TabBar({ active, onChange, badge }: { active: Tab; onChange: (tab: Tab) => void; badge?: Partial<Record<Tab, boolean>> }) {
  const { t } = useI18n();
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-10 h-[130px]"
        style={{ background: 'linear-gradient(180deg, transparent, color-mix(in srgb, var(--base) 85%, transparent) 55%, var(--base))' }}
      />
      <nav
        aria-label={t.tabs.label}
        className="fixed left-1/2 z-20 flex h-[62px] w-[300px] -translate-x-1/2 items-center justify-between rounded-[31px] border border-line bg-tabbar px-2.5 shadow-[0_10px_30px_var(--shadow)] backdrop-blur-xl"
        style={{ bottom: 'calc(max(var(--safe-bottom), 12px) + 12px)' }}
      >
        {ITEMS.map(({ tab, Icon }) => {
          const on = tab === active;
          return (
            <button
              key={tab}
              type="button"
              aria-current={on ? 'page' : undefined}
              onClick={() => {
                if (!on) haptic.selection();
                onChange(tab);
              }}
              className={`press relative flex w-[86px] flex-col items-center gap-0.5 rounded-3xl py-1.5 ${on ? 'text-ink' : 'text-ink-3'}`}
            >
              {on && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-3xl bg-surface-2"
                  transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                />
              )}
              <span className="relative">
                <Icon size={22} strokeWidth={2} aria-hidden />
                {badge?.[tab] && <span aria-hidden className="absolute -top-0.5 -right-1 size-2 rounded-full bg-[var(--h-coral)]" />}
              </span>
              <span className="relative text-[10px] font-medium">{t.tabs[tab]}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
