import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Persisted address book.
 *
 * IMPORTANT: like `store/session`, nothing secret lives here. Contacts hold only
 * a public recipient (a G-address or a shade meta-address) plus a human label —
 * the same data anyone could paste into the Send form. No keys, ever.
 */

export type ContactKind = 'public' | 'meta';

export interface Contact {
  id: string;
  label: string;
  /** A G-address (`public`) or a shade meta-address (`meta`). */
  address: string;
  kind: ContactKind;
  createdAt: number;
}

interface ContactsState {
  contacts: Contact[];

  /** Add a contact. Deduped by address — a repeat address updates the label. */
  addContact: (input: { label: string; address: string; kind: ContactKind }) => void;
  removeContact: (id: string) => void;
  updateContact: (id: string, patch: Partial<Pick<Contact, 'label' | 'address' | 'kind'>>) => void;
}

export const useContacts = create<ContactsState>()(
  persist(
    (set) => ({
      contacts: [],

      addContact: ({ label, address, kind }) =>
        set((state) => {
          const trimmedAddress = address.trim();
          const trimmedLabel = label.trim();
          const existing = state.contacts.find((c) => c.address === trimmedAddress);
          if (existing) {
            // Dedupe by address: refresh the label/kind rather than adding a twin.
            return {
              contacts: state.contacts.map((c) =>
                c.id === existing.id
                  ? { ...c, label: trimmedLabel || c.label, kind }
                  : c,
              ),
            };
          }
          const contact: Contact = {
            id: crypto.randomUUID(),
            label: trimmedLabel,
            address: trimmedAddress,
            kind,
            createdAt: Date.now(),
          };
          return { contacts: [contact, ...state.contacts] };
        }),

      removeContact: (id) =>
        set((state) => ({ contacts: state.contacts.filter((c) => c.id !== id) })),

      updateContact: (id, patch) =>
        set((state) => ({
          contacts: state.contacts.map((c) =>
            c.id === id
              ? {
                  ...c,
                  ...patch,
                  ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
                  ...(patch.address !== undefined ? { address: patch.address.trim() } : {}),
                }
              : c,
          ),
        })),
    }),
    {
      name: 'shade.contacts',
      version: 1,
      partialize: (state) => ({ contacts: state.contacts }),
    },
  ),
);

/** Classify a recipient string for storage. Mirrors `paylink.modeForRecipient`. */
export function contactKindFor(address: string): ContactKind {
  return address.trim().startsWith('shade:stellar:') ? 'meta' : 'public';
}
