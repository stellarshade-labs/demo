import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  changePassphrase as changePassphraseCrypto,
  decryptVault,
  decryptVaultWithRawKey,
  derivePayoutKeypair,
  encryptVault,
  exportRawKey,
  newIdentityId,
  resealVault,
  resumeSession,
  saveSession,
  slideSession,
  clearSession,
  type IdentitySource,
  type SecretIdentity,
  type Vault,
} from './identityCrypto';
import { useIdentityStore, type PublicIdentity, type Settings } from './identityStore';
import { enrollPasskey, unwrapVaultKeyWithPasskey } from '@/lib/webauthn';

/**
 * Convert the persisted auto-lock setting into a session TTL in ms. Both `0`
 * (never) and `-1` (instant) map to a 0 TTL here; "instant" is realised by not
 * persisting a session at all (see `persistSession`), not by the TTL.
 */
function ttlFromSettings(autoLockMinutes: Settings['autoLockMinutes']): number {
  return autoLockMinutes > 0 ? autoLockMinutes * 60 * 1000 : 0;
}

/**
 * The single source of truth for *who the user is*, replacing the wallet-only
 * StealthKeysProvider. An identity can be created three ways — from a wallet
 * signature, a mnemonic, or randomly. Many identities live together in one
 * *vault* sealed under a single passphrase and kept for the 6h sliding window
 * (see identityCrypto).
 *
 * The decrypted vault and its wrap key (`keys`, `payoutSecret`, `wrapKey`) live
 * in React state only; the store persists ciphertext + public fields. Holding
 * the wrap key in memory lets us re-seal after add/remove without re-prompting.
 *
 * The public getters expose the *active* identity's values, so all downstream
 * scan/claim/publish code keeps working unchanged when the user switches.
 */

export type IdentityStatus = 'absent' | 'locked' | 'unlocked';

interface IdentityContextValue {
  /** True once the initial silent session-resume attempt has settled. */
  hydrated: boolean;
  status: IdentityStatus;
  source: IdentitySource | null;

  /** Stealth keys of the ACTIVE identity — same shape scan/claim already consume. */
  keys: StealthKeys | null;
  metaAddress: string | null;
  /** G-address funds are claimed into. */
  payoutAddress: string | null;
  /** Present for self-custodied (mnemonic/random) identities; null for wallet. */
  payoutSecret: string | null;
  publishPref: boolean;

  /** Public list of every identity in the vault (non-secret). */
  identities: PublicIdentity[];
  /** Id of the active identity, or null when absent/locked with no public list. */
  activeId: string | null;

  /** In-flight onboarding identity, before it's committed to the vault. */
  draft: SecretIdentity | null;
  creating: boolean;
  unlocking: boolean;
  error: string | null;

