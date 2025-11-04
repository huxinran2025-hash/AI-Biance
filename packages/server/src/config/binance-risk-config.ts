import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { RiskConfig, RiskTierKey } from '../exchange/binance/models.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadRiskConfig(path = resolve(__dirname, 'binance-risk-tiers.json')): Promise<RiskConfig> {
  const raw = await readFile(path, 'utf-8');
  const parsed = JSON.parse(raw);

  validateRiskConfig(parsed);
  return parsed as RiskConfig;
}

function validateRiskConfig(config: any): asserts config is RiskConfig {
  if (typeof config?.accountMaxExposurePct !== 'number') {
    throw new Error('Risk config missing accountMaxExposurePct');
  }

  if (!config?.tiers || typeof config.tiers !== 'object') {
    throw new Error('Risk config missing tiers');
  }

  for (const [tier, value] of Object.entries(config.tiers as Record<RiskTierKey, any>)) {
    if (typeof value.maxLeverage !== 'number') {
      throw new Error(`Risk tier ${tier} missing maxLeverage`);
    }
    if (typeof value.perOrderCapPct !== 'number') {
      throw new Error(`Risk tier ${tier} missing perOrderCapPct`);
    }
    if (typeof value.symbolCapPct !== 'number') {
      throw new Error(`Risk tier ${tier} missing symbolCapPct`);
    }
  }
}


