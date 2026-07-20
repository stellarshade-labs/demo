/** Display helpers. Addresses and amounts are always shown in monospace. */

/** `GDXY…7K2M` — enough head and tail to eyeball-verify against a wallet. */
export function truncate(value: string | undefined | null, head = 6, tail = 4): string {
  if (!value) return '—';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Meta-addresses are long and prefixed; drop the scheme before truncating. */
export function truncateMeta(meta: string | undefined | null): string {
  if (!meta) return '—';
  const body = meta.startsWith('shade:stellar:') ? meta.slice('shade:stellar:'.length) : meta;
  return truncate(body, 8, 6);
}

const amountFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 7,
});

export function formatAmount(amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  return amountFormatter.format(amount);
}

/** Relative time for feeds ("4m ago"); falls back to a date past a week. */
export function timeAgo(iso: string | number | undefined): string {
  if (iso === undefined) return '—';
  const then = typeof iso === 'number' ? iso : Date.parse(iso);
  if (Number.isNaN(then)) return '—';
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}

/** Basic shape check so we can validate before hitting the network. */
export function looksLikeStellarAddress(value: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(value.trim());
}

export function looksLikeMetaAddress(value: string): boolean {
  return /^shade:stellar:[0-9a-fA-F]{136}$/.test(value.trim());
}

/** Label for a Payment's asset — pool payments carry `asset`, others don't. */
export function assetLabel(payment: { asset?: string; token: string }): string {
  if (payment.asset) return payment.asset;
  return payment.token === 'native' ? 'XLM' : payment.token;
}
