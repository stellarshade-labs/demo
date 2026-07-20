import { ShadeError } from 'stellar-shade';

/**
 * Turn SDK / wallet / Horizon failures into something a human can act on.
 * Every Shade error carries a stable `.code`, so we key off that rather than
 * matching on message text.
 */

const SHADE_MESSAGES: Record<string, string> = {
  CONTRACT_ID_REQUIRED: 'No stealth pool contract is configured. Check VITE_SHADE_CONTRACT_ID.',
  UNSUPPORTED_NETWORK: 'This network is not supported by the Shade SDK yet.',
  METHOD_REQUIRED: 'No delivery method was selected for this transfer.',
  METHOD_NOT_ENABLED: 'That delivery method is not enabled on this client.',
  METHOD_NOT_AVAILABLE: 'That delivery method is unavailable right now.',
  MINIMUM_AMOUNT: 'Amount is below the protocol minimum for this delivery method.',
  INVALID_AMOUNT: 'That amount is not valid.',
  CLAIM_AMOUNT: 'The requested claim amount exceeds the available balance.',
  NO_BALANCE: 'There is nothing left to claim at this stealth address.',
  FEE_PAYER_REQUIRED: 'A fee payer is required to claim from the pool.',
  FEE_PAYER_ADDRESS_REQUIRED:
    'A fee payer address is required when signing with a wallet. Reconnect and try again.',
  DESTINATION_TRUSTLINE: 'The destination account has no trustline for this asset.',
  STEALTH_ACCOUNT_NOT_FOUND: 'The stealth account for this payment no longer exists on-chain.',
  ANNOUNCEMENT_NOT_FOUND: 'The announcement for this payment could not be found.',
  NO_HEALTHY_RELAYER: 'No relayer is reachable right now. Try again, or submit without a relayer.',
  RELAYER_NETWORK: 'Could not reach the relayer. Check your connection or the relayer URL.',
  RELAYER_HTTP: 'The relayer rejected this submission.',
  INDEXER_NETWORK: 'Could not reach the indexer.',
  INDEXER_HTTP: 'The indexer returned an error.',
  ENTRY_ARCHIVED_RESTORING: 'Contract state was archived and is being restored. Retry shortly.',
  TRANSACTION_RETRYABLE: 'The network was busy and the transaction was not applied. Try again.',
  TRANSACTION_TIMEOUT: 'The transaction was submitted but has not landed yet. Check the hash.',
  WRONG_PASSWORD: 'Wrong password.',
  SESSION_INTEGRITY: 'The stored session is corrupt and was discarded.',
};

/** Freighter and other wallets reject with a user-cancellation signal. */
function isUserRejection(error: unknown): boolean {
  const message = extractRawMessage(error).toLowerCase();
  return (
    message.includes('user declined') ||
    message.includes('user rejected') ||
    message.includes('rejected by the user') ||
    message.includes('request was cancelled') ||
    message.includes('user denied')
  );
}

function extractRawMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object') {
    const candidate = error as { message?: unknown; error?: unknown };
    if (typeof candidate.message === 'string') return candidate.message;
    if (typeof candidate.error === 'string') return candidate.error;
    if (candidate.error && typeof candidate.error === 'object') {
      const nested = (candidate.error as { message?: unknown }).message;
      if (typeof nested === 'string') return nested;
    }
  }
  return String(error);
}

export function toUserMessage(error: unknown): string {
  if (isUserRejection(error)) return 'Signature request was declined in your wallet.';

  if (error instanceof ShadeError) {
    const mapped = SHADE_MESSAGES[error.code];
    if (mapped) return mapped;
    return error.message || `Shade error (${error.code}).`;
  }

  const raw = extractRawMessage(error);

  // Horizon submission failures arrive as opaque result codes; translate the
  // handful a demo user will realistically hit.
  if (raw.includes('op_underfunded') || raw.includes('tx_insufficient_balance')) {
    return 'Insufficient balance to cover this transfer plus network fees.';
  }
  if (raw.includes('tx_bad_seq')) {
    return 'Account sequence was out of date. Try again.';
  }
  if (raw.includes('op_low_reserve')) {
    return 'Not enough XLM to meet the account reserve for this operation.';
  }
  if (raw.includes('404') && raw.toLowerCase().includes('account')) {
    return 'That account does not exist on this network yet. Fund it first.';
  }

  return raw || 'Something went wrong.';
}

/** Shade error code, when the failure came from the SDK. */
export function errorCode(error: unknown): string | undefined {
  return error instanceof ShadeError ? error.code : undefined;
}
