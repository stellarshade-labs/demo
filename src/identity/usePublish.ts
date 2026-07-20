import { useCallback, useEffect, useState } from 'react';
import { toUserMessage } from '@/lib/errors';
import {
  publishMetaAddress,
  publishReceiveMethod,
  resolveMetaAddress,
  unpublishMetaAddress,
} from '@/lib/metaRegistry';
import { useWallet } from '@/wallet/WalletProvider';
import { useSession } from '@/store/session';
import { useIdentity, signerFromSecret } from './IdentityProvider';
import { useIdentityStore, type ReceiveMethod } from './identityStore';

export type PublishState = 'unknown' | 'published' | 'not-published';

export interface PublishResult {
  status: 'success' | 'error';
  message: string;
  txHash?: string;
}

/**
 * Shared publish/unpublish/method-update controls for the receiver's address,
 * used by both Receive and Settings so the on-chain registry logic lives once.
 *
 * Signing goes through the wallet for wallet identities, or the derived payout
 * secret for wallet-free ones — both require the payout account to exist/be
 * funded, surfaced via `canManage`.
 */
export function usePublish() {
  const { source, metaAddress, payoutAddress, payoutSecret, setPublishPref } = useIdentity();
  const { status, signTransaction } = useWallet();
  const receiveMethod = useIdentityStore((s) => s.settings.receiveMethod);
  const addTx = useSession((s) => s.addTx);
  const updateTx = useSession((s) => s.updateTx);

  const [publishState, setPublishState] = useState<PublishState>('unknown');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);

  const canManage = source === 'wallet' ? status === 'connected' : Boolean(payoutSecret);

  const refresh = useCallback(async () => {
    if (!payoutAddress) return;
    try {
      const outcome = await resolveMetaAddress(payoutAddress);
      setPublishState(outcome.status === 'found' ? 'published' : 'not-published');
    } catch {
      setPublishState('unknown');
    }
  }, [payoutAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signerFor = useCallback(
    () => (source === 'wallet' ? signTransaction : signerFromSecret(payoutSecret!)),
    [source, signTransaction, payoutSecret],
  );

  const run = useCallback(
    async (
      kind: 'publish' | 'unpublish',
      action: () => Promise<{ txHash: string }>,
      success: string,
      nextState: PublishState,
      pref: boolean,
    ) => {
      if (!payoutAddress) return;
      setBusy(true);
      setResult(null);
      const txId = addTx({ kind, status: 'pending', counterparty: payoutAddress });
      try {
        const { txHash } = await action();
        updateTx(txId, { status: 'success', txHash });
        setResult({ status: 'success', message: success, txHash });
        setPublishState(nextState);
        setPublishPref(pref);
      } catch (err) {
        const message = toUserMessage(err);
        updateTx(txId, { status: 'error', error: message });
        setResult({ status: 'error', message });
      } finally {
        setBusy(false);
      }
    },
    [payoutAddress, addTx, updateTx, setPublishPref],
  );

  const publish = useCallback(
    () =>
      run(
        'publish',
        () => publishMetaAddress(payoutAddress!, metaAddress!, signerFor(), receiveMethod),
        'Address published. Senders can now reach you by your public address.',
        'published',
        true,
      ),
    [run, payoutAddress, metaAddress, signerFor, receiveMethod],
  );

  const unpublish = useCallback(
    () =>
      run(
        'unpublish',
        () => unpublishMetaAddress(payoutAddress!, signerFor()),
        'Address removed. Your reserve is released.',
        'not-published',
        false,
      ),
    [run, payoutAddress, signerFor],
  );

  /** Push a changed method preference on-chain (only meaningful when published). */
  const updateMethod = useCallback(
    async (method: ReceiveMethod) => {
      if (!payoutAddress) return;
      setBusy(true);
      setResult(null);
      try {
        const { txHash } = await publishReceiveMethod(payoutAddress, method, signerFor());
        setResult({ status: 'success', message: `Senders will now use ${method}.`, txHash });
      } catch (err) {
        setResult({ status: 'error', message: toUserMessage(err) });
      } finally {
        setBusy(false);
      }
    },
    [payoutAddress, signerFor],
  );

  return {
    publishState,
    busy,
    result,
    setResult,
    canManage,
    source,
    payoutAddress,
    publish,
    unpublish,
    updateMethod,
    refresh,
  };
}
