// Must come first: it repairs `fetch` before any client captures it.
import './fetchShim';

import { StealthClient, RelayerClient, IndexerClient } from 'stellar-shade';
import { NETWORK } from '@/config/network';

/**
 * Shade client singletons.
 *
 * Note the constructor shapes differ between clients: `StealthClient` takes a
 * config object, while `RelayerClient` and `IndexerClient` take the base URL as
 * a positional argument.
 */

export const stealthClient = new StealthClient({
  network: NETWORK.name,
  contractId: NETWORK.contractId,
  // Both delivery methods are enabled: the receiver picks which one senders use
  // (see settings + metaRegistry method preference). 'pool' routes value through
  // the Soroban contract; 'account' pays a one-time classic Stellar account.
  methods: ['pool', 'account'],
  horizonUrl: NETWORK.horizonUrl,
  indexerUrl: NETWORK.indexerUrl,
  // NOTE: `relayer` is deliberately NOT set here. A constructor-level relayer
  // becomes a silent fallback for every claim (`opts.relay ?? this.relayer`),
  // which means a credit-gated relayer would fail every claim with no way for
  // the user to opt out. Relaying is passed per-call instead, from the UI.
});

export const relayerClient = new RelayerClient(NETWORK.relayerUrl);

export const indexerClient = new IndexerClient(NETWORK.indexerUrl);

/**
 * Fallback delivery method when the receiver's preference is unknown (e.g. a
 * raw meta-address with no account to read, or an unpublished account). 'auto'
 * lets the SDK pick the cheapest route that works (account for native XLM > 1,
 * pool otherwise), and resolves fine even with no account to read.
 */
export const DEFAULT_METHOD = 'auto' as const;
