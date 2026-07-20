import { useState } from 'react';
import { BookUser, ChevronDown, Users } from 'lucide-react';
import { truncate, truncateMeta } from '@/lib/format';
import { Portal } from '@/components/ui/Portal';
import { useContacts, type Contact } from './contactsStore';

/**
 * A compact address-book control for the Send form. Opens a portaled dropdown of
 * saved contacts; picking one hands the address (and its kind) back to the form.
 *
 * Portaled for the same reason as ConnectButton's menu: a `fixed` scrim rendered
 * inside a `backdrop-filter` ancestor would clamp to that ancestor's box.
 */
export function ContactPicker({
  onPick,
}: {
  onPick: (contact: Contact) => void;
}) {
  const contacts = useContacts((s) => s.contacts);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1.5 border border-ink-700 bg-ink-850 px-2.5 text-[13px] text-ink-300 transition-colors hover:border-ink-600 hover:text-ink-100"
      >
        <BookUser className="size-3.5 text-copper-400" />
        Contacts
        <ChevronDown className="size-3.5 text-ink-500" />
      </button>

      {open && (
        <>
          <Portal>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          </Portal>
          <div className="absolute right-0 z-20 mt-1.5 w-72 max-w-[calc(100vw-1.5rem)] border border-ink-700 bg-ink-850 shadow-xl shadow-black/40">
            {contacts.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-4 py-6 text-center">
                <Users className="size-4 text-ink-600" />
                <p className="text-[13px] font-medium text-ink-200">No contacts yet</p>
                <p className="text-xs leading-relaxed text-ink-500">
                  Save a recipient to pick them here next time.
                </p>
              </div>
            ) : (
              <ul className="max-h-72 overflow-y-auto py-1">
                {contacts.map((contact) => (
                  <li key={contact.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(contact);
                        setOpen(false);
                      }}
                      className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-ink-800"
                    >
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center border border-ink-700 text-ink-400">
                        {contact.kind === 'meta' ? (
                          <span className="font-mono text-[10px]">@</span>
                        ) : (
                          <span className="font-mono text-[10px]">G</span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-ink-100">
                          {contact.label || 'Unnamed'}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-ink-500">
                          {contact.kind === 'meta'
                            ? truncateMeta(contact.address)
                            : truncate(contact.address)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
