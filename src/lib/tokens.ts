/**
 * Quick-access tokens for payment requests.
 *
 * Issuers are Stellar MAINNET addresses. This demo runs on testnet, where they
 * won't resolve, so the asset field in the UI stays fully editable — a blank or
 * wrong issuer is easily corrected. Edit this list to curate the quick chips for
 * your own deployment. (Only USDC ships with a preset issuer; the others are
 * intentionally left blank rather than guessed, so you paste the right one.)
 */
export interface CommonToken {
  code: string;
  /** Issuer G-address, or '' when it must be supplied per network. */
  issuer: string;
  label: string;
}

export const COMMON_TOKENS: CommonToken[] = [
  { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', label: 'USD Coin' },
  { code: 'USDT', issuer: '', label: 'Tether USD' },
  { code: 'EURC', issuer: '', label: 'Euro Coin' },
];

/** `CODE:ISSUER` (or just `CODE` when the issuer isn't preset yet). */
export function assetString(token: CommonToken): string {
  return token.issuer ? `${token.code}:${token.issuer}` : token.code;
}

/** A complete token asset is `CODE:ISSUER` with a valid Stellar issuer. */
export function isCompleteAsset(asset: string): boolean {
  const [code, issuer] = asset.trim().split(':');
  return Boolean(code) && /^G[A-Z2-7]{55}$/.test(issuer ?? '');
}
