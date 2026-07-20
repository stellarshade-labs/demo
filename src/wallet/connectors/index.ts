import type { WalletConnector } from '../types';
import { freighterConnector } from './freighter';
import { albedoConnector } from './albedo';
import { xbullConnector } from './xbull';

/** Ordered by how likely a Stellar dapp user is to have them. */
export const connectors: WalletConnector[] = [
  freighterConnector,
  xbullConnector,
  albedoConnector,
];

export function connectorById(id: string | null | undefined): WalletConnector | undefined {
  if (!id) return undefined;
  return connectors.find((c) => c.id === id);
}
