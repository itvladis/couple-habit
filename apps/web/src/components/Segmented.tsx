import { motion } from 'motion/react';
import { useId } from 'react';
import { haptic } from '../lib/telegram';

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  label: string;
}

/** Segmented control from the mockups; the selected pill slides like the tab bar indicator. */
export function Segmented<T extends string>({ options, value, onChange, size = 'md', label }: Props<T>) {
  const group = useId();
  const small = size === 'sm';
  return (
    <div role="radiogroup" aria-label={label} className={`flex gap-0.5 bg-surface-2 p-[3px] ${small ? 'rounded-[10px]' : 'rounded-xl'}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              if (on) return;
              haptic.selection();
              onChange(o.value);
            }}
            className={`press relative ${small ? 'rounded-lg px-2.5 py-[5px] text-[12px]' : 'flex-1 rounded-[9px] px-2 py-2 text-[13px]'} ${on ? 'font-semibold text-ink' : 'font-medium text-ink-2'}`}
          >
            {on && (
              <motion.span
                layoutId={`seg-${group}`}
                className="absolute inset-0 rounded-[inherit] bg-selected shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              />
            )}
            <span className="relative whitespace-nowrap">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
