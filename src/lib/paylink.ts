import { looksLikeMetaAddress } from '@/lib/format';

/**
 * Payment links: a plain app URL (`/send?to=…&amount=…&asset=…`) that pre-fills
 * the Send form. Shareable as a link or QR, and reduces the friction of handing
 * out a 136-char meta-address in private mode.
 */

export interface PayParams {
  /** Recipient — a G-address or a shade meta-address. */
  to: string;
  amount?: string;
  /** Asset code or CODE:ISSUER; empty/absent means native XLM. */
  asset?: string;
}

export function buildPayLink(params: PayParams, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const url = new URL('/send', base || 'https://shade.app');
  url.searchParams.set('to', params.to.trim());
  if (params.amount) url.searchParams.set('amount', params.amount);
  if (params.asset && params.asset.trim()) url.searchParams.set('asset', params.asset.trim());
  return url.toString();
}

export function parsePayParams(sp: URLSearchParams): PayParams | null {
  const to = sp.get('to')?.trim();
  if (!to) return null;
  return {
    to,
    amount: sp.get('amount')?.trim() || undefined,
    asset: sp.get('asset')?.trim() || undefined,
  };
}

/** Infer the Send mode from the recipient string in a pay link. */
export function modeForRecipient(to: string): 'public' | 'meta' {
  return looksLikeMetaAddress(to) ? 'meta' : 'public';
}
