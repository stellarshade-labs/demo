# Shade Demo

A demo dapp for the [Shade](https://www.npmjs.com/package/stellar-shade) protocol — stealth
addresses and unlinkable transfers on Stellar testnet.

Send XLM to someone without anything on-chain linking the payment to their account. The sender
either types the recipient's ordinary Stellar address or pastes their stealth meta-address; both
paths derive a fresh one-time address that only the recipient can spend from.

> The Shade protocol's cryptography is pending external audit. This is a testnet demo — do not use
> it with real value.

---

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5173 and connect [Freighter](https://www.freighter.app/) set to **Testnet**.
Fund your account from [friendbot](https://friendbot.stellar.org) if it is new.

| Script            | What it does                          |
| ----------------- | ------------------------------------- |
| `npm run dev`     | Dev server with HMR                   |
| `npm run build`   | Typecheck and build to `dist/`        |
| `npm run preview` | Serve the production build            |
| `npm run typecheck` | Types only, no emit                 |

---

## Configuration

Everything network-related comes from the environment; nothing is hardcoded. Copy `.env.example`
to `.env`:

```env
VITE_STELLAR_NETWORK=testnet
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015

# Shade stealth pool contract (Soroban, testnet)
VITE_SHADE_CONTRACT_ID=CDQBZZ5B2GUE7RG6NDWLZYE7TLSQAEZODGRO565GKAHN73C2SGVG76BX

# Shade services
VITE_RELAYER_URL=https://shaderelayer-production.up.railway.app
VITE_INDEXER_URL=https://shadeindexer-production.up.railway.app

# Stellar infrastructure
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
VITE_HORIZON_URL=https://horizon-testnet.stellar.org

# Account data-entry key used to publish a meta-address (see below)
VITE_META_DATA_KEY=shade:meta
```

`src/config/network.ts` reads these once and throws on startup if any are missing.

---

## Meta-address resolution — why this app adds a piece

The brief asked for a default flow where the sender simply enters the recipient's **public Stellar
address**. The SDK has no such call, and it cannot: a meta-address is derived from the recipient's
wallet *signature*, so it is not computable from their `G...` key. If it were, anyone could derive
their spend and view private keys too. The pool contract has no registry either, and the indexer
exposes only `/health` and `/announcements`.

So this demo supplies the missing resolution layer, Stellar-natively, with **no backend**:

**Publishing** (Receive tab) writes a `manageData` entry on the recipient's own account:

```
key   = shade:meta
value = spendPubKey (32 bytes) || viewPubKey (32 bytes)   = exactly 64 bytes
```

64 bytes is precisely Stellar's data-entry value limit, so the payload fits without truncation. The
meta-address's 4-byte checksum is a function of the payload, so it is recomputed on read rather than
stored. Creating the entry raises the account's base reserve by 0.5 XLM, refunded if it is removed.

**Resolving** (Send tab, "Public address") loads the account from Horizon, reads that data entry,
and rebuilds the meta-address string. If the account has not published one, the UI says so and
points the sender at the Meta-address tab.

Both tabs then converge on the same `stealthClient.send(metaAddress, …)` call — the public tab has
simply looked up what the meta-address tab was given directly.

Publishing is public, on-chain, and opt-in. It says only "this account accepts stealth payments at
this meta-address"; it reveals nothing about which stealth addresses that account later receives at.

Implementation: `src/lib/metaRegistry.ts`. Verified byte-exact against the SDK's own encoder.

---

## What is stored where

Session state survives a page refresh and a browser restart, in three tiers by sensitivity:

| Data                                          | Storage                       | After a refresh                     |
| --------------------------------------------- | ----------------------------- | ----------------------------------- |
| Connected address, wallet id, UI preferences   | `localStorage`, plain         | Restored instantly, auto-reconnect  |
| Sent/claim/publish transaction history         | `localStorage`, plain         | Restored instantly                  |
| Detected incoming payments + scan cursor       | `localStorage`, **AES-256-GCM** | One signature to unlock, then instant |
| Stealth spend & view private keys              | **Nowhere** — memory only     | Re-derived from a wallet signature  |

Private keys are never persisted in any form. Detected payments *are* cached, because each one links
a one-time stealth address to your identity — exactly the correlation the protocol exists to hide —
so the cache is sealed with a key derived via HKDF from your view key under a dedicated info tag.
Losing or failing to decrypt it is harmless: the chain is always the source of truth and the app
just rescans. Disconnecting wipes it.

See `src/stealth/scanCache.ts` and `src/store/session.ts`.

---

## Architecture

```
src/
  config/network.ts        Env-driven network config, explorer links
  lib/
    fetchShim.ts           Binds global fetch (see "Notes on the SDK")
    shade.ts               StealthClient / RelayerClient / IndexerClient singletons
    metaRegistry.ts        manageData publish + resolve
    errors.ts              ShadeError.code -> human message
    format.ts              Address truncation, amounts, relative time
    useServiceHealth.ts    Relayer + indexer liveness polling
  wallet/
    types.ts               WalletConnector interface
    connectors/            freighter, xbull, albedo
    WalletProvider.tsx     Connect, silent auto-reconnect, signer adapters
  stealth/
    StealthKeysProvider.tsx  keysFromWalletSignature, memory only
    useScan.ts               Incremental scan with cursor
    scanCache.ts             Encrypted payment cache
  store/session.ts         Zustand + persist
  components/              layout, wallet, ui primitives
  features/                send, receive, history
```

**Wallets.** A connector interface after the `soroban-react` pattern; the provider only ever talks
to that interface. Freighter is fully supported. xBull and Albedo can *send* but cannot derive
stealth keys — neither exposes raw message signing in the form `keysFromWalletSignature` needs — and
the UI says so at connect time rather than failing later.

**Signing.** The SDK signs stealth-key legs internally (a wallet cannot hold a derived stealth
scalar) and delegates the sender and fee-payer legs to a `TransactionSigner` callback. Where a
secret key would normally go, the app passes a **public** `G...` address instead: `send()`'s third
argument, and `ClaimOpts.feePayerAddress` on claims.

---

## Notes on the SDK

Two things this app works around, worth knowing if you build on `stellar-shade@0.1.0`:

1. **`fetch` binding.** The SDK stores `globalThis.fetch` on an instance and calls it as
   `this.fetchFn(url)`. Browsers require `fetch` to be invoked with `window` as receiver, so this
   throws `Illegal invocation` and surfaces as a generic network error — every relayer and indexer
   call fails without a request ever leaving the page. `src/lib/fetchShim.ts` rebinds the global
   before any client is constructed. A per-client `fetchFn` is not enough: `StealthClient` builds
   its own `HorizonClient` and `IndexerClient` internally.

2. **Constructor-level relayer is a silent fallback.** Setting `relayer` in `ClientConfig` makes
   every claim resolve `opts.relay ?? this.relayer`, so relaying cannot be turned off per call. The
   configured relayer is credit-gated (`requireCredit: true`) and this demo carries no funding
   account, so claims would fail with no user-visible opt-out. `src/lib/shade.ts` therefore omits it
   and passes `relay` explicitly from the UI, which disables the toggle when the relayer reports a
   credit gate.

Also note `Buffer` is referenced unguarded throughout the SDK and the package ships no `browser`
field, so `vite-plugin-node-polyfills` is required in both dev and production builds.

---

## Trying it end to end

You will want two testnet accounts (two Freighter profiles, or two browsers).

1. **Receive**, as the recipient: connect, *Sign to unlock*, then *Publish meta-address*. Confirm the
   entry landed:
   `curl https://horizon-testnet.stellar.org/accounts/<G...> | jq .data`
2. **Send**, as the sender: connect the other account, paste the recipient's `G...` into the Public
   address tab. It should resolve to a meta-address. Send a small amount.
3. **Receive** again, as the recipient: the payment appears under *Detected payments*. Claim it — the
   funds land in the recipient's ordinary account.
4. **History** shows both sides locally, plus the network-wide announcement feed from the indexer.
5. Refresh the page: connection and history return immediately; incoming payments return after one
   signature.

Inspect any hash on [stellar.expert](https://stellar.expert/explorer/testnet). Nothing there links
the stealth address back to the recipient's account.

---

## Stack

React 18 · TypeScript · Vite 6 · Tailwind CSS 4 · Zustand · React Router ·
`stellar-shade` · `@stellar/stellar-sdk` · `@stellar/freighter-api` · lucide-react
