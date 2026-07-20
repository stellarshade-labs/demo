import { useCallback, useEffect, useRef, useState } from 'react';
import type { WalletConnector } from './types';

/**
 * Detect which wallets are present, tolerating late injection.
 *
 * Extensions inject their globals from a content script, which is not
 * guaranteed to have run by the time React mounts — Freighter's `isConnected()`
 * reads `window.freighter`, and xBull reads `window.xBullSDK`. Checking once
 * races that injection and reports a wallet as missing when it is merely late.
 *
 * So we re-probe on a short interval until every wallet is found or the window
 * closes, and expose a manual recheck for the case where the user installs an
 * extension with the app already open.
 */

const PROBE_INTERVAL_MS = 400;
const PROBE_WINDOW_MS = 4000;

export type Availability = Record<string, boolean | undefined>;

export function useAvailability(connectors: WalletConnector[]) {
  const [availability, setAvailability] = useState<Availability>({});
  const [probing, setProbing] = useState(true);
  const timers = useRef<{ interval?: number; stop?: number }>({});

  const probeOnce = useCallback(async () => {
    const entries = await Promise.all(
      connectors.map(async (c) => {
        try {
          return [c.id, await c.isAvailable()] as const;
        } catch {
          return [c.id, false] as const;
        }
      }),
    );
    const next = Object.fromEntries(entries);
    setAvailability(next);
    return entries.every(([, found]) => found);
  }, [connectors]);

  const clearTimers = useCallback(() => {
    if (timers.current.interval) window.clearInterval(timers.current.interval);
    if (timers.current.stop) window.clearTimeout(timers.current.stop);
    timers.current = {};
  }, []);

  const startProbing = useCallback(() => {
    clearTimers();
    setProbing(true);

    void probeOnce().then((allFound) => {
      if (allFound) {
        setProbing(false);
        return;
      }
      timers.current.interval = window.setInterval(() => {
        void probeOnce().then((found) => {
          if (found) {
            clearTimers();
            setProbing(false);
          }
        });
      }, PROBE_INTERVAL_MS);

      // Stop eventually — a wallet that hasn't appeared in four seconds isn't
      // installed, and polling forever would be a background CPU leak.
      timers.current.stop = window.setTimeout(() => {
        clearTimers();
        setProbing(false);
      }, PROBE_WINDOW_MS);
    });
  }, [probeOnce, clearTimers]);

  useEffect(() => {
    startProbing();
    return clearTimers;
  }, [startProbing, clearTimers]);

  return { availability, probing, recheck: startProbing };
}
