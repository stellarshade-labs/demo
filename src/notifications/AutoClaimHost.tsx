import { useEffect, useRef } from 'react';
import type { Payment } from 'stellar-shade';
import { stealthClient } from '@/lib/shade';
import { NETWORK } from '@/config/network';
import { assetLabel } from '@/lib/format';
import { toUserMessage } from '@/lib/errors';
import { useServiceHealth } from '@/lib/useServiceHealth';
import { useIdentity } from '@/identity/IdentityProvider';
import { useSession } from '@/store/session';
import { useScanContext } from '@/stealth/ScanProvider';
import { useNotifyStore } from './notifyStore';

/**
 * Non-interactive auto-claim.
 *
 * When enabled, each newly-detected payment is claimed after a RANDOM delay
 * drawn uniformly from [minMinutes, maxMinutes]. The randomness is the whole
 * point: it decorrelates *when* you claim from *when* the payment arrived, so an
 * on-chain observer can't link sender -> receiver by matching timestamps. (See
 * the mandatory privacy warning in NotificationsSettings — claiming at all ties
 * a payment to your payout account; the delay only mitigates timing.)
 *
 * Auto-claim runs UNATTENDED, so it can only use claim paths that need no
 * interactive signing: a self-custodied `payoutSecret` (pays its own fee) or the
 * relayer (sponsors the fee, and hides IP/fee-payer — preferred). A wallet
 * identity with no relayer cannot auto-claim; this host stays dormant and the
 * settings UI disables the toggle.
 *
 * Timers are in-memory only: if the tab closes with claims still pending, they
 * are simply lost and re-scheduled the next time the payment is re-detected
 * (`lastNewPayments` re-includes anything not yet claimed after a from-scratch
 * or fresh scan). We de-dupe by stealth address so a payment is never scheduled
 * twice while a timer is already live.
 *
 * SCOPE: POOL payments only. The non-interactive claim path here (relayer or
 * `feePayer` from the payout secret) is pool-shaped — `ClaimOpts.feePayer` is
 * documented "pool method direct submission". Account-method claims are
 * method-specific and fragile unattended (native = an AccountMerge sweep; token
 * = a claimable-balance claim needing `sponsored` + a destination trustline), so
 * we deliberately skip them; they remain manual claims on the Receive page.
 * Notifications are NOT restricted this way — they fire for all new payments.
 */

/** Whether this identity can claim without an interactive wallet signature. */
export function canAutoClaim(payoutSecret: string | null, relayerAvailable: boolean): boolean {
  return Boolean(payoutSecret) || relayerAvailable;
}

export function AutoClaimHost() {
  const scan = useScanContext();
  const { keys, payoutAddress, payoutSecret } = useIdentity();
  const health = useServiceHealth();
  const autoClaim = useNotifyStore((s) => s.autoClaim);
  const addTx = useSession((s) => s.addTx);
  const updateTx = useSession((s) => s.updateTx);

  const relayerAvailable = health.relayer === 'ok' && !health.relayerRequiresCredit;
  const eligible = canAutoClaim(payoutSecret, relayerAvailable);

  // Stealth addresses with a live (or in-flight) auto-claim, so we never double
  // schedule the same payment across overlapping scans.
  const scheduledRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Keep the volatile bits reachable from inside a fired timer without making the
  // timer's identity depend on them (a timer set 2h ago must still see fresh
  // relayer availability / keys at fire time).
  const ctxRef = useRef({
    keys,
    payoutAddress,
    payoutSecret,
    relayerAvailable,
    addTx,
    updateTx,
    markClaimed: scan.markClaimed,
  });
  ctxRef.current = {
    keys,
    payoutAddress,
    payoutSecret,
    relayerAvailable,
    addTx,
    updateTx,
    markClaimed: scan.markClaimed,
  };

  const runClaim = async (payment: Payment) => {
    const {
      keys,
      payoutAddress,
      payoutSecret,
      relayerAvailable,
      addTx,
      updateTx,
      markClaimed,
    } = ctxRef.current;

    // Re-check at fire time: keys may have locked, or the relayer gone away.
    if (!keys || !payoutAddress) {
      scheduledRef.current.delete(payment.stealthAddress);
      return;
    }
    if (!payoutSecret && !relayerAvailable) {
      // No non-interactive path anymore — drop it so a later scan can retry.
      scheduledRef.current.delete(payment.stealthAddress);
      return;
    }

    const txId = addTx({
      kind: 'claim',
      status: 'pending',
      amount: payment.amount,
      asset: assetLabel(payment),
      stealthAddress: payment.stealthAddress,
      counterparty: payoutAddress,
    });

    try {
      const receipt = await stealthClient.claim(payment, payoutAddress, {
        keys,
        // Prefer the relayer: it hides IP + fee-payer link. Fall back to paying
        // the fee directly from the payout secret.
        ...(relayerAvailable
          ? { relay: NETWORK.relayerUrl }
          : { feePayer: payoutSecret! }),
      });
      updateTx(txId, { status: 'success', txHash: receipt.txHash });
      markClaimed(payment.stealthAddress);
    } catch (err) {
      updateTx(txId, { status: 'error', error: toUserMessage(err) });
      // Free the slot so the payment can be re-scheduled on a future detection.
      scheduledRef.current.delete(payment.stealthAddress);
    }
  };

  // React to freshly-detected payments. Depends on `scanTick` so it fires once
  // per completed scan.
  useEffect(() => {
    if (!autoClaim.enabled || !eligible) return;
    if (scan.lastNewPayments.length === 0) return;

    const min = Math.max(0, autoClaim.minMinutes);
    const max = Math.max(min, autoClaim.maxMinutes);

    for (const payment of scan.lastNewPayments) {
      // Pool payments only — the non-interactive claim path is pool-shaped.
      // Account-method payments stay as manual claims on the Receive page.
      if (payment.method !== 'pool') continue;
      const addr = payment.stealthAddress;
      if (scan.claimed.has(addr)) continue;
      if (scheduledRef.current.has(addr)) continue;
      scheduledRef.current.add(addr);

      // Uniform random delay in [min, max] minutes -> ms.
      const delayMs = (min + Math.random() * (max - min)) * 60_000;
      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        void runClaim(payment);
      }, delayMs);
      timersRef.current.add(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan.scanTick, autoClaim.enabled, eligible]);

  // Clear every pending timer on unmount so we don't fire against a torn-down
  // context (React StrictMode double-mount, or the app closing).
  useEffect(() => {
    const timers = timersRef.current;
    const scheduled = scheduledRef.current;
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      scheduled.clear();
    };
  }, []);

  return null;
}
