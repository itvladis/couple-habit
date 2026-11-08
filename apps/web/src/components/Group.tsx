import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="px-1 text-[12px] font-semibold tracking-[0.04em] text-ink-2">{children}</h2>;
}

/** Rounded card of rows with hairline separators, as in the profile mockup. */
export function Group({ label, children }: { label?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      {label && <SectionLabel>{label}</SectionLabel>}
      <div className="overflow-hidden rounded-[20px] border border-line bg-surface">{children}</div>
    </section>
  );
}

interface RowProps {
  lead?: ReactNode;
  title: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  accent?: string;
  trailing?: ReactNode;
}

export function Row({ lead, title, value, onClick, chevron = Boolean(onClick), accent, trailing }: RowProps) {
  const content = (
    <>
      {lead}
      <span className="min-w-0 flex-1 truncate text-[16px]" style={accent ? { color: accent } : undefined}>
        {title}
      </span>
      {value !== undefined && <span className="shrink-0 truncate text-[15px] text-ink-2">{value}</span>}
      {trailing}
      {chevron && <ChevronRight size={16} className="shrink-0 text-ink-3" aria-hidden />}
    </>
  );
  const className = 'flex w-full items-center gap-3 border-b border-line px-3.5 py-[11px] text-left last:border-b-0';
  return onClick ? (
    <button type="button" onClick={onClick} className={`press ${className}`}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function Tile({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg text-[#0a0a0b]" style={{ background: color }}>
      {children}
    </span>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${on ? 'bg-[var(--h-green)]' : 'bg-surface-2'}`}
    >
      <span
        className="absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.15)] transition-transform duration-200 ease-[var(--ease-out-quint)]"
        style={{ transform: on ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  );
}
