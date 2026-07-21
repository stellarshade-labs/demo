import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Persisted session state.
 *
 * IMPORTANT: nothing secret lives here. Only the public address, which wallet
 * was used, and a log of transactions this browser initiated. Stealth private
 * keys are held in React state only, and scanned payments go through the
 * encrypted cache in `stealth/scanCache.ts`.
 */

export type TxKind = 'send' | 'claim' | 'publish' | 'unpublish';
export type TxStatus = 'pending' | 'success' | 'error';

export interface TxRecord {
  id: string;
  kind: TxKind;
  status: TxStatus;
  createdAt: number;
  txHash?: string;
  /** Human summary shown in the history table. */
  amount?: number;
  asset?: string;
  /** Recipient as the user entered it (G-address or meta-address). */
  counterparty?: string;
  /** One-time stealth address produced by a send. */
  stealthAddress?: string;
  error?: string;
}

interface SessionState {
  walletId: string | null;
  address: string | null;
  /** Passphrase the wallet reported at connect time, for mismatch warnings. */
  walletPassphrase: string | null;
  /** Which send tab was last used, so the UI reopens where you left it. */
  sendMode: 'public' | 'meta';
  transactions: TxRecord[];

  setConnection: (input: {
    walletId: string;
    address: string;
    walletPassphrase?: string;
  }) => void;
  clearConnection: () => void;
  setSendMode: (mode: 'public' | 'meta') => void;

  addTx: (tx: Omit<TxRecord, 'id' | 'createdAt'> & { id?: string }) => string;
  updateTx: (id: string, patch: Partial<Omit<TxRecord, 'id'>>) => void;
  clearTransactions: () => void;
}

let txCounter = 0;
function nextId(): string {
  txCounter += 1;
  return `tx_${Date.now().toString(36)}_${txCounter}`;
}

const MAX_HISTORY = 100;

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      walletId: null,
      address: null,
      walletPassphrase: null,
      sendMode: 'public',
      transactions: [],

      setConnection: ({ walletId, address, walletPassphrase }) =>
        set({ walletId, address, walletPassphrase: walletPassphrase ?? null }),

      clearConnection: () => set({ walletId: null, address: null, walletPassphrase: null }),

      setSendMode: (sendMode) => set({ sendMode }),

      addTx: (tx) => {
        const id = tx.id ?? nextId();
        set((state) => ({
          transactions: [{ ...tx, id, createdAt: Date.now() }, ...state.transactions].slice(
            0,
            MAX_HISTORY,
          ),
        }));
        return id;
      },

      updateTx: (id, patch) =>
        set((state) => ({
          transactions: state.transactions.map((tx) => (tx.id === id ? { ...tx, ...patch } : tx)),
        })),

      clearTransactions: () => set({ transactions: [] }),
    }),
    {
      name: 'shade.session',
      version: 1,
      partialize: (state) => ({
        walletId: state.walletId,
        address: state.address,
        walletPassphrase: state.walletPassphrase,
        sendMode: state.sendMode,
        transactions: state.transactions,
      }),
      // A transaction left "pending" when the tab closed can never resolve — we
      // have no way to resume polling it — so surface it as unknown rather than
      // a spinner that never stops.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const stale = state.transactions.filter((tx) => tx.status === 'pending');
        if (stale.length === 0) return;
        state.transactions = state.transactions.map((tx) =>
          tx.status === 'pending'
            ? { ...tx, status: 'error' as const, error: 'Interrupted, outcome unknown.' }
            : tx,
        );
      },
    },
  ),
);
