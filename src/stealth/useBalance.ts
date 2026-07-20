import { useCallback, useEffect, useRef, useState } from 'react';
import { Horizon } from '@stellar/stellar-sdk';
import { NETWORK } from '@/config/network';
import { toUserMessage } from '@/lib/errors';

/**
 * The active identity's payout-account balance, read from Horizon.
 *
 * A brand-new payout account does not exist on-chain yet, which Horizon reports
 * as a 404. That is not an error the user needs to see — it just means the
 * account is unfunded, so we surface `funded: false` with a zero native balance
 * (which the Receive UI uses to offer Friendbot funding on testnet).
 */

/** A non-native asset line held by the payout account. */
export interface HeldAsset {
  code: string;
  issuer?: string;
  balance: number;
}

export interface BalanceState {
  /** Native XLM balance, or null before the first load resolves. */
  native: number | null;
  /** Non-zero non-native asset lines held by the account (empty when unfunded). */
  assets: HeldAsset[];
  /** False when the account does not yet exist on-chain (404). */
  funded: boolean;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const horizon = new Horizon.Server(NETWORK.horizonUrl);

function isNotFound(error: unknown): boolean {
  const status = (error as { response?: { status?: number }; status?: number } | null)?.response
    ?.status;
  return status === 404 || (error as { status?: number } | null)?.status === 404;
}

export function useBalance(address: string | null): BalanceState {
  const [native, setNative] = useState<number | null>(null);
  const [assets, setAssets] = useState<HeldAsset[]>([]);
  const [funded, setFunded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against a stale response landing after the address changed.
  const requestFor = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!address) {
      setNative(null);
      setAssets([]);
      setFunded(false);
      setError(null);
      return;
    }
    requestFor.current = address;
    setLoading(true);
    setError(null);
    try {
      const account = await horizon.loadAccount(address);
      if (requestFor.current !== address) return;
      const nativeLine = account.balances.find((b) => b.asset_type === 'native');
      setNative(nativeLine ? Number(nativeLine.balance) : 0);
      // Every non-native line, derived from the same already-loaded balances.
      setAssets(
        account.balances
          .filter((b) => b.asset_type !== 'native')
          .map((b) => {
            const line = b as { asset_code?: string; asset_issuer?: string; balance: string };
            return {
              code: line.asset_code ?? '',
              issuer: line.asset_issuer,
              balance: Number(line.balance),
            };
          })
          .filter((a) => a.balance > 0),
      );
      setFunded(true);
    } catch (err) {
      if (requestFor.current !== address) return;
      if (isNotFound(err)) {
        setNative(0);
        setAssets([]);
        setFunded(false);
      } else {
        setError(toUserMessage(err));
      }
    } finally {
      if (requestFor.current === address) setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void load();
  }, [load]);

  return { native, assets, funded, loading, error, reload: load };
}
