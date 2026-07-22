import { useEffect, useRef } from 'react';
import { useIdentity } from '@/identity/IdentityProvider';
import { usePublish } from '@/identity/usePublish';

/**
 * Non-interactive auto-publish.
 *
 * When an identity was onboarded with "publish my address" on (`publishPref`),
 * this headless host publishes it as soon as it *can* — i.e. once `canManage`
 * flips true. For a wallet-free identity that means waiting until its derived
 * payout account is funded on-chain; for a wallet identity, until the owning
 * wallet is reconnected. All of that gating already lives in `usePublish`
 * (`canManage` = funded + wallet-match), so we reuse it wholesale rather than
 * re-deriving signer/publish logic here.
 *
 * The publish fires EXACTLY ONCE per identity: a ref keyed by the active
 * identity id guards against loops and StrictMode double-mounts, and resets when
 * the user switches identities so each one gets its own single shot.
 *
 * `usePublish` already runs `refresh()` in an effect, so `publishState` settles
 * to a real value before we auto-fire — we only act on `'not-published'`, never
 * the initial `'unknown'`.
 */
export function AutoPublishHost() {
  const { activeId, publishPref } = useIdentity();
  const { publishState, canManage, busy, publish } = usePublish();

  // The identity id we've already auto-published (or are mid-publish for), so we
  // never fire twice for the same identity. Keyed by id, so switching identities
  // naturally re-arms the single shot for the newly active one.
  const firedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeId) return;
    if (firedForRef.current === activeId) return;
    if (!publishPref) return;
    if (publishState !== 'not-published') return;
    if (!canManage || busy) return;

    firedForRef.current = activeId;
    void publish();
  }, [activeId, publishPref, publishState, canManage, busy, publish]);

  return null;
}
