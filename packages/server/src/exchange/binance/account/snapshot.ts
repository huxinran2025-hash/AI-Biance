import { AccountSnapshot, BinanceAccountBalance, ExchangeSymbolMeta, MarketQuote, PaperAccountState } from '../models.js';

export interface AccountSnapshotBuilderOptions {
  quoteSymbol?: string;
}

export class AccountSnapshotBuilder {
  private readonly quoteSymbol: string;
  private paperAccount: PaperAccountState | null = null;

  constructor(options: AccountSnapshotBuilderOptions = {}) {
    this.quoteSymbol = options.quoteSymbol ?? 'USDT';
  }

  updateFromPaper(account: PaperAccountState): void {
    this.paperAccount = clonePaperAccount(account);
  }

  clearPaper(): void {
    this.paperAccount = null;
  }

  build(
    balances: BinanceAccountBalance[],
    symbols: ExchangeSymbolMeta[],
    quotes: Map<string, MarketQuote>,
    timestamp: number,
  ): AccountSnapshot {
    if (this.paperAccount) {
      const account = this.paperAccount;
      const exposures: Record<string, number> = {};
      for (const [symbol, position] of Object.entries(account.positions ?? {})) {
        const mark = position.markPrice ?? position.averagePrice;
        exposures[symbol] = mark * position.quantity;
      }

      const balancesFromPaper: BinanceAccountBalance[] = [
        {
          asset: account.baseCurrency,
          free: account.cash,
          locked: 0,
        },
      ];

      return {
        balances: balancesFromPaper,
        netWorth: account.equity,
        totalExposure: account.exposure,
        symbolExposure: exposures,
        timestamp,
      };
    }

    const symbolExposure: Record<string, number> = {};
    const assetPriceCache = new Map<string, number>();

    let netWorth = 0;
    let totalExposure = 0;

    for (const balance of balances) {
      const totalAsset = balance.free + balance.locked;
      if (totalAsset === 0) continue;

      if (balance.asset === this.quoteSymbol) {
        netWorth += totalAsset;
        continue;
      }

      const symbolMeta = symbols.find((meta) => meta.baseAsset === balance.asset && meta.quoteAsset === this.quoteSymbol);
      if (!symbolMeta) {
        // Could be other quote (BNB, BTC); skip for now but keep net worth conservative.
        continue;
      }

      const quote = quotes.get(symbolMeta.symbol);
      if (!quote) {
        continue;
      }

      const price = quote.lastPrice ?? (quote.bestBid + quote.bestAsk) / 2;
      assetPriceCache.set(balance.asset, price);
      const nominal = price * totalAsset;
      netWorth += nominal;
      totalExposure += nominal;
      symbolExposure[symbolMeta.symbol] = (symbolExposure[symbolMeta.symbol] ?? 0) + nominal;
    }

    return {
      balances,
      netWorth,
      totalExposure,
      symbolExposure,
      timestamp,
    };
  }
}

function clonePaperAccount(account: PaperAccountState): PaperAccountState {
  const structClone = (globalThis as any).structuredClone;
  if (typeof structClone === 'function') {
    return structClone(account);
  }
  return JSON.parse(JSON.stringify(account));
}


