import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PaperEngineOptions } from '../exchange/binance/paper/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadPaperConfig(path = resolve(__dirname, 'paper-config.json')): Promise<PaperEngineOptions> {
  const raw = await readFile(path, 'utf-8');
  const parsed = JSON.parse(raw);
  const defaultEquity = Number(parsed.equities?.default ?? parsed.initialEquity ?? 10_000);
  const overrides = parsed.equities?.portfolioOverrides ?? {};
  const portfolioEquities: Record<string, number> = {};
  for (const [portfolioId, equity] of Object.entries(overrides)) {
    const numeric = Number(equity);
    if (!Number.isNaN(numeric) && numeric > 0) {
      portfolioEquities[portfolioId] = numeric;
    }
  }

  const makerFeeRaw = Number(parsed.fees?.maker ?? parsed.makerFeeBps ?? 0.0002);
  const takerFeeRaw = Number(parsed.fees?.taker ?? parsed.takerFeeBps ?? 0.0004);
  const makerFeeBps = makerFeeRaw > 1 ? makerFeeRaw : makerFeeRaw * 10_000;
  const takerFeeBps = takerFeeRaw > 1 ? takerFeeRaw : takerFeeRaw * 10_000;

  const slippage = parsed.slippage ?? {};
  const slippageBase = Number(slippage.bps ?? slippage.buyBps ?? 10);
  const buySlippageBps = Number(slippage.buyBps ?? slippageBase);
  const sellSlippageBps = Number(slippage.sellBps ?? slippageBase);

  return {
    baseCurrency: parsed.baseCurrency ?? 'USDT',
    defaultEquity,
    portfolioEquities,
    makerFeeBps,
    takerFeeBps,
    buySlippageBps,
    sellSlippageBps,
    latencyMs: Number(parsed.latencyMs ?? 80),
    fokAsIoc: parsed.fokAsIoc ?? true,
    netting: parsed.netting === 'fifo' ? 'fifo' : 'avg',
  };
}

