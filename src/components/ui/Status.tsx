import type { ReactNode } from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { TxStatus } from '@/store/session';
import { explorerTxUrl } from '@/config/network';
import { truncate } from '@/lib/format';

/** Health / liveness dot used in the top bar. */
export function StatusDot({
  state,
  className = '',
}: {
  state: 'ok' | 'wait' | 'bad' | 'idle';
  className?: string;
}) {
  const color =
    state === 'ok'
      ? 'bg-signal-ok'
      : state === 'wait'
        ? 'bg-signal-wait animate-shade-pulse'
        : state === 'bad'
          ? 'bg-signal-bad'
          : 'bg-ink-600';
  return <span className={`inline-block size-1.5 rounded-full ${color} ${className}`} />;
}

/** Inline banner for the result of a transaction. */
export function TxResult({
  status,
  message,
  txHash,
  onDismiss,
}: {
  status: TxStatus;
  message: ReactNode;
  txHash?: string;
  onDismiss?: () => void;
}) {
  const tone =
    status === 'success'
      ? 'border-signal-ok/40 bg-signal-ok/5 text-signal-ok'
      : status === 'error'
        ? 'border-signal-bad/40 bg-signal-bad/5 text-signal-bad'
        : 'border-signal-wait/40 bg-signal-wait/5 text-signal-wait';

  const Icon =
    status === 'success' ? CheckCircle2 : status === 'error' ? XCircle : Loader2;

  return (
    <div className={`flex items-start gap-3 border px-4 py-3 text-sm ${tone}`}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${status === 'pending' ? 'animate-spin' : ''}`} />
      <div className="min-w-0 flex-1">
        <div className="leading-relaxed break-words">{message}</div>
        {txHash && (
          <a
            href={explorerTxUrl(txHash)}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 inline-flex items-center gap-1 font-mono text-xs text-ink-300 underline decoration-ink-600 underline-offset-2 hover:text-copper-400"
          >
            {truncate(txHash, 10, 8)}
            <ArrowUpRight className="size-3" />
          </a>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-ink-500 hover:text-ink-100"
          aria-label="Dismiss"
        >
          <XCircle className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** Advisory strip, e.g. wallet on the wrong network. */
export function Notice({
  tone = 'warn',
  children,
}: {
  tone?: 'warn' | 'info';
  children: ReactNode;
}) {
  const styles =
    tone === 'warn'
      ? 'border-signal-wait/40 bg-signal-wait/5 text-signal-wait'
      : 'border-ink-700 bg-ink-900 text-ink-300';
  return (
    <div className={`flex items-start gap-3 border px-4 py-3 text-[13px] leading-relaxed ${styles}`}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-ink-800 animate-shade-sheen ${className}`} />
  );
}

/** Consistent empty state so blank panels never look broken. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-ink-600">{icon}</div>}
      <p className="text-sm font-medium text-ink-100">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-400">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
