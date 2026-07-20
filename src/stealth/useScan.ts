import { useCallback, useEffect, useRef, useState } from 'react';
import type { Payment, ScanCursor, StealthKeys } from 'stellar-shade';
import { stealthClient } from '@/lib/shade';
import { toUserMessage } from '@/lib/errors';
import { loadScanCache, saveScanCache, type CachedScan } from './scanCache';

/**
 * Incremental scanning with an encrypted local cache.
 *
 * On unlock we hydrate from cache instantly, then continue the scan from the
 * stored cursor so only new ledgers are walked. The cache is an accelerator,
 * never the source of truth — dropping it just means one slower scan.
 */

export interface ScanState {
  payments: Payment[];
  claimed: Set<string>;
  cursor: ScanCursor | undefined;
  loading: boolean;
  /** True while the very first scan of a cold cache is running. */
  cold: boolean;
  error: string | null;
  lastSyncedAt: number | null;
  /** Payments newly detected in the most recent completed scan (diff vs prior). */
  lastNewPayments: Payment[];
  /** Increments after each completed scan, so consumers can react to fresh data. */
  scanTick: number;
}

/** The identity key of a payment: one-time address + its asset/token. */
function paymentKey(payment: Payment): string {
  // A stealth address is one-time, but the pool can hold several assets at
  // one, so key on both.
  return `${payment.stealthAddress}:${payment.token}`;
}

function dedupe(existing: Payment[], incoming: Payment[]): Payment[] {
  const seen = new Map<string, Payment>();
  for (const payment of [...existing, ...incoming]) {
    seen.set(paymentKey(payment), payment);
  }
  return [...seen.values()];
}

export function useScan(
  address: string | null,
  keys: StealthKeys | null,
  opts?: { auto?: boolean; pollIntervalMs?: number },
) {
  const auto = opts?.auto ?? true;
  const pollIntervalMs = opts?.pollIntervalMs ?? 0;
  const [state, setState] = useState<ScanState>({
    payments: [],
    claimed: new Set(),
    cursor: undefined,
    loading: false,
    cold: false,
    error: null,
    lastSyncedAt: null,
    lastNewPayments: [],
    scanTick: 0,
  });

  const inFlight = useRef(false);
  const hydratedFor = useRef<string | null>(null);

  const persist = useCallback(
    async (next: CachedScan) => {
      if (!address || !keys) return;
      await saveScanCache(address, keys, next);
    },
    [address, keys],
  );

  const scan = useCallback(
    async (opts?: { fromScratch?: boolean }) => {
      if (!keys || !address || inFlight.current) return;
      inFlight.current = true;

      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
        cold: opts?.fromScratch ? true : prev.payments.length === 0,
      }));

      try {
        const cursor = opts?.fromScratch ? undefined : state.cursor;
        const result = await stealthClient.scanWithCursor(keys, cursor ? { cursor } : undefined);

        setState((prev) => {
          const payments = opts?.fromScratch
            ? result.payments
            : dedupe(prev.payments, result.payments);
          const claimed = opts?.fromScratch ? new Set<string>() : prev.claimed;
          // What's genuinely new this scan: keys present now but not before. On a
          // from-scratch scan the prior set is discarded, so everything is "new".
          const known = new Set(
            (opts?.fromScratch ? [] : prev.payments).map(paymentKey),
          );
          const lastNewPayments = payments.filter((p) => !known.has(paymentKey(p)));
          const next: ScanState = {
            payments,
            claimed,
            cursor: result.cursor,
            loading: false,
            cold: false,
            error: null,
            lastSyncedAt: Date.now(),
            lastNewPayments,
            scanTick: prev.scanTick + 1,
          };
          void persist({
            payments,
            cursor: result.cursor,
            updatedAt: next.lastSyncedAt!,
            claimed: [...claimed],
          });
          return next;
        });
      } catch (err) {
        setState((prev) => ({
          ...prev,
          loading: false,
          cold: false,
          error: toUserMessage(err),
        }));
      } finally {
        inFlight.current = false;
      }
    },
    [keys, address, state.cursor, persist],
  );

  /** Mark a payment claimed so it stops showing as available. */
  const markClaimed = useCallback(
    (stealthAddress: string) => {
      setState((prev) => {
        const claimed = new Set(prev.claimed);
        claimed.add(stealthAddress);
        void persist({
          payments: prev.payments,
          cursor: prev.cursor ?? {},
          updatedAt: Date.now(),
          claimed: [...claimed],
        });
        return { ...prev, claimed };
      });
    },
    [persist],
  );

  // Hydrate from the encrypted cache the moment keys become available, then
  // catch up in the background.
  useEffect(() => {
    if (!keys || !address) {
      hydratedFor.current = null;
      setState({
        payments: [],
        claimed: new Set(),
        cursor: undefined,
        loading: false,
        cold: false,
        error: null,
        lastSyncedAt: null,
        lastNewPayments: [],
        scanTick: 0,
      });
      return;
    }

    if (hydratedFor.current === address) return;
    hydratedFor.current = address;

    let cancelled = false;
    (async () => {
      const cached = await loadScanCache(address, keys);
      if (cancelled) return;
      if (cached) {
        setState((prev) => ({
          ...prev,
          payments: cached.payments,
          claimed: new Set(cached.claimed ?? []),
          cursor: cached.cursor,
          lastSyncedAt: cached.updatedAt,
        }));
      }
      // Honour the auto-scan-on-open setting: still hydrate from cache, but
      // only walk the ledger automatically when enabled.
      if (!cancelled && auto) void scan();
    })();

    return () => {
      cancelled = true;
    };
    // `scan` intentionally omitted: it changes with cursor, and re-running this
    // effect on every cursor update would restart hydration in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, address]);

  // Keep the latest `scan` reachable from a stable interval, so the poll below
  // never resets its timer just because the cursor advanced.
  const scanRef = useRef(scan);
  scanRef.current = scan;

  // Periodically re-scan so new payments are detected app-wide without the user
  // clicking Rescan. Idle when disabled or when there is no identity to scan.
  useEffect(() => {
    if (pollIntervalMs <= 0 || !keys || !address) return;
    const timer = setInterval(() => void scanRef.current(), pollIntervalMs);
    return () => clearInterval(timer);
  }, [pollIntervalMs, keys, address]);

  return { ...state, scan, markClaimed };
}
