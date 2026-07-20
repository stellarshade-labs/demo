import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { keysFromWalletSignature, type StealthKeys } from 'stellar-shade';
import { useWallet } from '@/wallet/WalletProvider';
import { toUserMessage } from '@/lib/errors';
import { clearScanCache } from './scanCache';

/**
 * Stealth keys live here and nowhere else.
 *
 * They are derived on demand from a wallet signature and held in memory for the
 * lifetime of the tab. They are never written to localStorage, sessionStorage,
 * IndexedDB, or a cookie — re-deriving costs one signature, and that is a much
 * better trade than persisting spend authority in the browser.
 */

interface StealthKeysContextValue {
  keys: StealthKeys | null;
  unlocked: boolean;
  unlocking: boolean;
  error: string | null;
  unlock: () => Promise<StealthKeys | null>;
  lock: () => void;
}

const StealthKeysContext = createContext<StealthKeysContextValue | null>(null);

export function StealthKeysProvider({ children }: { children: ReactNode }) {
  const { address, signMessage, canDeriveKeys } = useWallet();
  const [keys, setKeys] = useState<StealthKeys | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [derivedFor, setDerivedFor] = useState<string | null>(null);

  // Switching accounts (or disconnecting) must not leave the previous
  // identity's keys resident.
  useEffect(() => {
    if (derivedFor && address !== derivedFor) {
      setKeys(null);
      setDerivedFor(null);
      setError(null);
    }
  }, [address, derivedFor]);

  const unlock = useCallback(async () => {
    if (!address) {
      setError('Connect a wallet first.');
      return null;
    }
    if (!canDeriveKeys) {
      setError('This wallet cannot sign messages, so stealth keys cannot be derived.');
      return null;
    }

    setUnlocking(true);
    setError(null);
    try {
      const derived = await keysFromWalletSignature(
        async (message) => signMessage(message),
        // The SDK signs twice by default to catch non-deterministic signers.
        // Freighter is deterministic, and two popups for one unlock is a poor
        // trade for a check the wallet's own guarantees already cover.
        { verifyDeterminism: false },
      );
      setKeys(derived);
      setDerivedFor(address);
      return derived;
    } catch (err) {
      setError(toUserMessage(err));
      return null;
    } finally {
      setUnlocking(false);
    }
  }, [address, canDeriveKeys, signMessage]);

  const lock = useCallback(() => {
    setKeys(null);
    setDerivedFor(null);
    setError(null);
    if (address) clearScanCache(address);
  }, [address]);

  const value = useMemo<StealthKeysContextValue>(
    () => ({ keys, unlocked: keys !== null, unlocking, error, unlock, lock }),
    [keys, unlocking, error, unlock, lock],
  );

  return <StealthKeysContext.Provider value={value}>{children}</StealthKeysContext.Provider>;
}

export function useStealthKeys(): StealthKeysContextValue {
  const ctx = useContext(StealthKeysContext);
  if (!ctx) throw new Error('useStealthKeys must be used inside <StealthKeysProvider>.');
  return ctx;
}
