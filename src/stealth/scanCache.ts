import type { Payment, ScanCursor, StealthKeys } from 'stellar-shade';

/**
 * Encrypted, per-account cache of scan results.
 *
 * Payments are not secret keys, but each one links a one-time stealth address
 * to the meta-address that received it — which is precisely the correlation the
 * protocol exists to hide. Writing that to localStorage in the clear would
 * undercut the whole demo, so the cache is sealed with AES-256-GCM.
 *
 * The key is derived with HKDF from the stealth *view* private key under a
 * dedicated info tag, so it is bound to the wallet (you cannot decrypt the cache
 * without re-deriving the keys) and is domain-separated from the key material
 * itself. Anyone able to derive the view key could rescan from scratch anyway,
 * so this costs nothing in security and buys an instant reload.
 */

const STORAGE_PREFIX = 'shade.scan.';
const HKDF_INFO = 'shade-demo-scan-cache/v1';
const IV_BYTES = 12;

export interface CachedScan {
  payments: Payment[];
  cursor: ScanCursor;
  updatedAt: number;
  /** Stealth addresses already claimed, so the UI can grey them out. */
  claimed: string[];
}

function storageKey(address: string): string {
  return `${STORAGE_PREFIX}${address}`;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function cacheKey(keys: StealthKeys): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    hexToBytes(keys.viewPrivKey) as BufferSource,
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      // The spend public key is a stable, non-secret per-identity value, which
      // is exactly what a salt should be.
      salt: hexToBytes(keys.spendPubKey) as BufferSource,
      info: new TextEncoder().encode(HKDF_INFO),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
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

export async function saveScanCache(
  address: string,
  keys: StealthKeys,
  data: CachedScan,
): Promise<void> {
  try {
    const key = await cacheKey(keys);
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      plaintext as BufferSource,
    );
    localStorage.setItem(
      storageKey(address),
      JSON.stringify({ v: 1, iv: toBase64(iv), ct: toBase64(new Uint8Array(ciphertext)) }),
    );
  } catch {
    // A full or unavailable localStorage must never break scanning.
  }
}

export async function loadScanCache(
  address: string,
  keys: StealthKeys,
): Promise<CachedScan | null> {
  const raw = localStorage.getItem(storageKey(address));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { v?: number; iv?: string; ct?: string };
    if (parsed.v !== 1 || !parsed.iv || !parsed.ct) throw new Error('unsupported cache');

    const key = await cacheKey(keys);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(parsed.iv) as BufferSource },
      key,
      fromBase64(parsed.ct) as BufferSource,
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as CachedScan;
  } catch {
    // Wrong keys, a format change, or a corrupt entry: drop it and rescan.
    // Never a hard failure — the chain is always the source of truth.
    localStorage.removeItem(storageKey(address));
    return null;
  }
}

export function clearScanCache(address?: string): void {
  if (address) {
    localStorage.removeItem(storageKey(address));
    return;
  }
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
  }
}

/** True when an encrypted cache exists, without needing the keys to check. */
export function hasScanCache(address: string): boolean {
  return localStorage.getItem(storageKey(address)) !== null;
}
