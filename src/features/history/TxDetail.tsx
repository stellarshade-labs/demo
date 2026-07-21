import { useEffect, type ReactNode } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import type { TxRecord } from '@/store/session';
import { explorerTxUrl } from '@/config/network';
import { Portal } from '@/components/ui/Portal';
import { CopyField } from '@/components/ui/CopyField';
import { StatusDot } from '@/components/ui/Status';
import { KIND_META } from './HistoryPage';

/** One labelled row of the receipt. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="label-eyebrow">{label}</dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}

/**
 * Read-only receipt for a single transaction from the local history. Mirrors the
 * WalletModal recipe (Portal + overlay + panel + Escape/scroll-lock) so the two
 * dialogs behave identically.
 */
export function TxDetail({ tx, onClose }: { tx: TxRecord | null; onClose: () => void }) {
  useEffect(() => {
    if (!tx) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [tx, onClose]);

  if (!tx) return null;

  const { label, Icon } = KIND_META[tx.kind];
  const state = tx.status === 'success' ? 'ok' : tx.status === 'pending' ? 'wait' : 'bad';

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Transaction detail"
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
      >
        <div className="animate-shade-fade fixed inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} />

        <div className="animate-shade-rise relative my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col border border-ink-700 bg-ink-850 shadow-2xl shadow-black/60">
          <header className="flex shrink-0 items-center justify-between border-b border-ink-700 px-5 py-4">
            <div>
              <div className="label-eyebrow">Transaction</div>
              <h2 className="mt-0.5 text-[15px] font-semibold text-ink-50">{label}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-ink-500 transition-colors hover:text-ink-100"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </header>

          <dl className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            <Row label="Kind">
              <span className="flex items-center gap-2 text-sm text-ink-100">
                <Icon className="size-4 shrink-0 text-ink-500" />
                {label}
              </span>
            </Row>

            <Row label="Status">
              <span className="flex items-center gap-2 text-sm text-ink-100">
                <StatusDot state={state} />
                <span className="capitalize">{tx.status}</span>
              </span>
            </Row>

            {tx.amount !== undefined && (
              <Row label="Amount">
                <span className="font-mono text-sm text-ink-50">
                  {tx.amount} <span className="text-ink-400">{tx.asset ?? 'XLM'}</span>
                </span>
              </Row>
            )}

            {tx.counterparty && (
              <Row label="Counterparty">
                <CopyField value={tx.counterparty} />
              </Row>
            )}

            {tx.stealthAddress && (
              <Row label="Stealth address">
                <CopyField value={tx.stealthAddress} />
              </Row>
            )}

            {tx.txHash && (
              <Row label="Transaction hash">
                <div className="space-y-1.5">
                  <CopyField value={tx.txHash} />
                  <a
                    href={explorerTxUrl(tx.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs text-ink-400 transition-colors hover:text-copper-400"
                  >
                    View on explorer
                    <ArrowUpRight className="size-3" />
                  </a>
                </div>
              </Row>
            )}

            <Row label="Created">
              <span className="text-sm text-ink-100">{new Date(tx.createdAt).toLocaleString()}</span>
            </Row>

            {tx.error && (
              <Row label="Error">
                <div className="border border-signal-bad/40 bg-signal-bad/5 px-3 py-2.5 text-[13px] leading-relaxed text-signal-bad">
                  {tx.error}
                </div>
              </Row>
            )}
          </dl>

          <footer className="shrink-0 border-t border-ink-700 px-5 py-3">
            <span className="font-mono text-[10px] text-ink-600">{tx.id}</span>
          </footer>
        </div>
      </div>
    </Portal>
  );
}
