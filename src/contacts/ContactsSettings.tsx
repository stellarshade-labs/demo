import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { looksLikeMetaAddress, looksLikeStellarAddress, truncate, truncateMeta } from '@/lib/format';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Status';
import { useContacts, contactKindFor, type Contact } from './contactsStore';

/**
 * Self-contained address-book management panel, mounted into the Settings page.
 * Lists, adds, edits and deletes contacts. Holds only public addresses + labels.
 */
export function ContactsSettings() {
  const contacts = useContacts((s) => s.contacts);
  const addContact = useContacts((s) => s.addContact);
  const removeContact = useContacts((s) => s.removeContact);
  const updateContact = useContacts((s) => s.updateContact);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Panel
      eyebrow="Address book"
      title="Contacts"
      action={
        !adding && (
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus className="size-3.5" />}
            onClick={() => {
              setEditingId(null);
              setAdding(true);
            }}
          >
            Add contact
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {adding && (
          <ContactForm
            onCancel={() => setAdding(false)}
            onSave={(label, address) => {
              addContact({ label, address, kind: contactKindFor(address) });
              setAdding(false);
            }}
          />
        )}

        {contacts.length === 0 && !adding ? (
          <EmptyState
            icon={<Users className="size-6" />}
            title="No contacts yet"
            description="Save recipients you pay often, then pick them from the Send form."
          />
        ) : (
          <ul className="divide-y divide-ink-700 border border-ink-700 bg-ink-900">
            {contacts.map((contact) =>
              editingId === contact.id ? (
                <li key={contact.id} className="p-4">
                  <ContactForm
                    initial={contact}
                    onCancel={() => setEditingId(null)}
                    onSave={(label, address) => {
                      updateContact(contact.id, {
                        label,
                        address,
                        kind: contactKindFor(address),
                      });
                      setEditingId(null);
                    }}
                  />
                </li>
              ) : (
                <li
                  key={contact.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-ink-100">
                      {contact.label || 'Unnamed'}
                    </div>
                    <div className="truncate font-mono text-[11px] text-ink-500">
                      {contact.kind === 'meta'
                        ? truncateMeta(contact.address)
                        : truncate(contact.address)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label="Edit contact"
                      onClick={() => {
                        setAdding(false);
                        setEditingId(contact.id);
                      }}
                      className="p-1.5 text-ink-500 transition-colors hover:text-copper-400"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete contact"
                      onClick={() => removeContact(contact.id)}
                      className="p-1.5 text-ink-500 transition-colors hover:text-signal-bad"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function ContactForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Contact;
  onSave: (label: string, address: string) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');

  const trimmed = address.trim();
  const addressValid =
    looksLikeStellarAddress(trimmed) || looksLikeMetaAddress(trimmed);
  const canSave = trimmed !== '' && addressValid;

  return (
    <div className="space-y-3 border border-ink-700 bg-ink-900 p-4">
      <Field
        label="Label"
        placeholder="e.g. Alice"
        autoComplete="off"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <Field
        label="Address"
        placeholder="GABC…  ·  or  shade:stellar:…"
        mono
        autoComplete="off"
        spellCheck={false}
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        error={
          trimmed !== '' && !addressValid
            ? 'Expected a Stellar G-address or a shade:stellar: meta-address.'
            : null
        }
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          icon={<Check className="size-3.5" />}
          disabled={!canSave}
          onClick={() => onSave(label, address)}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<X className="size-3.5" />}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
