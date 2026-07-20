import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  StealthClient,
  keysFromWalletSignature,
  type StealthKeys,
  type TransactionSigner,
} from 'stellar-shade';
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { useWallet } from '@/wallet/WalletProvider';
import { toUserMessage } from '@/lib/errors';
import { clearScanCache } from '@/stealth/scanCache';
import {
  decryptIdentity,
  derivePayoutKeypair,
  encryptIdentity,
  resumeSession,
  saveSession,
  slideSession,
  clearSession,
  type IdentitySource,
  type SecretIdentity,
} from './identityCrypto';
import { useIdentityStore } from './identityStore';

/**
 * The single source of truth for *who the user is*, replacing the wallet-only
 * StealthKeysProvider. An identity can be created three ways — from a wallet
 * signature, a mnemonic, or randomly — then sealed under a passphrase and kept
 * for the 6h sliding window (see identityCrypto).
 *
 * Decrypted keys (`keys`, `payoutSecret`) live in React state only; the store
 * persists ciphertext + public fields.
 */

export type IdentityStatus = 'absent' | 'locked' | 'unlocked';

interface IdentityContextValue {
  /** True once the initial silent session-resume attempt has settled. */
  hydrated: boolean;
  status: IdentityStatus;
  source: IdentitySource | null;

  /** Stealth keys — same shape the scan/claim code already consumes. */
  keys: StealthKeys | null;
  metaAddress: string | null;
  /** G-address funds are claimed into. */
  payoutAddress: string | null;
  /** Present for self-custodied (mnemonic/random) identities; null for wallet. */
  payoutSecret: string | null;
  publishPref: boolean;

  /** In-flight onboarding identity, before a passphrase seals it. */
  draft: SecretIdentity | null;
  creating: boolean;
  unlocking: boolean;
  error: string | null;

