import type { NetworkName } from 'stellar-shade';

/**
 * Single source of truth for network configuration. Everything comes from the
 * environment — nothing about the network is hardcoded anywhere else in the app.
 */

function required(key: string): string {
  const value = import.meta.env[key as keyof ImportMetaEnv] as string | undefined;
  if (!value || !value.trim()) {
    throw new Error(
      `Missing environment variable ${key}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value.trim();
}

function optional(key: string, fallback: string): string {
  const value = import.meta.env[key as keyof ImportMetaEnv] as string | undefined;
  return value && value.trim() ? value.trim() : fallback;
}

const networkName = required('VITE_STELLAR_NETWORK');

if (networkName !== 'testnet' && networkName !== 'mainnet') {
  throw new Error(`VITE_STELLAR_NETWORK must be "testnet" or "mainnet", got "${networkName}"`);
}

export const NETWORK = {
  name: networkName as NetworkName,
  /** Human label for the badge in the top bar. */
  label: networkName === 'testnet' ? 'Testnet' : 'Mainnet',
  isTestnet: networkName === 'testnet',
  passphrase: required('VITE_NETWORK_PASSPHRASE'),
  contractId: required('VITE_SHADE_CONTRACT_ID'),
  relayerUrl: required('VITE_RELAYER_URL'),
  indexerUrl: required('VITE_INDEXER_URL'),
  sorobanRpcUrl: required('VITE_SOROBAN_RPC_URL'),
  horizonUrl: required('VITE_HORIZON_URL'),
  /** Account data-entry key that carries a published meta-address. */
  metaDataKey: required('VITE_META_DATA_KEY'),
  /** Account data-entry key that carries the receiver's preferred delivery method. */
  metaMethodKey: optional('VITE_META_METHOD_KEY', 'shade:method'),
} as const;

/** Block explorer link for a transaction hash. */
export function explorerTxUrl(hash: string): string {
  return `https://stellar.expert/explorer/${NETWORK.isTestnet ? 'testnet' : 'public'}/tx/${hash}`;
}

/** Block explorer link for an account. */
export function explorerAccountUrl(address: string): string {
  return `https://stellar.expert/explorer/${NETWORK.isTestnet ? 'testnet' : 'public'}/account/${address}`;
}
