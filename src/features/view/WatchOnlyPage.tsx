import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Inbox, Loader2, RefreshCw, ShieldOff } from 'lucide-react';
import type { Payment } from 'stellar-shade';
import { stealthClient } from '@/lib/shade';
import { toUserMessage } from '@/lib/errors';
import { assetLabel, formatAmount, truncate, truncateMeta } from '@/lib/format';
import { parseViewExport, viewKeysToStealthKeys } from '@/lib/viewExport';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { EmptyState } from '@/components/ui/Status';
import { ShadeMark } from '@/components/layout/ShadeMark';
import { ThemeToggle } from '@/theme/ThemeToggle';

/**
 * Watch-only mode. Reachable at `/view` WITHOUT an unlocked identity (the gate is
 * bypassed in App). Paste a `shade:view:` string → we build a partial StealthKeys
 * carrying the view key + public spend key (NEVER the spend secret) → scan → list
 * detected payments read-only. Claiming is impossible here by design: there is no
 * spend authority, and the UI makes that explicit.
 */
export function WatchOnlyPage() {
  const [input, setInput] = useState('');
  const [meta, setMeta] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = async (raw: string) => {
    const parsed = parseViewExport(raw);
    if (!parsed) {
      setError('That is not a valid Shade view key. It should start with "shade:view:".');
      setPayments(null);
      setMeta(null);
      return;
    }
    setError(null);
    setScanning(true);
    setMeta(parsed.metaAddress);
    try {
      const keys = viewKeysToStealthKeys(parsed);
      const result = await stealthClient.scanWithCursor(keys);
      setPayments(result.payments);
    } catch (err) {
      setError(toUserMessage(err));
      setPayments(null);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-950">
      <header className="border-b border-ink-700">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <ShadeMark className="size-6 text-copper-500" />
            <span className="text-lg font-bold tracking-tight text-ink-50">Shade</span>
            <span className="ml-1 inline-flex items-center gap-1 border border-ink-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              <Eye className="size-2.5" />
              Watch-only
            </span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-5 py-10">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink-50">Watch an identity</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">
            Paste a Shade view key (<code className="font-mono text-ink-300">shade:view:…</code>) to
            watch for incoming payments without unlocking a wallet. A view key can see payments but
            can never spend them.
          </p>
        </div>

        <Panel eyebrow="Import" title="View key">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void scan(input);
            }}
          >
            <Field
              label="Shade view key"
              placeholder="shade:view:…"
              mono
              autoComplete="off"
              spellCheck={false}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              error={error}
            />
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={scanning}
              disabled={!input.trim()}
              icon={<Eye className="size-4" />}
            >
              Scan for payments
            </Button>
          </form>
        </Panel>

        {meta && !error && (
          <Panel
            eyebrow="Watching"
            title={truncateMeta(meta)}
            action={
              <Button
                size="sm"
                variant="secondary"
                loading={scanning}
                icon={<RefreshCw className="size-3.5" />}
                onClick={() => void scan(input)}
              >
                Rescan
              </Button>
            }
            bodyClassName="p-0"
          >
            <div className="border-b border-signal-wait/30 bg-signal-wait/5 px-5 py-3 text-[13px] text-signal-wait">
              <div className="flex items-center gap-2">
                <ShieldOff className="size-3.5 shrink-0" />
                Watch-only — no spend key. You can see these payments but can't claim them here.
              </div>
            </div>

            {scanning && payments === null ? (
              <div className="flex items-center justify-center gap-2 px-5 py-12 text-[13px] text-ink-400">
                <Loader2 className="size-4 animate-spin" />
                Scanning the ledger…
              </div>
            ) : payments && payments.length > 0 ? (
              <ul className="divide-y divide-ink-700">
                {payments.map((payment) => (
                  <li
                    key={`${payment.stealthAddress}:${payment.token}`}
                    className="flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5"
                  >
                    <Eye className="size-4 shrink-0 text-ink-500" />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm font-medium text-ink-50">
                        {formatAmount(payment.amount)}{' '}
                        <span className="text-ink-400">{assetLabel(payment)}</span>
                      </div>
                      <div className="mt-0.5 truncate font-mono text-xs text-ink-500">
                        at {truncate(payment.stealthAddress, 8, 6)}
                      </div>
                    </div>
                    <span
                      className="shrink-0 cursor-not-allowed whitespace-nowrap border border-ink-700 px-2.5 py-1 text-[11px] font-medium text-ink-600"
                      title="Watch-only mode has no spend key, so claiming is disabled."
                    >
                      Claim disabled
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<Inbox className="size-6" />}
                title="Nothing found"
                description="No payments have landed at this identity's stealth addresses yet."
              />
            )}
          </Panel>
        )}

        <div className="text-center">
          <Link
            to="/"
            className="text-[13px] text-ink-400 underline decoration-ink-600 underline-offset-2 hover:text-copper-400"
          >
            ← Back to Shade
          </Link>
        </div>
      </main>
    </div>
  );
}
