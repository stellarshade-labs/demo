import { UniversalProvider } from '@walletconnect/universal-provider';
import { WalletConnectModal } from '@walletconnect/modal';
import type { WalletConnector } from '../types';
import { WalletConnectMark } from '../icons';
import { NETWORK } from '@/config/network';

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

if (!PROJECT_ID) {
  throw new Error(
    'VITE_WALLETCONNECT_PROJECT_ID is not set. Get one from https://dashboard.walletconnect.com',
  );
}

let provider: InstanceType<typeof UniversalProvider> | null = null;
let modal: WalletConnectModal | null = null;

function getChainId(): string {
  const passphrase = NETWORK.passphrase;
  if (passphrase === 'Public Global Stellar Network ; September 2015') {
    return 'stellar:pubnet';
  }
  if (passphrase === 'Test SDF Network ; September 2015') {
    return 'stellar:testnet';
  }
  throw new Error(`Unknown Stellar network passphrase: ${passphrase}`);
}

async function initProvider(): Promise<InstanceType<typeof UniversalProvider>> {
  if (provider) return provider;

  provider = await UniversalProvider.init({
    projectId: PROJECT_ID,
    metadata: {
      name: 'Shade',
      description: 'Stealth, unlinkable payments on Stellar.',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://shade.app',
      icons: ['https://shade.app/shade-icon.svg'],
    },
  });

  // A previous session, if any, is restored by init() and available on
  // provider.session directly — calling connect() again would open a brand-new
  // pairing proposal that nothing ever approves.

  if (!modal) {
    modal = new WalletConnectModal({
      projectId: PROJECT_ID,
      explorerRecommendedWalletIds: [
        '997a355c8f682468706a76cff1b004a7115f505fb962dac54b6e9b442dd1c380', // Freighter
      ],
    });
  }

  return provider;
}

export const walletConnectConnector: WalletConnector & { onUri?: (uri: string) => void } = {
  id: 'walletconnect',
  name: 'WalletConnect',
  installUrl: 'https://walletconnect.com',
  Icon: WalletConnectMark,
  supportsSignMessage: true,

  async isAvailable() {
    return true;
  },

  async isAuthorized() {
    try {
      const p = await initProvider();
      return Boolean(p.session);
    } catch {
      return false;
    }
  },

  async connect() {
    const p = await initProvider();
    const m = modal!;
    const chainId = getChainId();

    // Reuse a live session (e.g. restored after a mobile reload) instead of
    // starting a new pairing — without this, connect() waits on a QR scan the
    // user has no reason to perform again.
    const existing = p.session?.namespaces.stellar?.accounts;
    if (existing && existing.length > 0) {
      return { address: existing[0].split(':')[2], networkPassphrase: NETWORK.passphrase };
    }

    return new Promise<{ address: string; networkPassphrase?: string }>((resolve, reject) => {
      let isResolved = false;

      const cleanup = () => {
        p.removeListener('display_uri', onDisplayUri);
        p.removeListener('session_update', onSessionUpdate);
        p.removeListener('session_delete', onSessionDelete);
      };

      const onDisplayUri = (uri: string) => {
        console.log('Display URI:', uri);
        m.openModal({ uri });
      };

      const onSessionUpdate = () => {
        console.log('Session update event fired, session:', p.session);
        if (!isResolved && p.session) {
          const accounts = p.session.namespaces.stellar?.accounts;
          if (accounts && accounts.length > 0) {
            isResolved = true;
            m.closeModal();
            const address = accounts[0].split(':')[2];
            cleanup();
            resolve({ address, networkPassphrase: NETWORK.passphrase });
          }
        }
      };

      const onSessionDelete = () => {
        console.log('Session delete event fired');
        if (!isResolved) {
          isResolved = true;
          m.closeModal();
          cleanup();
          reject(new Error('User rejected the connection'));
        }
      };

      // Set up listeners BEFORE calling connect
      p.on('display_uri', onDisplayUri);
      p.on('session_update', onSessionUpdate);
      p.on('session_delete', onSessionDelete);
      p.on('session_expire', onSessionDelete);

      p.connect({
        namespaces: {
          stellar: {
            methods: [
              'stellar_signXDR',
              'stellar_signAndSubmitXDR',
              'stellar_signMessage',
              'stellar_signAuthEntry',
            ],
            chains: [chainId],
            events: ['accountsChanged'],
          },
        },
      }).then((session) => {
        console.log('Connect promise resolved with session:', session);
        if (!isResolved && session) {
          const accounts = session.namespaces.stellar?.accounts;
          if (accounts && accounts.length > 0) {
            isResolved = true;
            m.closeModal();
            const address = accounts[0].split(':')[2];
            cleanup();
            resolve({ address, networkPassphrase: NETWORK.passphrase });
          }
        }
      }).catch((err) => {
        console.error('Connect error:', err);
        if (!isResolved) {
          isResolved = true;
          reject(err);
        }
      });
    });
  },

  async getAddress() {
    const p = await initProvider();
    if (!p.session) throw new Error('No active WalletConnect session');
    const accounts = p.session.namespaces.stellar.accounts;
    return accounts[0].split(':')[2];
  },

  async getNetworkPassphrase() {
    return NETWORK.passphrase;
  },

  async signTransaction(xdr) {
    const p = await initProvider();
    if (!p.session) throw new Error('No active WalletConnect session');

    const methods = p.session.namespaces.stellar?.methods || [];
    if (!methods.includes('stellar_signXDR')) {
      throw new Error(
        'This WalletConnect session does not include transaction signing. ' +
        'Disconnect and reconnect your wallet to grant it. ' +
        `Available methods: ${methods.join(', ')}`
      );
    }

    const result = (await p.request(
      {
        method: 'stellar_signXDR',
        params: { xdr },
      },
      getChainId(),
    )) as { signedXDR?: string };

    if (!result.signedXDR) {
      throw new Error('WalletConnect: no signature returned');
    }

    return result.signedXDR;
  },

  async signMessage(message, address) {
    const p = await initProvider();
    if (!p.session) throw new Error('No active WalletConnect session');

    const result = await p.request(
      {
        method: 'stellar_signMessage',
        params: { message, address },
      },
      getChainId(),
    );

    console.log('signMessage raw response:', JSON.stringify(result));

    // Wallets differ in response shape: bare string, or an object with one of
    // several key names for the signature.
    if (typeof result === 'string') return result;
    if (result && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      const sig = r.signedMessage ?? r.signature ?? r.signedXDR ?? r.result;
      if (typeof sig === 'string') return sig;
      if (sig instanceof Uint8Array) return sig;
    }

    throw new Error(`WalletConnect: no signature in response: ${JSON.stringify(result)}`);
  },

  async disconnect() {
    if (!provider) return;
    try {
      await provider.disconnect();
    } catch {
      // ignore
    }
    provider = null;
  },
};
