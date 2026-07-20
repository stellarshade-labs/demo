import { Keypair } from '@stellar/stellar-sdk';
import type { StealthKeys } from 'stellar-shade';

/**
 * Identity encryption.
 *
 * Unlike the wallet-signature model (keys re-derived every tab, never stored),
 * a mnemonic/random identity has nothing to re-derive from, so we DO persist it
 * — but only ever as ciphertext. The secret blob is a *vault* of one or more
 * identities (each carrying its stealth private keys + payout secret + mnemonic)
 * sealed as a single unit with AES-256-GCM under a key derived from the user's
 * passphrase via PBKDF2. One passphrase unlocks the whole vault.
 *
 * The 6-hour sliding unlock is a deliberate convenience/security trade the user
 * asked for: after a passphrase unlock we cache the *derived wrap key* (not the
 * passphrase) in localStorage with an expiry, so returning within the window
 * skips the prompt. That means during the window the vault is decryptable by
 * anyone with access to this browser's storage — the same posture the encrypted
 * scan cache already accepts (see stealth/scanCache.ts), scoped here to 6h.
 *
 * Caching the wrap key also lets the provider re-seal the vault (after adding or
 * removing an identity) without re-prompting for the passphrase.
 */

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const PAYOUT_INFO = 'shade-demo-payout/v1';

export const UNLOCK_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const SESSION_KEY = 'shade.identity.session';

export type IdentitySource = 'wallet' | 'mnemonic' | 'random';

export interface PayoutAccount {
  /** G-address funds are claimed into. */
  publicKey: string;
  /** S-secret — present only for self-custodied (mnemonic/random) identities. */
  secret?: string;
}

/** A single identity's secret material. Never touches disk unsealed. */
export interface SecretIdentity {
  version: 1;
  /** Stable identifier, minted once with crypto.randomUUID(). */
  id: string;
  source: IdentitySource;
  stealthKeys: StealthKeys;
  mnemonic?: string;
  payout: PayoutAccount;
  /** Optional user-facing name for the switcher. */
  label?: string;
}

/**
 * The plaintext that gets encrypted: the whole set of identities plus which one
 * is active. Sealed and opened as one unit under the single vault passphrase.
 */
export interface Vault {
  version: 1;
  identities: SecretIdentity[];
  activeId: string;
}

export interface EncryptedBlob {
  v: 1;
  iterations: number;
  salt: string;
  iv: string;
  ct: string;
}

// ---- byte helpers (mirrors scanCache.ts so the two stay consistent) --------

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// ---- payout account --------------------------------------------------------

/**
 * A Stellar keypair deterministically derived from the stealth spend key, so it
 * is recoverable from the same mnemonic (no separate secret to back up). Used as
 * the claim destination + fee context for wallet-free identities.
 */
export async function derivePayoutKeypair(stealthKeys: StealthKeys): Promise<Keypair> {
  const info = new TextEncoder().encode(PAYOUT_INFO);
  const spend = hexToBytes(stealthKeys.spendPrivKey);
  const material = new Uint8Array(info.length + spend.length);
  material.set(info, 0);
  material.set(spend, info.length);
  const digest = await crypto.subtle.digest('SHA-256', material as BufferSource);
  return Keypair.fromRawEd25519Seed(Buffer.from(new Uint8Array(digest)));
}

// ---- passphrase KDF + seal/open --------------------------------------------

async function deriveWrapKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    // Extractable so the 6h session can persist the raw key for auto-unlock.
    true,
    ['encrypt', 'decrypt'],
  );
}

async function seal(vault: Vault, key: CryptoKey, salt: Uint8Array): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(vault));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext as BufferSource,
  );
  return {
    v: 1,
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ciphertext)),
  };
}

async function open(blob: EncryptedBlob, key: CryptoKey): Promise<Vault> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(blob.iv) as BufferSource },
    key,
    fromBase64(blob.ct) as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as Vault;
}

/** A fresh, stable identity id. */
export function newIdentityId(): string {
  return crypto.randomUUID();
}

/** Encrypt the vault fresh (new salt/key), for a first passphrase or a re-key. */
export async function encryptVault(
  vault: Vault,
  passphrase: string,
): Promise<{ blob: EncryptedBlob; key: CryptoKey }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveWrapKey(passphrase, salt, PBKDF2_ITERATIONS);
  const blob = await seal(vault, key, salt);
  return { blob, key };
}

/**
 * Re-seal the vault with a wrap key already held in memory (from the session),
 * so add/remove edits persist without re-prompting for the passphrase. The salt
 * is reused because it's bound to that key; only the IV rotates per encryption.
 */
export async function resealVault(
  vault: Vault,
  key: CryptoKey,
  salt: string,
): Promise<EncryptedBlob> {
  return seal(vault, key, fromBase64(salt));
}

/** Decrypt with a passphrase. Throws (OperationError) if the passphrase is wrong. */
export async function decryptVault(
  blob: EncryptedBlob,
  passphrase: string,
): Promise<{ vault: Vault; key: CryptoKey }> {
  const key = await deriveWrapKey(passphrase, fromBase64(blob.salt), blob.iterations);
  const vault = await open(blob, key);
  return { vault, key };
}

// ---- 6-hour sliding session ------------------------------------------------

interface StoredSession {
  key: string; // base64 raw AES key
  until: number;
}

/** Persist the wrap key for auto-unlock, expiring `UNLOCK_TTL_MS` from now. */
export async function saveSession(key: CryptoKey): Promise<void> {
  try {
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
    const payload: StoredSession = { key: toBase64(raw), until: Date.now() + UNLOCK_TTL_MS };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {
    // No session cache is fine — the user just re-enters the passphrase.
  }
}

/**
 * Load a live session and decrypt the blob without a passphrase. Returns null
 * (and clears the entry) when absent, expired, or invalid. On success the
 * expiry is slid forward another 6h — "back within the window resets it".
 *
 * The imported wrap key is returned alongside the vault so the provider can
 * re-seal after add/remove within the window without re-asking the passphrase.
 */
export async function resumeSession(
  blob: EncryptedBlob,
): Promise<{ vault: Vault; key: CryptoKey } | null> {
  let stored: StoredSession;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    stored = JSON.parse(raw) as StoredSession;
  } catch {
    clearSession();
    return null;
  }

  if (!stored.until || Date.now() >= stored.until) {
    clearSession();
    return null;
  }

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      fromBase64(stored.key) as BufferSource,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
    const vault = await open(blob, key);
    slideSession();
    return { vault, key };
  } catch {
    clearSession();
    return null;
  }
}

/** Bump the expiry to now + 6h, keeping the same key. No-op if no session. */
export function slideSession(): void {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as StoredSession;
    stored.until = Date.now() + UNLOCK_TTL_MS;
    localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
  } catch {
    // ignore
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
