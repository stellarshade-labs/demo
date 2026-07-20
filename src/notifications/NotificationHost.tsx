import { useEffect, useRef } from 'react';
import type { Payment } from 'stellar-shade';
import { formatAmount, assetLabel } from '@/lib/format';
import { useScanContext } from '@/stealth/ScanProvider';
import { useNotifyStore } from './notifyStore';
import { AutoClaimHost } from './AutoClaimHost';

/**
 * App-wide reactor for scan results. Mount ONCE, inside <ScanProvider>.
 *
 * Two jobs:
 *  1. Browser notifications (feature 5) for genuinely new payments.
 *  2. Renders <AutoClaimHost/> (feature 6), which watches the same scan context.
 *
 * BASELINE — the important subtlety: the first scan after unlock surfaces the
 * whole backlog of already-received payments as `lastNewPayments` (from the
 * receiver's point of view they were "just detected"). Notifying for all of them
 * would spam on every app open. So we swallow the FIRST scan we observe per
 * identity as the baseline and only notify for arrivals detected *after* it.
 * The baseline is keyed on `payoutAddress` (via scanTick reset), so switching
 * identities re-establishes it rather than leaking one identity's backlog.
 */

/** Concise notification body for one or more new payments. */
function summarize(payments: Payment[]): { title: string; body: string } {
  if (payments.length === 1) {
    const p = payments[0];
    return {
      title: 'New payment',
      body: `${formatAmount(p.amount)} ${assetLabel(p)} is waiting to claim.`,
    };
  }
  const total = payments.length;
  return {
    title: `${total} new payments`,
    body: `${total} payments are waiting to claim.`,
  };
}

export function NotificationHost() {
  const scan = useScanContext();
  const notificationsEnabled = useNotifyStore((s) => s.notificationsEnabled);

  // Has the baseline scan been observed for the current data set? Reset whenever
  // scanning restarts from zero (identity switch / lock), detected by scanTick
  // dropping back to 0.
  const baselineDoneRef = useRef(false);
  const lastTickRef = useRef(0);

  useEffect(() => {
    // A fresh identity resets scanTick to 0 in useScan; treat that as a new
    // baseline window so we never carry one identity's seen-set into another.
    if (scan.scanTick < lastTickRef.current) {
      baselineDoneRef.current = false;
    }
    lastTickRef.current = scan.scanTick;

    // Nothing to react to until at least one scan has completed.
    if (scan.scanTick === 0) return;

    // Swallow the first completed scan as the baseline (existing backlog).
    if (!baselineDoneRef.current) {
      baselineDoneRef.current = true;
      return;
    }

    if (scan.lastNewPayments.length === 0) return;
    if (!notificationsEnabled) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const { title, body } = summarize(scan.lastNewPayments);
    try {
      new Notification(title, { body, icon: '/shade-icon.svg', tag: 'shade-payment' });
    } catch {
      // Some browsers throw if notifications are constructed outside a SW in
      // certain contexts; failing silently is fine — the in-app list still updates.
    }
    // Only react to a completed scan, not to permission/toggle flips mid-window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan.scanTick]);

  return <AutoClaimHost />;
}
