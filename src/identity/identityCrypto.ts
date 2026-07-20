import { Keypair } from '@stellar/stellar-sdk';
import type { StealthKeys } from 'stellar-shade';

/**
 * Identity encryption.
 *
 * Unlike the wallet-signature model (keys re-derived every tab, never stored),
 * a mnemonic/random identity has nothing to re-derive from, so we DO persist it
 * — but only ever as ciphertext. The secret blob (stealth private keys + the
 * payout secret + the mnemonic) is sealed with AES-256-GCM under a key derived
 * from the user's passphrase via PBKDF2.
 *
 * The 6-hour sliding unlock is a deliberate convenience/security trade the user
 * asked for: after a passphrase unlock we cache the *derived wrap key* (not the
 * passphrase) in localStorage with an expiry, so returning within the window
 * skips the prompt. That means during the window the identity is decryptable by
 * anyone with access to this browser's storage — the same posture the encrypted
 * scan cache already accepts (see stealth/scanCache.ts), scoped here to 6h.
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

/** The plaintext that gets encrypted. Never touches disk unsealed. */
export interface SecretIdentity {
  version: 1;
  source: IdentitySource;
  stealthKeys: StealthKeys;
  mnemonic?: string;
  payout: PayoutAccount;
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

async function seal(secret: SecretIdentity, key: CryptoKey, salt: Uint8Array): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(secret));
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

async function open(blob: EncryptedBlob, key: CryptoKey): Promise<SecretIdentity> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(blob.iv) as BufferSource },
    key,
    fromBase64(blob.ct) as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as SecretIdentity;
}

/** Encrypt an identity, returning the ciphertext and the wrap key for the session. */
export async function encryptIdentity(
  secret: SecretIdentity,
  passphrase: string,
): Promise<{ blob: EncryptedBlob; key: CryptoKey }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveWrapKey(passphrase, salt, PBKDF2_ITERATIONS);
  const blob = await seal(secret, key, salt);
  return { blob, key };
}

/** Decrypt with a passphrase. Throws (OperationError) if the passphrase is wrong. */
export async function decryptIdentity(
  blob: EncryptedBlob,
  passphrase: string,
): Promise<{ secret: SecretIdentity; key: CryptoKey }> {
  const key = await deriveWrapKey(passphrase, fromBase64(blob.salt), blob.iterations);
  const secret = await open(blob, key);
  return { secret, key };
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
 */
export async function resumeSession(blob: EncryptedBlob): Promise<SecretIdentity | null> {
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
    const secret = await open(blob, key);
    slideSession();
    return secret;
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
