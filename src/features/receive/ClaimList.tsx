import { useEffect, useState } from 'react';
import { Radio, ShieldCheck } from 'lucide-react';
import type { Payment } from 'stellar-shade';
import { stealthClient } from '@/lib/shade';
import { NETWORK } from '@/config/network';
import { toUserMessage } from '@/lib/errors';
import { assetLabel, formatAmount, looksLikeStellarAddress, timeAgo, truncate } from '@/lib/format';
import { useServiceHealth } from '@/lib/useServiceHealth';
import { useWallet } from '@/wallet/WalletProvider';
import { useIdentity } from '@/identity/IdentityProvider';
import { useIdentityStore } from '@/identity/identityStore';
import { useSession } from '@/store/session';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { EmptyState, Notice, Skeleton, TxResult } from '@/components/ui/Status';
import { useScanContext } from '@/stealth/ScanProvider';

/** Progress of an in-flight "Claim all" run. */
interface ClaimAllProgress {
  done: number;
  total: number;
  succeeded: number;
  failed: number;
}

export function ClaimList() {
  const scan = useScanContext();
  const { signTransaction } = useWallet();
  const { keys, payoutAddress, payoutSecret } = useIdentity();
  const useRelayerByDefault = useIdentityStore((s) => s.settings.useRelayerByDefault);
  const claimDestination = useIdentityStore((s) => s.settings.claimDestination);
  const addTx = useSession((s) => s.addTx);
  const updateTx = useSession((s) => s.updateTx);

  const health = useServiceHealth();
  const [claiming, setClaiming] = useState<string | null>(null);
  // Rows fade out for a beat before markClaimed removes them from `available`.
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [claimingAll, setClaimingAll] = useState(false);
  // Claiming everything at once is the most deanonymizing action here, so the
  // Claim-all button opens an inline privacy warning first rather than running.
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [progress, setProgress] = useState<ClaimAllProgress | null>(null);
  const [relayerOptIn, setRelayerOptIn] = useState(useRelayerByDefault);
  // Per-payment "send to a different address" overrides, keyed by stealth
  // address. The matching row's toggle-link reveals the input.
  const [destOverrides, setDestOverrides] = useState<Record<string, string>>({});
  const [showOverride, setShowOverride] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<
    { status: 'success' | 'error'; message: string; txHash?: string } | null
  >(null);

  // Wallet-free identities have no external signer, so the relayer (or the
  // payout secret paying its own fee) is how their claims reach the chain.
  const walletFree = Boolean(payoutSecret);

  // A credit-gated relayer needs a prepaid funding account and a signed
  // proof-of-control that this demo doesn't carry, so relaying is simply not
  // available against one — better to say so than to fail at claim time.
  const relayerAvailable = health.relayer === 'ok' && !health.relayerRequiresCredit;
  const useRelayer = relayerOptIn && relayerAvailable;

  // Global default sweep destination: the configured claim destination, or the
  // active identity's own payout address when it's blank.
  const defaultDest = claimDestination.trim() || payoutAddress || '';

  // Resolve the destination for one payment: a valid per-payment override wins,
  // otherwise fall back to the global default. Invalid overrides fall through to
  // `defaultDest` here; the row separately flags them and disables its button.
  const resolveDest = (p: Payment): string => {
    const raw = destOverrides[p.stealthAddress]?.trim();
    return raw && looksLikeStellarAddress(raw) ? raw : defaultDest;
  };

  // Whether a row carries a non-empty but malformed override — used to block the
  // row's own Claim and to skip it in Claim-all.
  const overrideInvalid = (p: Payment): boolean => {
    const raw = destOverrides[p.stealthAddress]?.trim();
    return Boolean(raw) && !looksLikeStellarAddress(raw);
  };

  const available = scan.payments.filter((p) => !scan.claimed.has(p.stealthAddress));

  // The single claim path, shared by the per-row button and "Claim all". Marks
  // the payment claimed and records the tx on success; returns whether it worked
  // so the batch runner can tally results without racing on shared UI state.
  const claimOne = async (payment: Payment): Promise<boolean> => {
    if (!keys || !payoutAddress) return false;

    // Where the funds land: a per-payment override, else the global default.
    const dest = resolveDest(payment);

    const txId = addTx({
      kind: 'claim',
      status: 'pending',
      amount: payment.amount,
      asset: assetLabel(payment),
      stealthAddress: payment.stealthAddress,
      counterparty: dest,
    });

    try {
      const receipt = await stealthClient.claim(payment, dest, {
        keys,
        ...(walletFree
          ? // Self-custodied payout: sponsor via the relayer when we can, else
            // pay the fee directly from the payout secret.
            useRelayer
            ? { relay: NETWORK.relayerUrl }
            : { feePayer: payoutSecret! }
          : // Wallet payout: the wallet is the fee payer and external signer.
            {
              signTransaction,
              feePayerAddress: payoutAddress,
              ...(useRelayer ? { relay: NETWORK.relayerUrl } : {}),
            }),
      });

      updateTx(txId, { status: 'success', txHash: receipt.txHash });
      setLeaving((s) => new Set(s).add(payment.stealthAddress));
      window.setTimeout(() => scan.markClaimed(payment.stealthAddress), 320);
      return true;
    } catch (err) {
      const message = toUserMessage(err);
      updateTx(txId, { status: 'error', error: message });
      // Bubble the message up for the single-claim path.
      throw new Error(message);
    }
  };

  const handleClaim = async (payment: Payment) => {
    if (!keys || !payoutAddress) return;
    // A malformed override must be fixed first; the button is already disabled,
    // this just guards the path.
    if (overrideInvalid(payment)) return;
    setClaiming(payment.stealthAddress);
    setResult(null);
    try {
      await claimOne(payment);
      setResult({
        status: 'success',
        message: `Claimed ${formatAmount(payment.amount)} ${assetLabel(payment)} to your account.`,
      });
    } catch (err) {
      setResult({ status: 'error', message: toUserMessage(err) });
    } finally {
      setClaiming(null);
    }
  };

  const handleClaimAll = async () => {
    if (!keys || !payoutAddress) return;
    // Snapshot now: `available` recomputes as each claim marks its payment, and
    // we want a stable batch to walk sequentially. Skip rows whose override is
    // malformed — they'd resolve to the default, which isn't what the user typed.
    const batch = available.filter((p) => !overrideInvalid(p));
    if (batch.length === 0) return;

    setConfirmingAll(false);
    setClaimingAll(true);
    setResult(null);
    setProgress({ done: 0, total: batch.length, succeeded: 0, failed: 0 });

    let succeeded = 0;
    let failed = 0;
    for (let i = 0; i < batch.length; i++) {
      try {
        await claimOne(batch[i]);
        succeeded += 1;
      } catch {
        failed += 1;
      }
      setProgress({ done: i + 1, total: batch.length, succeeded, failed });
    }

    setClaimingAll(false);
    setProgress(null);
    setResult(
      failed === 0
        ? {
            status: 'success',
            message: `Claimed all ${succeeded} payment${succeeded === 1 ? '' : 's'} to your account.`,
          }
        : {
            status: succeeded > 0 ? 'success' : 'error',
            message: `Claimed ${succeeded} of ${batch.length}; ${failed} failed. You can retry the rest.`,
          },
    );
  };

  const busyAny = claiming !== null || claimingAll;

  if (scan.cold && scan.payments.length === 0) {
    return (
      <div className="space-y-px">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[68px]" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {result && (
        <div key={`${result.status}:${result.message}`} className="animate-shade-rise p-5 pb-0">
          <TxResult
            status={result.status}
            message={result.message}
            txHash={result.txHash}
            onDismiss={() => setResult(null)}
          />
        </div>
      )}

      {scan.error && (
        <div className="border-b border-signal-bad/30 bg-signal-bad/5 px-5 py-3 text-[13px] text-signal-bad">
          {scan.error}
        </div>
      )}

      {available.length === 0 ? (
        <div>
          <EmptyState
            icon={<Radio className="animate-shade-pulse size-6" />}
            title="Nothing waiting"
            description="Payments sent to your meta-address will appear here once the ledger closes. Share your meta-address or publish it to get started."
          />
          <LastSynced at={scan.lastSyncedAt} loading={scan.loading} />
        </div>
      ) : (
        <>
          {available.length > 1 && (
            <div className="border-b border-ink-700">
              <div className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="text-[13px] text-ink-400">
                  {claimingAll && progress
                    ? `Claiming ${progress.done}/${progress.total}…`
                    : `${available.length} payments waiting`}
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  loading={claimingAll}
                  disabled={busyAny}
                  onClick={() => setConfirmingAll(true)}
                >
                  Claim all
                </Button>
              </div>

              {claimingAll && progress && (
                <div className="h-0.5 bg-ink-700" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
                  <div
                    className="h-full bg-copper-500 transition-all duration-300 ease-out"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
              )}

              {confirmingAll && !claimingAll && (
                <div className="animate-shade-rise px-5 pb-4">
                  <Notice tone="warn">
                    <p className="font-medium text-signal-wait">Claiming all at once reduces your privacy.</p>
                    <p className="mt-1.5 text-ink-300">
                      Claiming links these payments to your account, and doing them together lets an
                      on-chain observer group them as yours by their shared timing. For better
                      privacy, claim separately and spread them over time.
                    </p>
                    <p className="mt-1.5 text-ink-300">
                      {relayerAvailable
                        ? useRelayer
                          ? 'Submit through relayer is on, which hides your IP and fee-payer link.'
                          : 'Consider enabling Submit through relayer below first: it hides your IP and the fee-payer link.'
                        : 'The relayer, which would hide your IP and fee-payer link, is unavailable right now.'}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setConfirmingAll(false)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busyAny}
                        onClick={handleClaimAll}
                      >
                        Claim all anyway
                      </Button>
                    </div>
                  </Notice>
                </div>
              )}
            </div>
          )}
          <ul className="divide-y divide-ink-700">
            {available.map((payment) => {
              const busy = claiming === payment.stealthAddress;
              const addr = payment.stealthAddress;
              const overrideRaw = destOverrides[addr]?.trim() ?? '';
              const invalid = overrideInvalid(payment);
              const dest = resolveDest(payment);
              const external = dest !== payoutAddress;
              // Account-method token claims land in a claimable balance the
              // destination must already hold a trustline for; pools don't.
              const needsTrustline =
                external && payment.method === 'account' && payment.token !== 'native';
              const open = showOverride[addr] ?? false;
              const isNew = scan.lastNewPayments.some((n) => n.stealthAddress === addr);
              const isLeaving = leaving.has(addr);
              return (
                <li
                  key={`${addr}:${payment.token}`}
                  className={`px-4 py-4 transition-all duration-300 hover:bg-ink-800/40 sm:px-5 ${
                    isNew ? 'animate-shade-flash' : ''
                  } ${isLeaving ? 'pointer-events-none -translate-y-1 opacity-0' : ''}`}
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <ShieldCheck className="size-4 shrink-0 text-copper-500" />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm font-medium text-ink-50">
                        {formatAmount(payment.amount)}{' '}
                        <span className="text-ink-400">{assetLabel(payment)}</span>
                      </div>
                      <div className="mt-0.5 truncate font-mono text-xs text-ink-500">
                        at {truncate(addr, 8, 6)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      loading={busy}
                      disabled={(busyAny && !busy) || invalid}
                      onClick={() => handleClaim(payment)}
                    >
                      Claim
                    </Button>
                  </div>

                  <div className="mt-2 pl-8">
                    <button
                      type="button"
                      className="text-xs text-ink-500 underline decoration-ink-700 underline-offset-2 transition-colors hover:text-copper-400"
                      onClick={() =>
                        setShowOverride((s) => ({ ...s, [addr]: !open }))
                      }
                    >
                      {open ? 'Claim to my account' : 'Send to a different address'}
                    </button>

                    {open && (
                      <div className="mt-2 space-y-2">
                        <Field
                          label="Destination address"
                          mono
                          placeholder="G…"
                          value={destOverrides[addr] ?? ''}
                          error={invalid ? 'Enter a valid Stellar G-address.' : undefined}
                          onChange={(e) =>
                            setDestOverrides((s) => ({ ...s, [addr]: e.target.value }))
                          }
                        />
                        {external && !invalid && (
                          <p className="text-xs leading-relaxed text-ink-500">
                            Claiming to {truncate(dest, 8, 6)} sends these funds out of your own
                            account.
                          </p>
                        )}
                        {needsTrustline && !invalid && (
                          <Notice tone="warn">
                            The destination must already hold a trustline for{' '}
                            {assetLabel(payment)}, or this claim will fail on-chain.
                          </Notice>
                        )}
                      </div>
                    )}

                    {/* When the row is collapsed but the global default still
                        points somewhere external, surface the caveats too. */}
                    {!open && overrideRaw === '' && external && (
                      <p className="mt-2 text-xs leading-relaxed text-ink-500">
                        Claiming to {truncate(dest, 8, 6)} sends these funds out of your own account.
                      </p>
                    )}
                    {!open && overrideRaw === '' && needsTrustline && (
                      <div className="mt-2">
                        <Notice tone="warn">
                          The destination must already hold a trustline for {assetLabel(payment)}, or
                          this claim will fail on-chain.
                        </Notice>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-700 px-5 py-3">
        {/* Only offered when the relayer can actually take the claim — an
            unusable disabled row is noise, not information. */}
        {relayerAvailable ? (
          <label
            className="flex cursor-pointer items-center gap-2 text-xs text-ink-400"
            title="Submit via the relayer instead of paying the fee directly."
          >
            <input
              type="checkbox"
              checked={useRelayer}
              disabled={!relayerAvailable}
              onChange={(e) => setRelayerOptIn(e.target.checked)}
              className="size-3.5 accent-[#c8763c]"
            />
            <Radio className="size-3" />
            Submit through relayer
            <span className="text-ink-600">
              {walletFree
                ? ' — sponsors the fee, no wallet needed'
                : ' — hides your IP and fee-payer link'}
            </span>
          </label>
        ) : (
          <span />
        )}
        <span className="font-mono text-[10px] text-ink-600">
          {scan.loading
            ? 'scanning…'
            : scan.lastSyncedAt
              ? `synced ${timeAgo(scan.lastSyncedAt)}`
              : 'not scanned'}
        </span>
      </div>
    </div>
  );
}

/**
 * Quiet "the engine is running" line for the empty state: last sync time that
 * actually ticks, so the 45s auto-scan reads as presence instead of absence.
 */
function LastSynced({ at, loading }: { at: number | null; loading: boolean }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 10_000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <p className="border-t border-ink-700 px-5 py-2.5 text-center font-mono text-[10px] uppercase tracking-wider text-ink-500">
      {loading ? 'scanning the ledger…' : at ? `watching for payments · last checked ${timeAgo(at)}` : 'watching for payments'}
    </p>
  );
}
