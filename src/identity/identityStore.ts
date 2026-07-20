import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { newIdentityId, type EncryptedBlob, type IdentitySource } from './identityCrypto';
import type { PasskeyRecord } from '@/lib/webauthn';

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

/**
 * Auto-lock window in minutes. `0` = never auto-lock; `-1` = instant, i.e. hold
 * the identity in memory only and never persist a resumable session, so closing
 * or reloading the tab always re-locks.
 */
export type AutoLockMinutes = -1 | 0 | 15 | 60 | 360 | 1440;

export interface Settings {
  /** Receiver's chosen delivery method — senders honour this automatically. */
  receiveMethod: ReceiveMethod;
  /** Default the claim relayer toggle to on. */
  useRelayerByDefault: boolean;
  /** Scan for incoming payments as soon as the app opens. */
  autoScanOnOpen: boolean;
  /** How long the unlock session lasts before the passphrase is asked again. */
  autoLockMinutes: AutoLockMinutes;
}

export const DEFAULT_SETTINGS: Settings = {
  receiveMethod: 'pool',
  useRelayerByDefault: true,
  autoScanOnOpen: true,
  autoLockMinutes: 360,
};

interface IdentityStoreState {
  vault: VaultRecord | null;
  settings: Settings;
  /** Enrolled passkey that can unlock the vault via WebAuthn PRF (non-secret). */
  passkey: PasskeyRecord | null;

  setVault: (vault: VaultRecord) => void;
  updateIdentity: (id: string, patch: Partial<PublicIdentity>) => void;
  setActiveId: (id: string) => void;
  removeIdentity: (id: string) => void;
  clearVault: () => void;
  setSettings: (patch: Partial<Settings>) => void;
  setPasskey: (passkey: PasskeyRecord | null) => void;
}

export const useIdentityStore = create<IdentityStoreState>()(
  persist(
    (set) => ({
      vault: null,
      settings: DEFAULT_SETTINGS,
      passkey: null,

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
          // Last identity gone → drop the vault AND its passkey (the wrapped key
          // is bound to this vault's wrap key and is now useless).
          if (identities.length === 0) return { vault: null, passkey: null };
          const activeId =
            state.vault.activeId === id ? identities[0].id : state.vault.activeId;
          return { vault: { ...state.vault, identities, activeId } };
        }),
      // A cleared/reset vault invalidates any enrolled passkey.
      clearVault: () => set({ vault: null, passkey: null }),
      setSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
      setPasskey: (passkey) => set({ passkey }),
    }),
    {
      name: 'shade.identity',
      version: 3,
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
          passkey: p.passkey ?? null,
        };
      },
    },
  ),
);
