import { useEffect, useState } from 'react';
import { looksLikeMetaAddress, looksLikeStellarAddress } from '@/lib/format';
import { resolveMetaAddress } from '@/lib/metaRegistry';
import { toUserMessage } from '@/lib/errors';

export type SendMode = 'public' | 'meta';

export type Resolution =
  | { state: 'idle' }
  | { state: 'invalid'; message: string }
  | { state: 'resolving' }
  | { state: 'resolved'; metaAddress: string; via: SendMode }
  | { state: 'unregistered' }
  | { state: 'no-account' }
  | { state: 'error'; message: string };

const DEBOUNCE_MS = 400;

/**
 * Turns whatever the sender typed into a meta-address the SDK can use.
 *
 * In `meta` mode the input already is one. In `public` mode we look up the
 * meta-address the recipient published on their account (see lib/metaRegistry).
 * Both modes converge on the same `metaAddress`, so the send path is identical.
 */
export function useRecipientResolver(input: string, mode: SendMode): Resolution {
  const [resolution, setResolution] = useState<Resolution>({ state: 'idle' });

  useEffect(() => {
    const value = input.trim();

    if (!value) {
      setResolution({ state: 'idle' });
      return;
    }

    if (mode === 'meta') {
      setResolution(
        looksLikeMetaAddress(value)
          ? { state: 'resolved', metaAddress: value, via: 'meta' }
          : {
              state: 'invalid',
              message: 'Expected a meta-address beginning with shade:stellar:',
            },
      );
      return;
    }

    if (!looksLikeStellarAddress(value)) {
      setResolution({
        state: 'invalid',
        message: 'Expected a Stellar public key starting with G (56 characters).',
      });
      return;
    }

    // Debounce so typing a 56-character key doesn't fire 56 Horizon lookups.
    let cancelled = false;
    setResolution({ state: 'resolving' });
    const timer = setTimeout(async () => {
      try {
        const outcome = await resolveMetaAddress(value);
        if (cancelled) return;
        if (outcome.status === 'found') {
          setResolution({ state: 'resolved', metaAddress: outcome.metaAddress, via: 'public' });
        } else if (outcome.status === 'no-account') {
          setResolution({ state: 'no-account' });
        } else {
          setResolution({ state: 'unregistered' });
        }
      } catch (err) {
        if (!cancelled) setResolution({ state: 'error', message: toUserMessage(err) });
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input, mode]);

  return resolution;
}
