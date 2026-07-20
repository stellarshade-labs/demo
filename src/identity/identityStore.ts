import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { newIdentityId, type EncryptedBlob, type IdentitySource } from './identityCrypto';

/**
 * Persisted identity vault + user settings.
 *
 * IMPORTANT: nothing here is secret in the clear. `encrypted` is the ciphertext
 * of the whole vault; the `PublicIdentity` fields (`metaAddress`, `payoutAddress`,
 * …) are public by design (a meta-address reveals nothing about received
 * payments). Decrypted keys live in IdentityProvider's React state only.
 */

export type ReceiveMethod = 'account' | 'pool';

/** Non-secret view of one identity, safe to persist and render. */
export interface PublicIdentity {
  id: string;
  source: IdentitySource;
  /** Public meta-address to share/publish. */
  metaAddress: string;
  /** Public G-address funds are claimed into (wallet address, or derived payout). */
  payoutAddress: string;
  /** Whether the user chose to make this address publicly resolvable. */
  publishPref: boolean;
  createdAt: number;
  /** Optional user-facing name for the switcher. */
  label?: string;
}

/** The persisted vault: one ciphertext blob covering every identity, plus their public fields. */
export interface VaultRecord {
  encrypted: EncryptedBlob;
  identities: PublicIdentity[];
  activeId: string;
}

/** The pre-v2 single-identity record, kept only to migrate old persisted state. */
interface LegacyIdentityRecord {
  source: IdentitySource;
  metaAddress: string;
  payoutAddress: string;
  createdAt: number;
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
  vault: VaultRecord | null;
  settings: Settings;

  setVault: (vault: VaultRecord) => void;
  updateIdentity: (id: string, patch: Partial<PublicIdentity>) => void;
  setActiveId: (id: string) => void;
  removeIdentity: (id: string) => void;
  clearVault: () => void;
  setSettings: (patch: Partial<Settings>) => void;
}

export const useIdentityStore = create<IdentityStoreState>()(
  persist(
    (set) => ({
      vault: null,
      settings: DEFAULT_SETTINGS,

      setVault: (vault) => set({ vault }),
      updateIdentity: (id, patch) =>
        set((state) =>
          state.vault
            ? {
                vault: {
                  ...state.vault,
                  identities: state.vault.identities.map((i) =>
                    i.id === id ? { ...i, ...patch } : i,
                  ),
                },
              }
            : {},
        ),
      setActiveId: (id) =>
        set((state) =>
          state.vault && state.vault.identities.some((i) => i.id === id)
            ? { vault: { ...state.vault, activeId: id } }
            : {},
        ),
      removeIdentity: (id) =>
        set((state) => {
          if (!state.vault) return {};
          const identities = state.vault.identities.filter((i) => i.id !== id);
          if (identities.length === 0) return { vault: null };
          const activeId =
            state.vault.activeId === id ? identities[0].id : state.vault.activeId;
          return { vault: { ...state.vault, identities, activeId } };
        }),
      clearVault: () => set({ vault: null }),
      setSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
    }),
    {
      name: 'shade.identity',
      version: 2,
      // v1 stored a single `record`; wrap it into a one-identity vault so existing
      // users keep their (still-encrypted) identity across the upgrade.
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<IdentityStoreState> & {
          record?: LegacyIdentityRecord | null;
        };
        if (version < 2 && state.record) {
          const r = state.record;
          const id = newIdentityId();
          state.vault = {
            encrypted: r.encrypted,
            identities: [
              {
                id,
                source: r.source,
                metaAddress: r.metaAddress,
                payoutAddress: r.payoutAddress,
                publishPref: r.publishPref,
                createdAt: r.createdAt,
              },
            ],
            activeId: id,
          };
          delete state.record;
        }
        return state as IdentityStoreState;
      },
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
