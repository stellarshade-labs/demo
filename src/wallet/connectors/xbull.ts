import type { WalletConnector } from '../types';
import { WalletNotInstalledError } from '../types';
import { XBullMark } from '../icons';

/**
 * xBull injects `window.xBullSDK` when its extension is installed.
 * Like Albedo it has no raw-message signing path compatible with
 * `keysFromWalletSignature`, so it can send but not derive stealth keys.
 */

function sdk() {
  const injected = window.xBullSDK;
  if (!injected) throw new WalletNotInstalledError('xBull');
  return injected;
}

export const xbullConnector: WalletConnector = {
  id: 'xbull',
  name: 'xBull',
  installUrl: 'https://xbull.app/',
  Icon: XBullMark,
  supportsSignMessage: false,

  async isAvailable() {
    return Boolean(window.xBullSDK);
  },

  async isAuthorized() {
    return false;
  },

  async connect() {
    const api = sdk();
    await api.connect({ canRequestPublicKey: true, canRequestSign: true });
    const address = await api.getPublicKey();
    return { address };
  },

  async getAddress() {
    return sdk().getPublicKey();
  },

  async getNetworkPassphrase() {
    return undefined;
  },

  async signTransaction(xdr, opts) {
    return sdk().signXDR(xdr, {
      networkPassphrase: opts.networkPassphrase,
      publicKey: opts.address,
    });
  },
};
