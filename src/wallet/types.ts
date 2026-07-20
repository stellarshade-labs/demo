/**
 * A minimal wallet-connector contract, modelled after the soroban-react
 * connector pattern: each wallet is a self-describing object, and the provider
 * only ever talks to this interface.
 */
export interface WalletConnector {
  /** Stable id persisted to localStorage for auto-reconnect. */
  id: string;
  name: string;
  /** Where to get it, shown when the wallet is not installed. */
  installUrl: string;
  /** Inline SVG mark, so we ship no remote assets and no emoji. */
  Icon: (props: { className?: string }) => JSX.Element;

  /** Is the extension/provider present in this browser right now? */
  isAvailable(): Promise<boolean>;

  /**
   * Whether this app is already authorised, i.e. we can reconnect silently on
   * page load without popping a permission prompt.
   */
  isAuthorized(): Promise<boolean>;

  /** Prompt the user and return the selected account. */
  connect(): Promise<{ address: string; networkPassphrase?: string }>;

  /** Read the current address without prompting. Throws if not authorised. */
  getAddress(): Promise<string>;

  /** The network the wallet is currently pointed at, if it will tell us. */
  getNetworkPassphrase(): Promise<string | undefined>;

  /** Sign a transaction envelope; returns the signed XDR. */
  signTransaction(
    xdr: string,
    opts: { networkPassphrase: string; address?: string },
  ): Promise<string>;

  /**
   * Sign an arbitrary message. Required for stealth key derivation.
   * Wallets that cannot do this expose `supportsSignMessage: false` and the UI
   * explains that receiving is unavailable on them.
   */
  supportsSignMessage: boolean;
  signMessage?(message: string, address: string): Promise<string | Uint8Array>;

  /** Optional teardown (revoking permissions, closing sockets). */
  disconnect?(): Promise<void>;
}

export class WalletNotInstalledError extends Error {
  constructor(public readonly walletName: string) {
    super(`${walletName} is not installed.`);
    this.name = 'WalletNotInstalledError';
  }
}
