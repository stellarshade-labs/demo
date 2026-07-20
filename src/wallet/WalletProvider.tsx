import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { TransactionSigner } from 'stellar-shade';
import { NETWORK } from '@/config/network';
import { useSession } from '@/store/session';
import { connectorById, connectors } from './connectors';
import type { WalletConnector } from './types';

export type ConnectionStatus = 'disconnected' | 'reconnecting' | 'connecting' | 'connected';

interface WalletContextValue {
  status: ConnectionStatus;
  address: string | null;
  connector: WalletConnector | null;
  connectors: WalletConnector[];
  /** Set when the wallet is pointed at a different network than the app. */
  networkMismatch: string | null;
  error: string | null;

  connect: (connectorId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  /** Signer in the shape the Shade SDK expects. */
  signTransaction: TransactionSigner;
  signMessage: (message: string) => Promise<string | Uint8Array>;
  canDeriveKeys: boolean;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const persistedWalletId = useSession((s) => s.walletId);
  const persistedAddress = useSession((s) => s.address);
  const setConnection = useSession((s) => s.setConnection);
  const clearConnection = useSession((s) => s.clearConnection);

  const [status, setStatus] = useState<ConnectionStatus>(
    persistedWalletId ? 'reconnecting' : 'disconnected',
  );
  const [connector, setConnector] = useState<WalletConnector | null>(
    () => connectorById(persistedWalletId) ?? null,
  );
  const [address, setAddress] = useState<string | null>(persistedAddress);
  const [networkMismatch, setNetworkMismatch] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const attemptedReconnect = useRef(false);

  const checkNetwork = useCallback(async (target: WalletConnector) => {
    const passphrase = await target.getNetworkPassphrase();
    if (passphrase && passphrase !== NETWORK.passphrase) {
      setNetworkMismatch(passphrase);
    } else {
      setNetworkMismatch(null);
    }
    return passphrase;
  }, []);

  /**
   * Silent reconnect on load. We only reconnect for wallets that report an
   * existing authorization, so returning users are never greeted by a popup.
   */
  useEffect(() => {
    if (attemptedReconnect.current) return;
    attemptedReconnect.current = true;

    const saved = connectorById(persistedWalletId);
    if (!saved) {
      setStatus('disconnected');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        if (!(await saved.isAvailable()) || !(await saved.isAuthorized())) {
          if (!cancelled) {
            setStatus('disconnected');
            clearConnection();
          }
          return;
        }
        const current = await saved.getAddress();
        if (cancelled) return;

        const passphrase = await checkNetwork(saved);
        setConnector(saved);
        setAddress(current);
        setStatus('connected');
        setConnection({
          walletId: saved.id,
          address: current,
          walletPassphrase: passphrase,
        });
      } catch {
        if (!cancelled) {
          setStatus('disconnected');
          clearConnection();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [persistedWalletId, clearConnection, setConnection, checkNetwork]);

  const connect = useCallback(
    async (connectorId: string) => {
      const target = connectorById(connectorId);
      if (!target) throw new Error(`Unknown wallet "${connectorId}".`);

      setError(null);
      setStatus('connecting');
      try {
        const result = await target.connect();
        const passphrase = result.networkPassphrase ?? (await target.getNetworkPassphrase());

        if (passphrase && passphrase !== NETWORK.passphrase) {
          setNetworkMismatch(passphrase);
        } else {
          setNetworkMismatch(null);
        }

        setConnector(target);
        setAddress(result.address);
        setStatus('connected');
        setConnection({
          walletId: target.id,
          address: result.address,
          walletPassphrase: passphrase,
        });
      } catch (err) {
        setStatus('disconnected');
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [setConnection],
  );

  const disconnect = useCallback(async () => {
    try {
      await connector?.disconnect?.();
    } catch {
      // A wallet refusing to tear down cleanly must not trap the UI.
    }
    setConnector(null);
    setAddress(null);
    setNetworkMismatch(null);
    setError(null);
    setStatus('disconnected');
    clearConnection();
  }, [connector, clearConnection]);

  const signTransaction = useCallback<TransactionSigner>(
    async (xdr, opts) => {
      if (!connector || !address) throw new Error('No wallet connected.');
      return connector.signTransaction(xdr, {
        networkPassphrase: opts.networkPassphrase ?? NETWORK.passphrase,
        address: opts.address ?? address,
      });
    },
    [connector, address],
  );

  const signMessage = useCallback(
    async (message: string) => {
      if (!connector || !address) throw new Error('No wallet connected.');
      if (!connector.signMessage) {
        throw new Error(`${connector.name} cannot sign messages, so stealth keys cannot be derived.`);
      }
      return connector.signMessage(message, address);
    },
    [connector, address],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      address,
      connector,
      connectors,
      networkMismatch,
      error,
      connect,
      disconnect,
      signTransaction,
      signMessage,
      canDeriveKeys: Boolean(connector?.supportsSignMessage),
    }),
    [
      status,
      address,
      connector,
      networkMismatch,
      error,
      connect,
      disconnect,
      signTransaction,
      signMessage,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>.');
  return ctx;
}
