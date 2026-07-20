import type { WalletConnector } from '../types';
import { freighterConnector } from './freighter';
import { walletConnectConnector } from './walletconnect';

/** Ordered by priority: Freighter (extension) first, WalletConnect (mobile/QR) second. */
export const connectors: WalletConnector[] = [freighterConnector, walletConnectConnector];

export function connectorById(id: string | null | undefined): WalletConnector | undefined {
  if (!id) return undefined;
  return connectors.find((c) => c.id === id);
}
