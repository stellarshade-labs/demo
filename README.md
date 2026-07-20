# Shade Demo

A reference dapp for the [Shade](https://www.npmjs.com/package/stellar-shade) protocol —
stealth addresses and unlinkable transfers on Stellar.

Funds are sent to a fresh one-time address derived per transfer, so nothing on-chain links a payment
to the recipient's account. Senders can address a recipient either by their ordinary Stellar public
key or by their stealth meta-address; both paths converge on the same transfer.

> [!WARNING]
> Runs on Stellar **testnet**. The Shade protocol's cryptography is pending external audit — do not
> use it with real value.

## Contents

- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Meta-address resolution](#meta-address-resolution)
- [Data persistence](#data-persistence)
- [Architecture](#architecture)
- [SDK compatibility notes](#sdk-compatibility-notes)
- [Walkthrough](#walkthrough)
- [Tech stack](#tech-stack)

## Requirements

- Node.js 18 or newer
- A Stellar wallet browser extension — [Freighter](https://www.freighter.app/) is recommended and is
  the only wallet that supports receiving (see [Wallet support](#wallet-support))

## Getting started

```bash
git clone https://github.com/stellarshade-labs/demo.git
cd demo
npm install
cp .env.example .env
npm run dev
```

Vite prints the local development URL on startup. Open it, then connect your wallet with the network
set to **Testnet**. New accounts can be funded from [Friendbot](https://friendbot.stellar.org).

### Scripts

| Script              | Description                              |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Start the development server with HMR    |
| `npm run build`     | Type-check and build to `dist/`          |
| `npm run preview`   | Serve the production build locally       |
| `npm run typecheck` | Type-check only, no output               |

## Configuration

All network configuration is supplied through environment variables; no endpoint or contract
identifier is hardcoded in application code. Copy `.env.example` to `.env` and adjust as needed:

```env
VITE_STELLAR_NETWORK=testnet
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015

# Shade stealth pool contract (Soroban)
VITE_SHADE_CONTRACT_ID=CDQBZZ5B2GUE7RG6NDWLZYE7TLSQAEZODGRO565GKAHN73C2SGVG76BX

# Shade services
VITE_RELAYER_URL=https://shaderelayer-production.up.railway.app
VITE_INDEXER_URL=https://shadeindexer-production.up.railway.app

# Stellar infrastructure
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
VITE_HORIZON_URL=https://horizon-testnet.stellar.org

# Account data-entry key used to publish a meta-address
VITE_META_DATA_KEY=shade:meta
```

`src/config/network.ts` validates these at startup and fails fast if any are missing.

## Meta-address resolution

Addressing a recipient by their ordinary `G...` public key requires a resolution step that the Shade
SDK does not provide, and cannot: a meta-address is derived from the recipient's wallet *signature*,
so it is not computable from their public key. Were it computable, their spend and view private keys
would be derivable too. The pool contract holds no registry, and the indexer exposes only `/health`
and `/announcements`.

This application supplies that layer using a native Stellar primitive, with no backend service.

**Publishing.** From the Receive view, the recipient writes a `manageData` entry to their own
account:

```
key   = shade:meta
value = spendPubKey (32 bytes) || viewPubKey (32 bytes)   = 64 bytes
```

64 bytes is exactly Stellar's data-entry value limit, so the payload fits without truncation. The
meta-address checksum is a function of the payload and is recomputed on read rather than stored.
Creating the entry raises the account's base reserve by 0.5 XLM, released if the entry is removed.

**Resolving.** From the Send view, the application loads the account from Horizon, reads the data
entry, and reconstructs the meta-address. Accounts that have not published one are reported clearly,
with the meta-address input offered as the alternative.

Both input modes then call `stealthClient.send(metaAddress, …)` identically — the public-key mode has
simply looked up what the meta-address mode was given directly.

Publishing is opt-in and public. The entry asserts only that an account accepts stealth payments at a
given meta-address; it reveals nothing about the stealth addresses that account subsequently
receives at.

Implementation: `src/lib/metaRegistry.ts`, verified byte-exact against the SDK's own encoder.

## Data persistence

Session state survives page reloads and browser restarts, tiered by sensitivity:

| Data                                        | Storage                         | After a reload                        |
| ------------------------------------------- | ------------------------------- | ------------------------------------- |
| Connected address, wallet, UI preferences   | `localStorage`, plaintext       | Restored immediately, auto-reconnect  |
| Send / claim / publish history              | `localStorage`, plaintext       | Restored immediately                  |
| Detected payments and scan cursor           | `localStorage`, **AES-256-GCM** | One signature to unlock, then instant |
| Stealth spend and view private keys         | **Not persisted** — memory only | Re-derived from a wallet signature    |

Private keys are never written to storage in any form. Detected payments are cached because
rescanning is slow, but each record links a one-time stealth address to an identity — precisely the
correlation the protocol exists to break — so the cache is sealed with a key derived via HKDF from
the view key under a dedicated info tag. A cache that cannot be decrypted is discarded and rebuilt:
the chain remains the source of truth. Disconnecting clears it.

See `src/stealth/scanCache.ts` and `src/store/session.ts`.

## Architecture

```
src/
  config/network.ts          Environment-driven network config, explorer links
  lib/
    fetchShim.ts             Global fetch binding (see SDK compatibility notes)
    shade.ts                 StealthClient / RelayerClient / IndexerClient instances
    metaRegistry.ts          manageData publish and resolve
    errors.ts                ShadeError codes mapped to user-facing messages
    format.ts                Address truncation, amounts, relative time
    useServiceHealth.ts      Relayer and indexer liveness polling
  wallet/
    types.ts                 WalletConnector interface
    connectors/              Freighter, xBull, Albedo
    WalletProvider.tsx       Connection, auto-reconnect, signer adapters
    useAvailability.ts       Extension detection tolerant of late injection
  stealth/
    StealthKeysProvider.tsx  Key derivation, held in memory only
    useScan.ts               Incremental scanning with cursor
    scanCache.ts             Encrypted payment cache
  store/session.ts           Zustand with persistence
  components/                Layout, wallet, and UI primitives
  features/                  Send, receive, history
```

### Wallet support

Wallets are integrated through a connector interface modelled on the `soroban-react` pattern; the
provider only ever talks to that interface, so adding a wallet means adding one module.

| Wallet    | Send | Receive | Notes                                            |
| --------- | :--: | :-----: | ------------------------------------------------ |
| Freighter |  ✓   |    ✓    | Full support                                     |
| xBull     |  ✓   |    —    | No raw message signing for key derivation        |
| Albedo    |  ✓   |    —    | No raw message signing for key derivation        |

Receiving requires deriving stealth keys from a signed message. Wallets that cannot do so are
labelled at connect time rather than failing later in the flow.

### Signing model

The SDK signs stealth-key legs internally, since a wallet cannot hold a derived stealth scalar, and
delegates the sender and fee-payer legs to a `TransactionSigner` callback. Where a secret key would
normally be passed, the application supplies a **public** `G...` address instead: the third argument
to `send()`, and `ClaimOpts.feePayerAddress` on claims.

## SDK compatibility notes

Two behaviours in `stellar-shade@0.1.0` require handling in browser applications:

**1. Global `fetch` binding.** The SDK assigns `globalThis.fetch` to an instance property and invokes
it as `this.fetchFn(url)`. Browsers require `fetch` to be called with `window` as its receiver, so
this raises `Illegal invocation`, surfacing as a generic network error while no request ever leaves
the page. `src/lib/fetchShim.ts` rebinds the global before any client is constructed. Supplying a
per-client `fetchFn` is insufficient, because `StealthClient` constructs its own `HorizonClient` and
`IndexerClient` internally.

**2. Constructor-level relayer acts as a silent fallback.** Setting `relayer` in `ClientConfig`
causes every claim to resolve `opts.relay ?? this.relayer`, leaving no way to disable relaying per
call. Because the configured relayer is credit-gated (`requireCredit: true`) and this application
carries no funding account, claims would fail with no user-visible opt-out. `src/lib/shade.ts`
therefore omits it and passes `relay` explicitly from the UI, which disables the option when the
relayer reports a credit gate.

Additionally, the SDK references `Buffer` unguarded and publishes no `browser` field, so
`vite-plugin-node-polyfills` is required for both development and production builds.

## Walkthrough

Exercising the full flow requires two testnet accounts — two wallet profiles, or two browsers.

1. **Receive** (recipient): connect, choose *Sign to unlock*, then *Publish meta-address*. Verify the
   entry landed:

   ```bash
   curl https://horizon-testnet.stellar.org/accounts/<ACCOUNT_ID> | jq .data
   ```

2. **Send** (sender): connect the second account and enter the recipient's public key in the
   *Public address* tab. It resolves to a meta-address. Send a small amount.
3. **Receive** (recipient): the payment appears under *Detected payments*. Claiming it moves the
   funds to the recipient's ordinary account.
4. **History**: shows local activity alongside the network-wide announcement feed from the indexer.
5. Reload the page: connection and history return immediately; detected payments return after one
   signature.

Any transaction hash can be inspected on
[stellar.expert](https://stellar.expert/explorer/testnet). Nothing published there links a stealth
address back to the recipient's account.

## Tech stack

React 18 · TypeScript · Vite 6 · Tailwind CSS 4 · Zustand · React Router ·
`stellar-shade` · `@stellar/stellar-sdk` · `@stellar/freighter-api` · lucide-react
