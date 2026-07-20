import {
  BASE_FEE,
  Horizon,
  Operation,
  TransactionBuilder,
  type Transaction,
} from '@stellar/stellar-sdk';
import type { TransactionSigner } from 'stellar-shade';
import { NETWORK } from '@/config/network';

/**
 * Meta-address resolution — the one piece Shade itself does not provide.
 *
 * A stealth meta-address is derived from the recipient's wallet *signature*, so
 * it cannot be computed from their public `G...` key: if it could, anyone could
 * also derive their spend and view private keys. The pool contract has no
 * registry either, and the indexer only exposes /health and /announcements.
 *
 * So to let a sender simply type "GABC…", the recipient must publish their
 * meta-address themselves. We do that Stellar-natively, with a `manageData`
 * entry on the recipient's own account:
 *
 *   key   = VITE_META_DATA_KEY (default "shade:meta")
 *   value = spendPubKey (32 bytes) || viewPubKey (32 bytes) = exactly 64 bytes
 *
 * 64 bytes is precisely Stellar's data-entry value limit, so the payload fits
 * without truncation. The meta-address's 4-byte checksum is derived from the
 * payload, so we recompute rather than store it.
 *
 * This is public, on-chain data by design — it only says "this account accepts
 * stealth payments at this meta-address". It reveals nothing about which stealth
 * addresses the account later receives at; that unlinkability is what the view
 * key protects.
 */

const META_PREFIX = 'shade:stellar:';
const PAYLOAD_BYTES = 64;

const horizon = new Horizon.Server(NETWORK.horizonUrl);

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** The SDK's checksum: the last 4 bytes of SHA-256 over the 64-byte payload. */
async function checksumFor(payload: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', payload as BufferSource);
  return new Uint8Array(digest).slice(28, 32);
}

/** `shade:stellar:<hex>` -> the 64-byte spend||view payload. */
export function metaAddressToPayload(metaAddress: string): Uint8Array {
  const trimmed = metaAddress.trim();
  if (!trimmed.startsWith(META_PREFIX)) {
    throw new Error('Not a Shade meta-address.');
  }
  const hex = trimmed.slice(META_PREFIX.length);
  if (!/^[0-9a-fA-F]{136}$/.test(hex)) {
    throw new Error('Malformed meta-address.');
  }
  return hexToBytes(hex).slice(0, PAYLOAD_BYTES);
}

/** The 64-byte payload -> `shade:stellar:<hex>`, checksum recomputed. */
export async function payloadToMetaAddress(payload: Uint8Array): Promise<string> {
  if (payload.length !== PAYLOAD_BYTES) {
    throw new Error(`Expected ${PAYLOAD_BYTES} bytes, got ${payload.length}.`);
  }
  const checksum = await checksumFor(payload);
  const combined = new Uint8Array(PAYLOAD_BYTES + 4);
  combined.set(payload, 0);
  combined.set(checksum, PAYLOAD_BYTES);
  return `${META_PREFIX}${bytesToHex(combined)}`;
}

export type ResolveOutcome =
  | { status: 'found'; metaAddress: string }
  | { status: 'not-registered' }
  | { status: 'no-account' };

// Resolutions are stable within a session and a sender may retype an address
// several times; avoid hammering Horizon for the same answer.
const resolveCache = new Map<string, ResolveOutcome>();

/**
 * Look up the meta-address published by a `G...` account.
 * Returns a discriminated outcome rather than throwing, because "not registered"
 * is an ordinary, expected state the UI has to explain.
 */
export async function resolveMetaAddress(address: string): Promise<ResolveOutcome> {
  const key = address.trim();
  const cached = resolveCache.get(key);
  if (cached) return cached;

  let outcome: ResolveOutcome;
  try {
    const account = await horizon.loadAccount(key);
    const encoded = account.data_attr?.[NETWORK.metaDataKey];
    if (!encoded) {
      outcome = { status: 'not-registered' };
    } else {
      const payload = base64ToBytes(encoded);
      if (payload.length !== PAYLOAD_BYTES) {
        // Someone wrote a differently-shaped value under our key.
        outcome = { status: 'not-registered' };
      } else {
        outcome = { status: 'found', metaAddress: await payloadToMetaAddress(payload) };
      }
    }
  } catch (error) {
    if (isNotFound(error)) {
      outcome = { status: 'no-account' };
    } else {
      throw error;
    }
  }

  resolveCache.set(key, outcome);
  return outcome;
}

/** Drop a cached resolution — call after publishing so the sender sees it. */
export function invalidateResolution(address: string): void {
  resolveCache.delete(address.trim());
}

/**
 * Publish `metaAddress` as a data entry on `address`, signed by the connected
 * wallet. Creating a data entry raises the account's base reserve by 0.5 XLM.
 */
export async function publishMetaAddress(
  address: string,
  metaAddress: string,
  signTransaction: TransactionSigner,
): Promise<{ txHash: string }> {
  const payload = metaAddressToPayload(metaAddress);
  const account = await horizon.loadAccount(address);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(
      Operation.manageData({
        name: NETWORK.metaDataKey,
        value: Buffer.from(payload),
      }),
    )
    .setTimeout(180)
    .build();

  const signedXdr = await signTransaction(tx.toXDR(), {
    networkPassphrase: NETWORK.passphrase,
    address,
  });

  const signed = TransactionBuilder.fromXDR(signedXdr, NETWORK.passphrase) as Transaction;
  const result = await horizon.submitTransaction(signed);

  invalidateResolution(address);
  return { txHash: result.hash };
}

/** Remove a published meta-address, releasing the 0.5 XLM reserve. */
export async function unpublishMetaAddress(
  address: string,
  signTransaction: TransactionSigner,
): Promise<{ txHash: string }> {
  const account = await horizon.loadAccount(address);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(Operation.manageData({ name: NETWORK.metaDataKey, value: null }))
    .setTimeout(180)
    .build();

  const signedXdr = await signTransaction(tx.toXDR(), {
    networkPassphrase: NETWORK.passphrase,
    address,
  });

  const signed = TransactionBuilder.fromXDR(signedXdr, NETWORK.passphrase) as Transaction;
  const result = await horizon.submitTransaction(signed);

  invalidateResolution(address);
  return { txHash: result.hash };
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function isNotFound(error: unknown): boolean {
  const status = (error as { response?: { status?: number }; status?: number } | null)?.response
    ?.status;
  return status === 404 || (error as { status?: number } | null)?.status === 404;
}
