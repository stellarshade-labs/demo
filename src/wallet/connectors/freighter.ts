import {
  isConnected,
  isAllowed,
  requestAccess,
  getAddress,
  getNetwork,
  signTransaction,
  signMessage,
} from '@stellar/freighter-api';
import type { WalletConnector } from '../types';
import { WalletNotInstalledError } from '../types';
import { FreighterMark } from '../icons';

/** Freighter returns `{ error }` in-band rather than rejecting. */
function unwrap<T extends { error?: unknown }>(result: T, action: string): T {
  if (result?.error) {
    const message =
      typeof result.error === 'string'
        ? result.error
        : ((result.error as { message?: string })?.message ?? `Freighter ${action} failed.`);
    throw new Error(message);
  }
  return result;
}

export const freighterConnector: WalletConnector = {
  id: 'freighter',
  name: 'Freighter',
  installUrl: 'https://www.freighter.app/',
  Icon: FreighterMark,
  supportsSignMessage: true,

  async isAvailable() {
    try {
      // When the extension hasn't injected `window.freighter` yet, isConnected()
      // falls back to a postMessage round-trip that can sit unanswered. Cap it
      // so a slow probe never stalls the wallet list — the caller re-probes.
      const result = await Promise.race([
        isConnected(),
        new Promise<{ isConnected: boolean }>((resolve) =>
          setTimeout(() => resolve({ isConnected: false }), 1500),
        ),
      ]);
      return Boolean(result?.isConnected);
    } catch {
      return false;
    }
  },

  async isAuthorized() {
    try {
      const result = await isAllowed();
      return Boolean(result?.isAllowed && !result.error);
    } catch {
      return false;
    }
  },

  async connect() {
    if (!(await this.isAvailable())) throw new WalletNotInstalledError('Freighter');
    const { address } = unwrap(await requestAccess(), 'access request');
    let networkPassphrase: string | undefined;
    try {
      networkPassphrase = (await getNetwork()).networkPassphrase;
    } catch {
      networkPassphrase = undefined;
    }
    return { address, networkPassphrase };
  },

  async getAddress() {
    const { address } = unwrap(await getAddress(), 'getAddress');
    if (!address) throw new Error('Freighter returned no address.');
    return address;
  },

  async getNetworkPassphrase() {
    try {
      const result = await getNetwork();
      return result.error ? undefined : result.networkPassphrase;
    } catch {
      return undefined;
    }
  },

  async signTransaction(xdr, opts) {
    const result = unwrap(
      await signTransaction(xdr, {
        networkPassphrase: opts.networkPassphrase,
        address: opts.address,
      }),
      'signTransaction',
    );
    return result.signedTxXdr;
  },

  async signMessage(message, address) {
    const result = unwrap(await signMessage(message, { address }), 'signMessage');
    const signed = result.signedMessage;
    if (signed === null || signed === undefined) {
      throw new Error('Freighter returned an empty signature.');
    }
    // v3 hands back a Buffer, v4 a base64 string. Both are accepted downstream.
    return typeof signed === 'string' ? signed : new Uint8Array(signed);
  },
};
