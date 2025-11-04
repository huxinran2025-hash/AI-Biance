import { RiskTierKey } from '../exchange/binance/models.js';
import whitelistData from './binance-whitelist.json';

export interface WhitelistConfig {
  tierMap: Record<string, RiskTierKey>;
}

export async function loadWhitelist(): Promise<Map<string, RiskTierKey>> {
  const parsed = whitelistData as WhitelistConfig;
  const map = new Map<string, RiskTierKey>();
  for (const [symbol, tier] of Object.entries(parsed.tierMap)) {
    map.set(symbol, tier);
  }
  return map;
}


