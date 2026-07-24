import { useEffect, useState } from 'react';
import { ArrowUpRight, RefreshCw, X } from 'lucide-react';
import { useWallet } from '@/wallet/WalletProvider';
import { useAvailability } from '@/wallet/useAvailability';
import { Portal } from '@/components/ui/Portal';
import type { WalletConnector } from '@/wallet/types';
import { toUserMessage } from '@/lib/errors';

export function WalletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { connectors, connect } = useWallet();
  const { availability, probing, recheck } = useAvailability(connectors);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-probe whenever the modal opens: an extension may have been installed, or
  // finished injecting, since the last look.
  useEffect(() => {
    if (open) recheck();
  }, [open, recheck]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setPending(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleConnect = async (c: WalletConnector) => {
    setPending(c.id);
    setError(null);

    try {
      await connect(c.id);
      onClose();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setPending(null);
    }
  };

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a wallet"
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
      >
        <div className="fixed inset-0 bg-ink-950/80 backdrop-blur-sm" onClick={onClose} />

        <div className="relative my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col border border-ink-700 bg-ink-850 shadow-2xl shadow-black/60">
          <header className="flex shrink-0 items-center justify-between border-b border-ink-700 px-5 py-4">
            <div>
              <div className="label-eyebrow">Connect</div>
              <h2 className="mt-0.5 text-[15px] font-semibold text-ink-50">Choose a wallet</h2>
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

          <div className="min-h-0 flex-1 divide-y divide-ink-700 overflow-y-auto">
            {connectors.map((c) => {
              const installed = availability[c.id];
              const busy = pending === c.id;

              if (installed === false && !probing) {
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-ink-800"
                  >
                    <c.Icon className="size-5 text-ink-600" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-ink-400">{c.name}</div>
                      <div className="text-xs text-ink-500">Not detected</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleConnect(c)}
                      disabled={pending !== null}
                      className="shrink-0 text-xs text-copper-400 hover:text-copper-300 disabled:opacity-50"
                    >
                      Try anyway
                    </button>
                    <a
                      href={c.installUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-ink-600 hover:text-ink-300"
                      title={`Install ${c.name}`}
                    >
                      <ArrowUpRight className="size-3.5" />
                    </a>
                  </div>
                );
              }

              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy || pending !== null}
                  onClick={() => handleConnect(c)}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-ink-800 disabled:opacity-50"
                >
                  <c.Icon className="size-5 text-copper-400" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink-50">{c.name}</div>
                    <div className="text-xs text-ink-400">
                      {busy
                        ? 'Waiting for approval…'
                        : installed === undefined && probing
                          ? 'Looking for extension…'
                          : c.supportsSignMessage
                            ? 'Send and receive'
                            : 'Send only, cannot derive stealth keys'}
                    </div>
                  </div>
                  {busy && <span className="size-1.5 animate-shade-pulse rounded-full bg-copper-500" />}
                </button>
              );
            })}
          </div>

          {error && (
            <div className="shrink-0 border-t border-signal-bad/30 bg-signal-bad/5 px-5 py-3 text-[13px] text-signal-bad">
              {error}
            </div>
          )}

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-ink-700 px-5 py-3 text-xs leading-relaxed text-ink-500">
            <span className="min-w-0">
              Shade never sees your keys. Only your public address is stored in this browser.
            </span>
            <button
              type="button"
              onClick={recheck}
              disabled={probing}
              className="inline-flex shrink-0 items-center gap-1.5 text-ink-400 transition-colors hover:text-copper-400 disabled:opacity-50"
              title="Look for wallet extensions again"
            >
              <RefreshCw className={`size-3 ${probing ? 'animate-spin' : ''}`} />
              {probing ? 'Scanning' : 'Recheck'}
            </button>
          </footer>
        </div>
      </div>
    </Portal>
  );
}
