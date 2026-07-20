/**
 * Testnet-only account funding via the public Friendbot faucet.
 *
 * A fresh identity's payout account does not exist on-chain until something
 * funds it. On testnet, Friendbot creates and funds it with a lump of XLM, which
 * is enough to unblock publishing and claiming. On mainnet there is no faucet,
 * so callers should only offer this when `NETWORK.isTestnet`.
 */
export async function fundWithFriendbot(address: string): Promise<void> {
  const response = await fetch(
    `https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`,
  );
  if (!response.ok) {
    throw new Error(`Friendbot funding failed (HTTP ${response.status}).`);
  }
}
