import { useEffect, useState } from 'react';
import { indexerClient, relayerClient } from './shade';

/**
 * Liveness of the two Shade services, polled gently. Shown as dots in the top
 * bar so a broken demo is diagnosable at a glance rather than at first send.
 */

export type ServiceState = 'checking' | 'ok' | 'down';

export interface ServiceHealth {
  relayer: ServiceState;
  indexer: ServiceState;
  /** Ledger lag reported by the indexer, when it will tell us. */
  indexerLagSeconds: number | null;
  relayerAddress: string | null;
  /**
   * True when the relayer only accepts submissions backed by prepaid credit and
   * a signed proof of control. This demo has no funding account, so relaying is
   * unavailable when set.
   */
  relayerRequiresCredit: boolean;
}

const POLL_INTERVAL_MS = 60_000;

export function useServiceHealth(): ServiceHealth {
  const [health, setHealth] = useState<ServiceHealth>({
    relayer: 'checking',
    indexer: 'checking',
    indexerLagSeconds: null,
    relayerAddress: null,
    relayerRequiresCredit: false,
  });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const [relayer, indexer] = await Promise.allSettled([
        relayerClient.health(),
        indexerClient.health(),
      ]);
      if (cancelled) return;

      setHealth({
        relayer: relayer.status === 'fulfilled' ? 'ok' : 'down',
        indexer: indexer.status === 'fulfilled' ? 'ok' : 'down',
        indexerLagSeconds:
          indexer.status === 'fulfilled' ? (indexer.value.lagSeconds ?? null) : null,
        relayerAddress:
          relayer.status === 'fulfilled' ? (relayer.value.relayerAddress ?? null) : null,
        relayerRequiresCredit:
          relayer.status === 'fulfilled' ? Boolean(relayer.value.requireCredit) : false,
      });
    };

    void check();
    const timer = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return health;
}
