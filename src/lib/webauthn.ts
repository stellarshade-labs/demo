/**
 * WebAuthn passkey helpers, built on the **PRF extension**.
 *
 * The goal is a passwordless unlock: enroll a platform passkey whose PRF output
 * (a stable, high-entropy secret the authenticator derives from a fixed salt +
 * its own key material) is used to wrap the vault's raw AES wrap key. On unlock
 * the same passkey reproduces the same PRF output, we unwrap the key, and hand
 * the raw bytes to `decryptVaultWithRawKey` — no passphrase typed.
 *
 * WHY PRF and not "store the key on the authenticator": WebAuthn can't store
 * arbitrary secrets, but the PRF (HMAC-secret) extension lets us evaluate a
 * pseudo-random function keyed by the credential. The PRF output NEVER leaves as
 * ciphertext-at-rest — only the *wrapped* vault key is persisted; the passkey is
 * required to reproduce the wrapping secret.
 *
 * CAPABILITY MODEL — critical: PRF support cannot be feature-detected up front.
 * `window.PublicKeyCredential` tells us WebAuthn exists, but whether the *actual*
 * authenticator honours PRF is only known AFTER a ceremony, by reading
 * `getClientExtensionResults().prf`. So enrollment is best-effort: if the
 * results don't carry a usable PRF secret we throw `PrfUnsupportedError`, the
 * caller shows a graceful message, and passphrase unlock is never disturbed.
 *
 * All crypto lives in identityCrypto.ts; this file only speaks WebAuthn + HKDF
 * of the PRF secret into a wrapping key, and the wrap/unwrap of raw key bytes.
 */

const RP_NAME = 'Shade';
/** Stable label shown on the authenticator / OS passkey UI. */
const USER_NAME = 'Shade vault';
/**
 * Fixed PRF eval salt. PRF output is a function of (credential, salt); we use a
 * single constant salt so enrollment and every later unlock derive the SAME
 * secret. It is not itself sensitive — the security comes from the credential.
 */
const PRF_SALT = new TextEncoder().encode('shade.identity.prf/v1');
const HKDF_INFO = new TextEncoder().encode('shade-passkey-wrap/v1');
const WRAP_IV_BYTES = 12;

export class PrfUnsupportedError extends Error {
  constructor() {
    super(
      'This device or passkey does not support the PRF extension needed for passkey unlock.',
    );
    this.name = 'PrfUnsupportedError';
  }
}

// ---- byte helpers (self-contained; base64url for URL/QR safety) ------------

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    '=',
  );
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// ---- capability detection --------------------------------------------------

/** Cheap, synchronous check: does this browser expose the WebAuthn API at all? */
export function isWebAuthnAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.credentials?.create) &&
    Boolean(navigator.credentials?.get)
  );
}

/**
 * Best-effort async probe for a platform authenticator. PRF itself can't be
 * probed without a ceremony, so callers still handle `PrfUnsupportedError`; this
 * only gates whether it's worth *offering* enrollment at all.
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnAvailable()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// ---- PRF secret → wrapping key (HKDF) --------------------------------------

/** Read the PRF `first` output from a ceremony's extension results, or null.
 *  Normalised to a fresh, standalone ArrayBuffer for HKDF import. */
