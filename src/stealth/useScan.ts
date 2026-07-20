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
}

function dedupe(existing: Payment[], incoming: Payment[]): Payment[] {
  const seen = new Map<string, Payment>();
  for (const payment of [...existing, ...incoming]) {
    // A stealth address is one-time, but the pool can hold several assets at
    // one, so key on both.
    seen.set(`${payment.stealthAddress}:${payment.token}`, payment);
  }
  return [...seen.values()];
}

export function useScan(address: string | null, keys: StealthKeys | null) {
  const [state, setState] = useState<ScanState>({
    payments: [],
    claimed: new Set(),
    cursor: undefined,
    loading: false,
    cold: false,
    error: null,
    lastSyncedAt: null,
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
          const next: ScanState = {
            payments,
            claimed,
            cursor: result.cursor,
            loading: false,
            cold: false,
            error: null,
            lastSyncedAt: Date.now(),
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
      if (!cancelled) void scan();
    })();

    return () => {
      cancelled = true;
    };
    // `scan` intentionally omitted: it changes with cursor, and re-running this
    // effect on every cursor update would restart hydration in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, address]);

  return { ...state, scan, markClaimed };
}
