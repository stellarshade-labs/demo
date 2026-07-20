import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EncryptedBlob, IdentitySource } from './identityCrypto';

/**
 * Persisted identity record + user settings.
 *
 * IMPORTANT: nothing here is secret in the clear. `encrypted` is ciphertext;
 * `metaAddress` and `payoutAddress` are public by design (a meta-address reveals
 * nothing about received payments). Decrypted keys live in IdentityProvider's
 * React state only.
 */

export type ReceiveMethod = 'account' | 'pool';

export interface IdentityRecord {
  source: IdentitySource;
  /** Public meta-address to share/publish. */
  metaAddress: string;
  /** Public G-address funds are claimed into (wallet address, or derived payout). */
  payoutAddress: string;
  createdAt: number;
  /** Whether the user chose to make their address publicly resolvable. */
  publishPref: boolean;
  encrypted: EncryptedBlob;
}

export interface Settings {
  /** Receiver's chosen delivery method — senders honour this automatically. */
  receiveMethod: ReceiveMethod;
  /** Default the claim relayer toggle to on. */
  useRelayerByDefault: boolean;
  /** Scan for incoming payments as soon as the app opens. */
  autoScanOnOpen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  receiveMethod: 'pool',
  useRelayerByDefault: true,
  autoScanOnOpen: true,
};

interface IdentityStoreState {
  record: IdentityRecord | null;
  settings: Settings;

  setRecord: (record: IdentityRecord) => void;
  updateRecord: (patch: Partial<IdentityRecord>) => void;
  clearIdentity: () => void;
  setSettings: (patch: Partial<Settings>) => void;
}

export const useIdentityStore = create<IdentityStoreState>()(
  persist(
    (set) => ({
      record: null,
      settings: DEFAULT_SETTINGS,

      setRecord: (record) => set({ record }),
      updateRecord: (patch) =>
        set((state) => (state.record ? { record: { ...state.record, ...patch } } : {})),
      clearIdentity: () => set({ record: null }),
      setSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
    }),
    {
      name: 'shade.identity',
      version: 1,
      // Merge persisted settings over defaults so new setting keys always exist.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<IdentityStoreState>;
        return {
          ...current,
          ...p,
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
        };
      },
    },
  ),
);
