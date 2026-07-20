/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

interface ImportMetaEnv {
  readonly VITE_STELLAR_NETWORK: string;
  readonly VITE_NETWORK_PASSPHRASE: string;
  readonly VITE_SHADE_CONTRACT_ID: string;
  readonly VITE_RELAYER_URL: string;
  readonly VITE_INDEXER_URL: string;
  readonly VITE_SOROBAN_RPC_URL: string;
  readonly VITE_HORIZON_URL: string;
  readonly VITE_META_DATA_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by xBull's browser extension. */
interface Window {
  xBullSDK?: {
    connect(perms: {
      canRequestPublicKey?: boolean;
      canRequestSign?: boolean;
    }): Promise<{ publicKey?: string } | boolean>;
    getPublicKey(): Promise<string>;
    signXDR(
      xdr: string,
      opts?: { network?: string; publicKey?: string; networkPassphrase?: string },
    ): Promise<string>;
  };
}
