import type { WalletConnector } from '../types';
import { AlbedoMark } from '../icons';

/**
 * Albedo is a hosted signer loaded on demand — no extension to detect, so it is
 * always "available". The module is imported lazily to keep it out of the main
 * bundle for the majority who use Freighter.
 *
 * Albedo can sign messages, but not in the raw ed25519-over-arbitrary-bytes form
 * `keysFromWalletSignature` needs, so stealth key derivation is not offered here.
 */

type AlbedoApi = {
  publicKey(opts: { token?: string }): Promise<{ pubkey: string }>;
  tx(opts: {
    xdr: string;
    pubkey?: string;
    network?: string;
    submit?: boolean;
  }): Promise<{ signed_envelope_xdr: string }>;
};

const ALBEDO_MODULE_URL = 'https://albedo.link/albedo.intent.js';

let cached: AlbedoApi | undefined;

async function albedo(): Promise<AlbedoApi> {
  if (!cached) {
    // Held in a variable so the bundler treats this as a runtime URL import
    // rather than a module it must resolve at build time.
    const mod = (await import(/* @vite-ignore */ ALBEDO_MODULE_URL)) as {
      default?: AlbedoApi;
    } & AlbedoApi;
    cached = (mod.default ?? mod) as AlbedoApi;
  }
  return cached;
}

function networkNameFor(passphrase: string): string {
  return passphrase.includes('Test SDF Network') ? 'testnet' : 'public';
}

export const albedoConnector: WalletConnector = {
  id: 'albedo',
  name: 'Albedo',
  installUrl: 'https://albedo.link/',
  Icon: AlbedoMark,
  supportsSignMessage: false,

  async isAvailable() {
    return true;
  },

  // Albedo has no persistent grant we can query; treat every load as fresh.
  async isAuthorized() {
    return false;
  },

  async connect() {
    const api = await albedo();
    const { pubkey } = await api.publicKey({});
    return { address: pubkey };
  },

  async getAddress() {
    const api = await albedo();
    const { pubkey } = await api.publicKey({});
    return pubkey;
  },

  async getNetworkPassphrase() {
    return undefined;
  },

  async signTransaction(xdr, opts) {
    const api = await albedo();
    const result = await api.tx({
      xdr,
      pubkey: opts.address,
      network: networkNameFor(opts.networkPassphrase),
      submit: false,
    });
    return result.signed_envelope_xdr;
  },
};
