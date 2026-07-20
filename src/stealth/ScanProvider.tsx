import { createContext, useContext, type ReactNode } from 'react';
import type { Payment } from 'stellar-shade';
import { useIdentity } from '@/identity/IdentityProvider';
import { useIdentityStore } from '@/identity/identityStore';
import { useScan } from './useScan';

/**
 * App-level scan engine.
 *
 * Historically each page called `useScan` itself, which meant scanning only ran
 * while the Receive page was mounted and every consumer got its own independent
 * engine. Lifting it to a provider gives the whole app ONE engine for the active
 * identity: it honours `autoScanOnOpen`, re-scans on a slow interval so new
 * payments surface anywhere (notifications, auto-claim, badges), and exposes the
 * diff of what was newly detected so consumers can react to only the new arrivals.
 *
 * It idles gracefully when there is no active identity/keys — `useScan` no-ops
 * without an address or keys, and the poll below stays dormant.
 */

/** How often to walk new ledgers in the background. */
const POLL_INTERVAL_MS = 45_000;

export interface ScanContextValue {
  payments: Payment[];
  claimed: Set<string>;
  loading: boolean;
  cold: boolean;
  error: string | null;
  lastSyncedAt: number | null;
  scan: (opts?: { fromScratch?: boolean }) => Promise<void>;
  markClaimed: (stealthAddress: string) => void;
  /** Payments newly detected in the most recent scan (diff vs the prior set). */
  lastNewPayments: Payment[];
  /** Increments after each completed scan. */
  scanTick: number;
}

const ScanContext = createContext<ScanContextValue | null>(null);

export function ScanProvider({ children }: { children: ReactNode }) {
  const { payoutAddress, keys } = useIdentity();
  const autoScanOnOpen = useIdentityStore((s) => s.settings.autoScanOnOpen);

  const scan = useScan(payoutAddress, keys, {
    auto: autoScanOnOpen,
    pollIntervalMs: POLL_INTERVAL_MS,
  });

  const value: ScanContextValue = {
    payments: scan.payments,
    claimed: scan.claimed,
    loading: scan.loading,
    cold: scan.cold,
    error: scan.error,
    lastSyncedAt: scan.lastSyncedAt,
    scan: scan.scan,
    markClaimed: scan.markClaimed,
    lastNewPayments: scan.lastNewPayments,
    scanTick: scan.scanTick,
  };

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScanContext(): ScanContextValue {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error('useScanContext must be used inside <ScanProvider>.');
  return ctx;
}
