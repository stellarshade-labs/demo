import type { SecretIdentity } from './identityCrypto';

/**
 * The plaintext backup a user downloads at onboarding (and can re-download from
 * Settings). This is the ONLY copy of the spend authority that leaves the app,
 * so it carries everything needed to fully restore the identity elsewhere.
 */
export function buildBackup(secret: SecretIdentity): Record<string, unknown> {
  return {
    app: 'Shade',
    warning:
      'KEEP THIS FILE SECRET AND SAFE. Anyone who has it can spend your funds. There is no recovery if you lose it.',
    exportedAt: new Date().toISOString(),
    source: secret.source,
    ...(secret.mnemonic ? { mnemonic: secret.mnemonic } : {}),
    metaAddress: secret.stealthKeys.metaAddress,
    stealthKeys: {
      spendPubKey: secret.stealthKeys.spendPubKey,
      spendPrivKey: secret.stealthKeys.spendPrivKey,
      viewPubKey: secret.stealthKeys.viewPubKey,
      viewPrivKey: secret.stealthKeys.viewPrivKey,
    },
    payout: secret.payout,
  };
}

/** Trigger a browser download of the identity backup as a JSON file. */
export function downloadBackup(secret: SecretIdentity): void {
  const body = JSON.stringify(buildBackup(secret), null, 2);
  const blob = new Blob([body], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `shade-identity-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
