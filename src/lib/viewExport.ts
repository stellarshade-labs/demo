import type { StealthKeys } from 'stellar-shade';

/**
 * View-only export / import.
 *
 * A *view key* (`viewPrivKey`) plus the public `spendPubKey` is exactly what the
 * SDK needs to SCAN for incoming payments — but NOT to spend them. So we can
 * hand someone (or another device) a compact string that lets them watch an
 * identity read-only, while the spend authority (`spendPrivKey`) never leaves.
 *
 * Format: `shade:view:<base64url(json)>` where the JSON carries only public /
 * view-safe fields. We include `viewPubKey` + `metaAddress` too (both public) so
 * the importer can rebuild a full-shaped `StealthKeys` without re-deriving.
 *
 * INVARIANT: `spendPrivKey` and any payout secret MUST NEVER appear here.
 */

export const VIEW_PREFIX = 'shade:view:';

interface ViewPayload {
  v: 1;
  meta: string; // metaAddress (shade:stellar:...)
  vpriv: string; // viewPrivKey (hex) — the shareable scan key
  vpub: string; // viewPubKey (hex)
  spub: string; // spendPubKey (hex) — public
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToString(value: string): string {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  return atob(padded);
}

/**
 * Build a `shade:view:` string for an identity. Reads only view-safe fields off
 * `StealthKeys`; the spend private key is intentionally never referenced.
 */
export function buildViewExport(keys: Pick<
  StealthKeys,
  'metaAddress' | 'viewPrivKey' | 'viewPubKey' | 'spendPubKey'
>): string {
  const payload: ViewPayload = {
    v: 1,
    meta: keys.metaAddress,
    vpriv: keys.viewPrivKey,
    vpub: keys.viewPubKey,
    spub: keys.spendPubKey,
  };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  return VIEW_PREFIX + bytesToBase64Url(json);
}

export interface ParsedViewExport {
  metaAddress: string;
  viewPrivKey: string;
  viewPubKey: string;
  spendPubKey: string;
}

/**
 * Parse a `shade:view:` string. Returns null on any malformed / non-view input
 * so callers can show a friendly error instead of throwing.
 */
export function parseViewExport(input: string): ParsedViewExport | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith(VIEW_PREFIX)) return null;
  try {
    const json = base64UrlToString(trimmed.slice(VIEW_PREFIX.length));
    const payload = JSON.parse(json) as Partial<ViewPayload>;
    if (
      payload.v !== 1 ||
      typeof payload.meta !== 'string' ||
      typeof payload.vpriv !== 'string' ||
      typeof payload.vpub !== 'string' ||
      typeof payload.spub !== 'string'
    ) {
      return null;
    }
    return {
      metaAddress: payload.meta,
      viewPrivKey: payload.vpriv,
      viewPubKey: payload.vpub,
      spendPubKey: payload.spub,
    };
  } catch {
    return null;
  }
}

/**
 * Turn a parsed view export into a partial `StealthKeys` suitable for SCANNING
 * only. `spendPrivKey` is deliberately empty — the SDK's scan path needs
 * `viewPrivKey` + `spendPubKey`, never the spend secret. Any attempt to CLAIM
 * with this will (and should) fail; the UI disables claiming for watch-only.
 */
export function viewKeysToStealthKeys(parsed: ParsedViewExport): StealthKeys {
  return {
    metaAddress: parsed.metaAddress,
    spendPubKey: parsed.spendPubKey,
    spendPrivKey: '',
    viewPubKey: parsed.viewPubKey,
    viewPrivKey: parsed.viewPrivKey,
  };
}