  createFromWallet: () => Promise<SecretIdentity | null>;
  createFromMnemonic: (phrase?: string) => Promise<SecretIdentity | null>;
  createRandom: () => Promise<SecretIdentity | null>;
  discardDraft: () => void;
  /** First-run: create the vault with the first identity under a passphrase. */
  finalize: (passphrase: string, publishPref: boolean) => Promise<void>;
  /** Begin a draft-create flow to add another identity to the unlocked vault. */
  addIdentity: () => void;
  /** Commit the current draft to the open vault, re-sealing with the held key. */
  finalizeAddition: (publishPref: boolean) => Promise<void>;
  /** Make an existing identity the active one (state + persist, no re-seal). */
  switchIdentity: (id: string) => void;
  /** Remove an identity; re-seals without it, or resets if it was the last. */
  removeIdentity: (id: string) => Promise<void>;
  /** Rename an identity (public label, persisted; re-seals to keep the vault in step). */
  renameIdentity: (id: string, label: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<boolean>;
  /** Unlock via an enrolled passkey (WebAuthn PRF). Throws on failure/cancel. */
  unlockWithPasskey: () => Promise<boolean>;
  lock: () => void;
  /** Delete the whole vault from this browser. */
  reset: () => void;
  /** The decrypted ACTIVE secret for backup/reveal — only while unlocked or drafting. */
  revealSecret: () => SecretIdentity | null;
  setPublishPref: (value: boolean) => void;
  /**
   * Change the vault passphrase without a reset. Verifies `current`, re-keys the
   * vault under `next`, updates the persisted blob and refreshes the session.
   * Returns false (with `error` set) on a wrong current passphrase.
   */
  changePassphrase: (current: string, next: string) => Promise<boolean>;
  /** Enroll a passkey that can unlock this vault. Requires the vault unlocked. */
  enrollPasskey: () => Promise<void>;
  /** Forget the enrolled passkey (passphrase unlock still works). */
  removePasskey: () => void;
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

/** Derive the public, persistable view of a secret identity. */
function toPublic(secret: SecretIdentity): PublicIdentity {
  return {
    id: secret.id,
    source: secret.source,
    metaAddress: secret.stealthKeys.metaAddress,
    payoutAddress: secret.payout.publicKey,
    publishPref: false,
    createdAt: Date.now(),
    label: secret.label,
  };
}

/**
 * Accept either a real Vault or a legacy single SecretIdentity (pre-v2 ciphertext
 * migrated in place) and normalise to a Vault. The persisted `activeId` (which the
 * user may have changed while locked) wins when it names a member; for the legacy
 * single-secret case it also seeds the id, since old secrets predate stable ids.
 */
function normalizeVault(opened: Vault | SecretIdentity, persistedActiveId: string): Vault {
  if ((opened as Vault).identities) {
    const v = opened as Vault;
    const activeId = v.identities.some((i) => i.id === persistedActiveId)
      ? persistedActiveId
      : v.activeId;
    return { ...v, activeId };
  }
  const legacy = opened as SecretIdentity;
  const id = legacy.id ?? persistedActiveId;
  return { version: 1, identities: [{ ...legacy, id }], activeId: id };
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const { address, signMessage, canDeriveKeys } = useWallet();
  const vaultRecord = useIdentityStore((s) => s.vault);
  const setVaultRecord = useIdentityStore((s) => s.setVault);
  const updateIdentityRecord = useIdentityStore((s) => s.updateIdentity);
  const setActiveIdRecord = useIdentityStore((s) => s.setActiveId);
  const clearVault = useIdentityStore((s) => s.clearVault);
  const autoLockMinutes = useIdentityStore((s) => s.settings.autoLockMinutes);
  const passkeyRecord = useIdentityStore((s) => s.passkey);
  const setPasskeyRecord = useIdentityStore((s) => s.setPasskey);

  // Read the current TTL lazily so session helpers always use the latest setting
  // without re-creating callbacks on every settings change.
  const ttlRef = useRef(ttlFromSettings(autoLockMinutes));
  const instantRef = useRef(autoLockMinutes === -1);
  useEffect(() => {
    ttlRef.current = ttlFromSettings(autoLockMinutes);
    instantRef.current = autoLockMinutes === -1;
    if (!vaultRecord) return;
    // Switching to "instant" drops any resumable session so a reload re-locks;
    // otherwise re-base the live session to the newly chosen window.
    if (instantRef.current) clearSession();
    else slideSession(ttlRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLockMinutes]);

  /**
   * Persist (or deliberately don't) the unlock session for the active lock mode.
   * Instant mode keeps the wrap key in React memory only — nothing resumable is
   * written, so the next fresh load asks for the passphrase (or passkey) again.
   */
  const persistSession = useCallback(async (key: CryptoKey) => {
    if (instantRef.current) clearSession();
    else await saveSession(key, ttlRef.current);
  }, []);

  // Decrypted vault + the wrap key that sealed it, both memory-only.
  const [vault, setVault] = useState<Vault | null>(null);
  const [wrapKey, setWrapKey] = useState<CryptoKey | null>(null);
  const [draft, setDraft] = useState<SecretIdentity | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [creating, setCreating] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Salt is bound to the wrap key; keep it so we can re-seal in place.
  const saltRef = useRef<string | null>(null);
  useEffect(() => {
    saltRef.current = vaultRecord?.encrypted.salt ?? null;
  }, [vaultRecord?.encrypted.salt]);

  // Ciphertext we produced ourselves (create/add/remove/rename): the in-memory
  // vault already reflects it, so the resume effect below must not re-decrypt it
  // (which would churn the `keys` reference and needlessly re-trigger scans).
  const selfSealedCtRef = useRef<string | null>(null);

  const activeId = vaultRecord?.activeId ?? null;

  // Silent resume: if a live 6h session exists, decrypt without a passphrase.
  // Written to be StrictMode-safe — the final (persistent) effect run is the one
  // that flips `hydrated`, so a cancelled first run never leaves us on the splash.
  useEffect(() => {
    let cancelled = false;
    if (!vaultRecord) {
      setHydrated(true);
      return;
    }
    // Skip when the ciphertext change was our own re-seal of an open vault.
    if (selfSealedCtRef.current === vaultRecord.encrypted.ct) {
      setHydrated(true);
      return;
    }
    (async () => {
      const resumed = await resumeSession(vaultRecord.encrypted);
      if (cancelled) return;
      if (resumed) {
        setVault(normalizeVault(resumed.vault, vaultRecord.activeId));
        setWrapKey(resumed.key);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // Only re-run when the ciphertext itself changes (create/reset/re-seal), not on
    // every record field tweak like publishPref or activeId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultRecord?.encrypted.ct]);

  // Keep the window alive while the user is active ("back within the window
  // resets it to 6h"). Slide on focus and on a slow heartbeat.
  useEffect(() => {
    if (!vault) return;
    slideSession(ttlRef.current);
    const onFocus = () => slideSession(ttlRef.current);
    window.addEventListener('focus', onFocus);
    const beat = setInterval(() => slideSession(ttlRef.current), 5 * 60 * 1000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(beat);
    };
  }, [vault]);

  // The active decrypted identity, or the active public record when locked.
  const activeSecret = useMemo(
    () => vault?.identities.find((i) => i.id === vault.activeId) ?? null,
    [vault],
  );
  const activePublic = useMemo(
    () => vaultRecord?.identities.find((i) => i.id === vaultRecord.activeId) ?? null,
    [vaultRecord],
  );

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
          id: newIdentityId(),
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
        id: newIdentityId(),
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

  // First run: build the vault around the first identity under a new passphrase.
  const finalize = useCallback(
    async (passphrase: string, publishPref: boolean) => {
      if (!draft) throw new Error('No identity to finalize.');
      const nextVault: Vault = { version: 1, identities: [draft], activeId: draft.id };
      const { blob, key } = await encryptVault(nextVault, passphrase);
      await persistSession(key);
      const pub = { ...toPublic(draft), publishPref };
      selfSealedCtRef.current = blob.ct;
      setVaultRecord({ encrypted: blob, identities: [pub], activeId: draft.id });
      saltRef.current = blob.salt;
      setVault(nextVault);
      setWrapKey(key);
      setDraft(null);
    },
    [draft, setVaultRecord],
  );

  const addIdentity = useCallback(() => {
    setDraft(null);
    setError(null);
  }, []);

  // Append the current draft to the OPEN vault and re-seal with the held key.
  const finalizeAddition = useCallback(
    async (publishPref: boolean) => {
      if (!draft) throw new Error('No identity to add.');
      if (!vault || !wrapKey || !saltRef.current) {
        throw new Error('Vault must be unlocked to add an identity.');
      }
      const nextVault: Vault = {
        ...vault,
        identities: [...vault.identities, draft],
        activeId: draft.id,
      };
      const blob = await resealVault(nextVault, wrapKey, saltRef.current);
      const pub = { ...toPublic(draft), publishPref };
      selfSealedCtRef.current = blob.ct;
      setVaultRecord({
        encrypted: blob,
        identities: [...(vaultRecord?.identities ?? []), pub],
        activeId: draft.id,
      });
      saltRef.current = blob.salt;
      setVault(nextVault);
      setDraft(null);
    },
    [draft, vault, wrapKey, vaultRecord, setVaultRecord],
  );

  const switchIdentity = useCallback(
    (id: string) => {
      if (!vault?.identities.some((i) => i.id === id)) {
        // Fall back to the public list when locked, so the switcher still works.
        if (!vaultRecord?.identities.some((i) => i.id === id)) return;
      }
      setActiveIdRecord(id);
      setVault((prev) => (prev ? { ...prev, activeId: id } : prev));
    },
    [vault, vaultRecord, setActiveIdRecord],
  );

  const reset = useCallback(() => {
    if (vaultRecord) {
      for (const i of vaultRecord.identities) clearScanCache(i.payoutAddress);
    }
    clearVault();
    clearSession();
    saltRef.current = null;
    setVault(null);
    setWrapKey(null);
    setDraft(null);
    setError(null);
  }, [vaultRecord, clearVault]);

  const removeIdentity = useCallback(
    async (id: string) => {
      if (!vault || !wrapKey || !saltRef.current) return;
      const remaining = vault.identities.filter((i) => i.id !== id);
      // Removing the last identity is a full reset.
      if (remaining.length === 0) {
        reset();
        return;
      }
      const removed = vault.identities.find((i) => i.id === id);
      if (removed) clearScanCache(removed.payout.publicKey);
      const nextActive =
        vault.activeId === id ? remaining[0].id : vault.activeId;
      const nextVault: Vault = { ...vault, identities: remaining, activeId: nextActive };
      const blob = await resealVault(nextVault, wrapKey, saltRef.current);
      selfSealedCtRef.current = blob.ct;
      setVaultRecord({
        encrypted: blob,
        identities: (vaultRecord?.identities ?? []).filter((i) => i.id !== id),
        activeId: nextActive,
      });
      saltRef.current = blob.salt;
      setVault(nextVault);
    },
    [vault, wrapKey, vaultRecord, reset, setVaultRecord],
  );

  const renameIdentity = useCallback(
    async (id: string, label: string) => {
      const trimmed = label.trim();
      const next = trimmed || undefined;
      // Persist the public label immediately so the switcher updates even locked.
      updateIdentityRecord(id, { label: next });
      if (!vault || !wrapKey || !saltRef.current) return;
      const nextVault: Vault = {
        ...vault,
        identities: vault.identities.map((i) => (i.id === id ? { ...i, label: next } : i)),
      };
      const blob = await resealVault(nextVault, wrapKey, saltRef.current);
      // updateIdentityRecord already patched the label; also swap in fresh ciphertext.
      selfSealedCtRef.current = blob.ct;
      setVaultRecord({
        encrypted: blob,
        identities: (vaultRecord?.identities ?? []).map((i) =>
          i.id === id ? { ...i, label: next } : i,
        ),
        activeId: vaultRecord?.activeId ?? nextVault.activeId,
      });
      saltRef.current = blob.salt;
      setVault(nextVault);
    },
    [vault, wrapKey, vaultRecord, updateIdentityRecord, setVaultRecord],
  );

  const unlock = useCallback(
    async (passphrase: string) => {
      if (!vaultRecord) return false;
      setUnlocking(true);
      setError(null);
      try {
        const { vault: opened, key } = await decryptVault(vaultRecord.encrypted, passphrase);
        await persistSession(key);
        setVault(normalizeVault(opened, vaultRecord.activeId));
        setWrapKey(key);
        return true;
      } catch {
        setError('Incorrect passphrase.');
        return false;
      } finally {
        setUnlocking(false);
      }
    },
    [vaultRecord],
  );

  // Passkey unlock: assert the enrolled credential, unwrap the raw vault key via
  // its PRF secret, decrypt the vault directly with that key, open the session.
  const unlockWithPasskey = useCallback(async () => {
    if (!vaultRecord || !passkeyRecord) return false;
    setUnlocking(true);
    setError(null);
    try {
      const rawKey = await unwrapVaultKeyWithPasskey(passkeyRecord);
      const { vault: opened, key } = await decryptVaultWithRawKey(
        vaultRecord.encrypted,
        rawKey,
      );
      await persistSession(key);
      setVault(normalizeVault(opened, vaultRecord.activeId));
      setWrapKey(key);
      return true;
    } catch (err) {
      // A cancelled/failed ceremony must NEVER lock the user out — the
      // passphrase path stays available.
      setError(toUserMessage(err));
      return false;
    } finally {
      setUnlocking(false);
    }
  }, [vaultRecord, passkeyRecord]);

  const lock = useCallback(() => {
    setVault(null);
    setWrapKey(null);
    setError(null);
    clearSession();
  }, []);

  // Change passphrase without a reset: re-key the vault under `next`, persist the
  // new ciphertext, refresh the in-memory key + the session. Any enrolled passkey
  // is invalidated (its wrapped key targets the OLD wrap key) and forgotten.
  const changePassphrase = useCallback(
    async (current: string, next: string) => {
      if (!vaultRecord) return false;
      setError(null);
      try {
        const { blob, key } = await changePassphraseCrypto(
          vaultRecord.encrypted,
          current,
          next,
        );
        await persistSession(key);
        selfSealedCtRef.current = blob.ct;
        setVaultRecord({ ...vaultRecord, encrypted: blob });
        saltRef.current = blob.salt;
        setWrapKey(key);
        if (passkeyRecord) setPasskeyRecord(null);
        return true;
      } catch {
        setError('Current passphrase is incorrect.');
        return false;
      }
    },
    [vaultRecord, passkeyRecord, setVaultRecord, setPasskeyRecord],
  );

  // Enroll a passkey: export the raw wrap key held in memory, wrap it under the
  // passkey's PRF secret, and persist the (non-secret) record. Requires unlock.
  const enrollPasskeyFn = useCallback(async () => {
    if (!wrapKey) throw new Error('Unlock the vault before enrolling a passkey.');
    const rawKey = await exportRawKey(wrapKey);
    const record = await enrollPasskey(rawKey);
    setPasskeyRecord(record);
  }, [wrapKey, setPasskeyRecord]);

  const removePasskey = useCallback(() => {
    setPasskeyRecord(null);
  }, [setPasskeyRecord]);

  const revealSecret = useCallback(() => activeSecret ?? draft, [activeSecret, draft]);

  const setPublishPref = useCallback(
    (value: boolean) => {
      const id = vaultRecord?.activeId;
      if (id) updateIdentityRecord(id, { publishPref: value });
    },
    [vaultRecord?.activeId, updateIdentityRecord],
  );

  const status: IdentityStatus = vault ? 'unlocked' : vaultRecord ? 'locked' : 'absent';

  const value = useMemo<IdentityContextValue>(
    () => ({
      hydrated,
      status,
      source: activeSecret?.source ?? activePublic?.source ?? draft?.source ?? null,
      keys: activeSecret?.stealthKeys ?? null,
      metaAddress: activeSecret?.stealthKeys.metaAddress ?? activePublic?.metaAddress ?? null,
      payoutAddress: activeSecret?.payout.publicKey ?? activePublic?.payoutAddress ?? null,
      payoutSecret: activeSecret?.payout.secret ?? null,
      publishPref: activePublic?.publishPref ?? false,
      identities: vaultRecord?.identities ?? [],
      activeId,
      draft,
      creating,
      unlocking,
      error,
      createFromWallet,
      createFromMnemonic,
      createRandom,
      discardDraft,
      finalize,
      addIdentity,
      finalizeAddition,
      switchIdentity,
      removeIdentity,
      renameIdentity,
      unlock,
      unlockWithPasskey,
      lock,
      reset,
      revealSecret,
      setPublishPref,
      changePassphrase,
      enrollPasskey: enrollPasskeyFn,
      removePasskey,
    }),
    [
      hydrated,
      status,
      activeSecret,
      activePublic,
      vaultRecord,
      activeId,
      draft,
      creating,
      unlocking,
      error,
      createFromWallet,
      createFromMnemonic,
      createRandom,
      discardDraft,
      finalize,
      addIdentity,
      finalizeAddition,
      switchIdentity,
      removeIdentity,
      renameIdentity,
      unlock,
      unlockWithPasskey,
      lock,
      reset,
      revealSecret,
      setPublishPref,
      changePassphrase,
      enrollPasskeyFn,
      removePasskey,
    ],
  );

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity(): IdentityContextValue {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error('useIdentity must be used inside <IdentityProvider>.');
  return ctx;
}
