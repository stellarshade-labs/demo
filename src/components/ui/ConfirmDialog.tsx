import { useEffect, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Portal } from './Portal';
import { Button } from './Button';

/**
 * In-system replacement for window.confirm. Same overlay conventions as the
 * other modals (Portal, dim + blur, Escape closes, scroll lock) so destructive
 * actions stay inside the design system instead of dropping to browser chrome.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div
          className="animate-shade-fade absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
          onClick={onCancel}
        />
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label={title}
          className="animate-shade-rise relative w-full max-w-sm border border-ink-700 bg-ink-850 p-5 shadow-2xl shadow-black/50"
        >
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex size-8 shrink-0 items-center justify-center border ${
                tone === 'danger'
                  ? 'border-signal-bad/40 bg-signal-bad/10 text-signal-bad'
                  : 'border-copper-600 bg-copper-500/10 text-copper-400'
              }`}
            >
              <TriangleAlert className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink-50">{title}</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">{body}</p>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={tone === 'danger' ? 'danger' : 'primary'}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
