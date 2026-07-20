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
  methods: ['pool'],
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
 * The only delivery method this demo enables. The pool method routes value
 * through the Soroban stealth-pool contract, which is what `VITE_SHADE_CONTRACT_ID`
 * points at.
 */
export const DELIVERY_METHOD = 'pool' as const;
