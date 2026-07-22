/**
 * Quick-access tokens for payment requests.
 *
 * The list is curated per network off NETWORK.isTestnet so every chip resolves
 * on the network the demo is actually running against: testnet issuers on
 * testnet, mainnet issuers on mainnet. Only assets with a verified issuer for
 * the active network are shown — placeholders with blank or wrong issuers are
 * deliberately omitted. Edit these lists to curate the quick chips for your own
 * deployment.
 */
import { NETWORK } from '@/config/network';

export interface CommonToken {
  code: string;
  /** Issuer G-address, or '' when it must be supplied per network. */
  issuer: string;
  label: string;
}

// Circle's USDC on Stellar testnet (verified: StellarExpert testnet + Circle docs).
const TESTNET_TOKENS: CommonToken[] = [
  { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', label: 'USD Coin' },
];

// Circle's USDC on Stellar mainnet. EURC is intentionally left out until a
// verified mainnet EURC issuer is added rather than guessing one. USDT is
// dropped entirely — there is no reliable canonical Stellar USDT issuer.
const MAINNET_TOKENS: CommonToken[] = [
  { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', label: 'USD Coin' },
];

export const COMMON_TOKENS: CommonToken[] = NETWORK.isTestnet ? TESTNET_TOKENS : MAINNET_TOKENS;

/** `CODE:ISSUER` (or just `CODE` when the issuer isn't preset yet). */
export function assetString(token: CommonToken): string {
  return token.issuer ? `${token.code}:${token.issuer}` : token.code;
}

/** A complete token asset is `CODE:ISSUER` with a valid Stellar issuer. */
export function isCompleteAsset(asset: string): boolean {
  const [code, issuer] = asset.trim().split(':');
  return Boolean(code) && /^G[A-Z2-7]{55}$/.test(issuer ?? '');
}