function readPrfSecret(cred: PublicKeyCredential): ArrayBuffer | null {
  const results = cred.getClientExtensionResults() as {
    prf?: { enabled?: boolean; results?: { first?: BufferSource } };
  };
  const first = results.prf?.results?.first;
  if (!first) return null;
  const view = first instanceof ArrayBuffer ? new Uint8Array(first) : new Uint8Array(first.buffer, first.byteOffset, first.byteLength);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

/** HKDF the raw PRF secret into an AES-GCM wrapping key. */
async function wrapKeyFromPrf(prfSecret: ArrayBuffer, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', prfSecret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: HKDF_INFO as BufferSource },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ---- stored passkey record -------------------------------------------------

/** Persisted (non-secret) passkey record. `wrappedKey` is the vault wrap key
 *  encrypted under the PRF-derived key; useless without the passkey. */
export interface PasskeyRecord {
  version: 1;
  /** base64url credential id, replayed on unlock so the right passkey is used. */
  credentialId: string;
  /** base64url HKDF salt (rotated per enrollment). */
  hkdfSalt: string;
  /** base64url AES-GCM IV for the wrapped key. */
  iv: string;
  /** base64url ciphertext of the raw vault wrap key. */
  wrappedKey: string;
  createdAt: number;
}

// ---- enrollment ------------------------------------------------------------

/**
 * Enroll a new passkey and wrap `rawVaultKey` under its PRF secret.
 *
 * Chrome usually does NOT return PRF results from `create` (only advertises
 * `prf.enabled`), so after creating the credential we run a follow-up `get`
 * with `prf.eval` to actually obtain the secret. Firefox/Safari may return it
 * straight from `create`; we handle both. Throws `PrfUnsupportedError` when no
 * usable PRF secret materialises.
 */
export async function enrollPasskey(rawVaultKey: Uint8Array): Promise<PasskeyRecord> {
  if (!isWebAuthnAvailable()) throw new PrfUnsupportedError();

  const userId = crypto.getRandomValues(new Uint8Array(16));
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const created = (await navigator.credentials.create({
    publicKey: {
      rp: { name: RP_NAME, id: window.location.hostname },
      user: { id: userId as BufferSource, name: USER_NAME, displayName: USER_NAME },
      challenge: challenge as BufferSource,
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required',
      },
      timeout: 60_000,
      extensions: {
        // Ask the authenticator to enable PRF and, where supported, evaluate it
        // right away.
        prf: { eval: { first: PRF_SALT as BufferSource } },
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!created) throw new PrfUnsupportedError();

  const createResults = created.getClientExtensionResults() as {
    prf?: { enabled?: boolean; results?: { first?: BufferSource } };
  };
  // If PRF wasn't even enabled on this credential, it can never unlock — bail
  // before wrapping anything so we never persist an unusable passkey.
  if (!createResults.prf?.enabled && !createResults.prf?.results?.first) {
    throw new PrfUnsupportedError();
  }

  const credentialId = new Uint8Array(created.rawId);

  // Get the PRF secret — from `create` if present, else via a follow-up `get`.
  let prfSecret = readPrfSecret(created);
  if (!prfSecret) {
    prfSecret = await evaluatePrf(credentialId);
  }
  if (!prfSecret) throw new PrfUnsupportedError();

  const hkdfSalt = crypto.getRandomValues(new Uint8Array(16));
  const wrapKey = await wrapKeyFromPrf(prfSecret, hkdfSalt);
  const iv = crypto.getRandomValues(new Uint8Array(WRAP_IV_BYTES));
  const wrapped = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      wrapKey,
      rawVaultKey as BufferSource,
    ),
  );

  return {
    version: 1,
    credentialId: bytesToBase64Url(credentialId),
    hkdfSalt: bytesToBase64Url(hkdfSalt),
    iv: bytesToBase64Url(iv),
    wrappedKey: bytesToBase64Url(wrapped),
    createdAt: Date.now(),
  };
}

/**
 * Run an assertion (`get`) against a specific credential and return its PRF
 * secret, or null when the authenticator produced none.
 */
async function evaluatePrf(credentialId: Uint8Array): Promise<ArrayBuffer | null> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const asserted = (await navigator.credentials.get({
    publicKey: {
      challenge: challenge as BufferSource,
      allowCredentials: [{ type: 'public-key', id: credentialId as BufferSource }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: {
        prf: { eval: { first: PRF_SALT as BufferSource } },
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!asserted) return null;
  return readPrfSecret(asserted);
}

// ---- unlock ----------------------------------------------------------------

/**
 * Unlock with a stored passkey: assert the credential, reproduce the PRF secret,
 * HKDF it back into the wrapping key, and unwrap the raw vault key. Throws
 * `PrfUnsupportedError` if the authenticator no longer yields a PRF secret, or
 * the native error if the ceremony is cancelled.
 */
export async function unwrapVaultKeyWithPasskey(record: PasskeyRecord): Promise<Uint8Array> {
  if (!isWebAuthnAvailable()) throw new PrfUnsupportedError();

  const credentialId = base64UrlToBytes(record.credentialId);
  const prfSecret = await evaluatePrf(credentialId);
  if (!prfSecret) throw new PrfUnsupportedError();

  const wrapKey = await wrapKeyFromPrf(prfSecret, base64UrlToBytes(record.hkdfSalt));
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(record.iv) as BufferSource },
    wrapKey,
    base64UrlToBytes(record.wrappedKey) as BufferSource,
  );
  return new Uint8Array(raw);
}
