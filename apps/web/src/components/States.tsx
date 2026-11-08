import type { ReactNode } from 'react';
import { useI18n } from '../lib/i18n';

export function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center py-20" role="status" aria-live="polite">
      <span className="size-6 animate-spin rounded-full border-2 border-ink-3 border-t-ink" />
    </div>
  );
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center" role="alert">
      <p className="text-[15px] text-ink-2">{message ?? t.common.error}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="press rounded-2xl bg-surface-2 px-4 py-2 text-[15px] font-semibold">
          {t.common.retry}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title?: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[24px] border border-dashed border-line px-6 py-10 text-center">
      {title && <p className="text-[17px] font-semibold">{title}</p>}
      <p className="max-w-[280px] text-[14px] text-ink-2">{text}</p>
      {action}
    </div>
  );
}
