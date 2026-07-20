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
  const e = error as
    | { response?: { status?: number }; status?: number; constructor?: { name?: string } }
    | null;
  return (
    e?.response?.status === 404 ||
    e?.status === 404 ||
    // The Stellar SDK doesn't set `.name`, so fall back to the class name.
    e?.constructor?.name === 'NotFoundError'
  );
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

    // A fresh tab's very first Horizon call can fail before the connection is
    // warm (DNS/TLS), which used to leave the balance stuck on a bare "—" with
    // no way to recover but a manual action (funding). Retry transient failures
    // a few times; a genuine 404 (unfunded account) resolves immediately to 0.
    for (let attempt = 1; ; attempt++) {
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
        setError(null);
        break;
      } catch (err) {
        if (requestFor.current !== address) return;
        if (isNotFound(err)) {
          setNative(0);
          setAssets([]);
          setFunded(false);
          setError(null);
          break;
        }
        if (attempt >= 3) {
          setError(toUserMessage(err));
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 700));
        if (requestFor.current !== address) return;
      }
    }
    if (requestFor.current === address) setLoading(false);
  }, [address]);

  useEffect(() => {
    void load();
  }, [load]);

  return { native, assets, funded, loading, error, reload: load };
}