  createFromWallet: () => Promise<SecretIdentity | null>;
  createFromMnemonic: (phrase?: string) => Promise<SecretIdentity | null>;
  createRandom: () => Promise<SecretIdentity | null>;
  discardDraft: () => void;
  finalize: (passphrase: string, publishPref: boolean) => Promise<void>;
  unlock: (passphrase: string) => Promise<boolean>;
  lock: () => void;
  /** Delete the identity from this browser entirely. */
  reset: () => void;
  /** The decrypted secret for backup/reveal — only while unlocked or drafting. */
  revealSecret: () => SecretIdentity | null;
  setPublishPref: (value: boolean) => void;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

/** A TransactionSigner backed by a raw Stellar secret (wallet-free signing). */
export function signerFromSecret(secret: string): TransactionSigner {
  const kp = Keypair.fromSecret(secret);
  return async (xdr, opts) => {
    const tx = TransactionBuilder.fromXDR(xdr, opts.networkPassphrase);
    tx.sign(kp);
    return tx.toXDR();
  };
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const { address, signMessage, canDeriveKeys } = useWallet();
  const record = useIdentityStore((s) => s.record);
  const setRecord = useIdentityStore((s) => s.setRecord);
  const updateRecord = useIdentityStore((s) => s.updateRecord);
  const clearIdentity = useIdentityStore((s) => s.clearIdentity);

  const [secret, setSecret] = useState<SecretIdentity | null>(null);
  const [draft, setDraft] = useState<SecretIdentity | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [creating, setCreating] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Silent resume: if a live 6h session exists, decrypt without a passphrase.
  // Written to be StrictMode-safe — the final (persistent) effect run is the one
  // that flips `hydrated`, so a cancelled first run never leaves us on the splash.
  useEffect(() => {
    let cancelled = false;
    if (!record) {
      setHydrated(true);
      return;
    }
    (async () => {
      const resumed = await resumeSession(record.encrypted);
      if (cancelled) return;
      if (resumed) setSecret(resumed);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // Only re-run when the ciphertext itself changes (create/reset), not on every
    // record field tweak like publishPref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.encrypted.ct]);

  // Keep the window alive while the user is active ("back within the window
  // resets it to 6h"). Slide on focus and on a slow heartbeat.
  useEffect(() => {
    if (!secret) return;
    slideSession();
    const onFocus = () => slideSession();
    window.addEventListener('focus', onFocus);
    const beat = setInterval(slideSession, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(beat);
    };
  }, [secret]);

  const buildDraft = useCallback(
    async (
      source: IdentitySource,
      stealthKeys: StealthKeys,
      extras: { mnemonic?: string; walletAddress?: string },
    ): Promise<SecretIdentity> => {
      if (source === 'wallet') {
        // Wallet identities claim back to the connected wallet (external signer).
        return {
          version: 1,
          source,
          stealthKeys,
          payout: { publicKey: extras.walletAddress! },
        };
      }
      // Self-custodied identities get a payout keypair derived from the identity,
      // so the relayer can sponsor claims with no wallet in the loop.
      const kp = await derivePayoutKeypair(stealthKeys);
      return {
        version: 1,
        source,
        stealthKeys,
        mnemonic: extras.mnemonic,
        payout: { publicKey: kp.publicKey(), secret: kp.secret() },
      };
    },
    [],
  );

  const createRandom = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const keys = StealthClient.keygen();
      const next = await buildDraft('random', keys, {});
      setDraft(next);
      return next;
    } catch (err) {
      setError(toUserMessage(err));
      return null;
    } finally {
      setCreating(false);
    }
  }, [buildDraft]);

  const createFromMnemonic = useCallback(
    async (phrase?: string) => {
      setCreating(true);
      setError(null);
      try {
        const { mnemonic, ...stealthKeys } = StealthClient.fromMnemonic(phrase?.trim() || undefined);
        const next = await buildDraft('mnemonic', stealthKeys, { mnemonic });
        setDraft(next);
        return next;
      } catch (err) {
        setError(toUserMessage(err));
        return null;
      } finally {
        setCreating(false);
      }
    },
    [buildDraft],
  );

  const createFromWallet = useCallback(async () => {
    if (!address) {
      setError('Connect a wallet first.');
      return null;
    }
    if (!canDeriveKeys) {
      setError('This wallet cannot sign messages, so an identity cannot be derived from it.');
      return null;
    }
    setCreating(true);
    setError(null);
    try {
      const keys = await keysFromWalletSignature(async (message) => signMessage(message), {
        verifyDeterminism: false,
      });
      const next = await buildDraft('wallet', keys, { walletAddress: address });
      setDraft(next);
      return next;
    } catch (err) {
      setError(toUserMessage(err));
      return null;
    } finally {
      setCreating(false);
    }
  }, [address, canDeriveKeys, signMessage, buildDraft]);

  const discardDraft = useCallback(() => {
    setDraft(null);
    setError(null);
  }, []);

  const finalize = useCallback(
    async (passphrase: string, publishPref: boolean) => {
      if (!draft) throw new Error('No identity to finalize.');
      const { blob, key } = await encryptIdentity(draft, passphrase);
      await saveSession(key);
      setRecord({
        source: draft.source,
        metaAddress: draft.stealthKeys.metaAddress,
        payoutAddress: draft.payout.publicKey,
        createdAt: Date.now(),
        publishPref,
        encrypted: blob,
      });
      setSecret(draft);
      setDraft(null);
    },
    [draft, setRecord],
  );

  const unlock = useCallback(
    async (passphrase: string) => {
      if (!record) return false;
      setUnlocking(true);
      setError(null);
      try {
        const { secret: opened, key } = await decryptIdentity(record.encrypted, passphrase);
        await saveSession(key);
        setSecret(opened);
        return true;
      } catch {
        setError('Incorrect passphrase.');
        return false;
      } finally {
        setUnlocking(false);
      }
    },
    [record],
  );

  const lock = useCallback(() => {
    setSecret(null);
    setError(null);
    clearSession();
  }, []);

  const reset = useCallback(() => {
    if (record) clearScanCache(record.payoutAddress);
    clearIdentity();
    clearSession();
    setSecret(null);
    setDraft(null);
    setError(null);
  }, [record, clearIdentity]);

  const revealSecret = useCallback(() => secret ?? draft, [secret, draft]);

  const setPublishPref = useCallback(
    (value: boolean) => updateRecord({ publishPref: value }),
    [updateRecord],
  );

  const status: IdentityStatus = secret ? 'unlocked' : record ? 'locked' : 'absent';

  const value = useMemo<IdentityContextValue>(
    () => ({
      hydrated,
      status,
      source: secret?.source ?? record?.source ?? draft?.source ?? null,
      keys: secret?.stealthKeys ?? null,
      metaAddress: secret?.stealthKeys.metaAddress ?? record?.metaAddress ?? null,
      payoutAddress: secret?.payout.publicKey ?? record?.payoutAddress ?? null,
      payoutSecret: secret?.payout.secret ?? null,
      publishPref: record?.publishPref ?? false,
      draft,
      creating,
      unlocking,
      error,
      createFromWallet,
      createFromMnemonic,
      createRandom,
      discardDraft,
      finalize,
      unlock,
      lock,
      reset,
      revealSecret,
      setPublishPref,
    }),
    [
      hydrated,
      status,
      secret,
      record,
      draft,
      creating,
      unlocking,
      error,
      createFromWallet,
      createFromMnemonic,
      createRandom,
      discardDraft,
      finalize,
      unlock,
      lock,
      reset,
      revealSecret,
      setPublishPref,
    ],
  );

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity(): IdentityContextValue {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error('useIdentity must be used inside <IdentityProvider>.');
  return ctx;
}
