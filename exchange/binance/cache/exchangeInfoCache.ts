import { setTimeout as sleep } from 'node:timers/promises';
import { BinanceRestClient } from '../rest/index.js';
import { ExchangeSymbolMeta, SymbolFilters } from '../models.js';

const PRICE_FILTER = 'PRICE_FILTER';
const LOT_SIZE = 'LOT_SIZE';
const MIN_NOTIONAL = 'MIN_NOTIONAL';

export interface ExchangeInfoCacheOptions {
  restClient: BinanceRestClient;
  symbols?: string[];
  refreshIntervalMs?: number;
}

interface RawExchangeInfo {
  timezone: string;
  serverTime: number;
  symbols: RawSymbol[];
}

interface RawSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  filters: Array<{ filterType: string; [key: string]: string }>;
}

export class ExchangeInfoCache {
  private readonly restClient: BinanceRestClient;
  private readonly symbols?: string[];
  private readonly refreshIntervalMs: number;
  private lastRefresh = 0;
  private refreshing = false;
  private readonly meta = new Map<string, ExchangeSymbolMeta>();
  private readonly assetToSymbol = new Map<string, string>();

  constructor(options: ExchangeInfoCacheOptions) {
    this.restClient = options.restClient;
    this.symbols = options.symbols;
    this.refreshIntervalMs = options.refreshIntervalMs ?? 30 * 60 * 1000;
  }

  async ensureFresh(): Promise<void> {
    const now = Date.now();
    if (this.refreshing) {
      while (this.refreshing) {
        await sleep(25);
      }
      return;
    }

    if (now - this.lastRefresh < this.refreshIntervalMs && this.meta.size > 0) {
      return;
    }

    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.refreshing) {
      return;
    }
    this.refreshing = true;
    try {
      const params = this.symbols && this.symbols.length > 0 ? { symbols: JSON.stringify(this.symbols) } : undefined;
      const { data } = await this.restClient.getPublic<RawExchangeInfo>('/api/v3/exchangeInfo', params);
      this.rebuild(data);
      this.lastRefresh = Date.now();
    } finally {
      this.refreshing = false;
    }
  }

  getFilters(symbol: string): SymbolFilters | undefined {
    const meta = this.meta.get(symbol);
    if (!meta) return undefined;
    const { tickSize, stepSize, minNotional, minQty, maxPrice, minPrice } = meta;
    return { symbol, tickSize, stepSize, minNotional, minQty, maxPrice, minPrice };
  }

  getSymbolMeta(symbol: string): ExchangeSymbolMeta | undefined {
    return this.meta.get(symbol);
  }

  listSymbols(): ExchangeSymbolMeta[] {
    return Array.from(this.meta.values());
  }

  resolveSymbolByAsset(asset: string): ExchangeSymbolMeta | undefined {
    const symbol = this.assetToSymbol.get(asset);
    return symbol ? this.meta.get(symbol) : undefined;
  }

  private rebuild(data: RawExchangeInfo): void {
    this.meta.clear();
    this.assetToSymbol.clear();

    for (const symbolInfo of data.symbols) {
      const filters = this.extractFilters(symbolInfo);
      const entry: ExchangeSymbolMeta = {
        symbol: symbolInfo.symbol,
        status: symbolInfo.status,
        baseAsset: symbolInfo.baseAsset,
        quoteAsset: symbolInfo.quoteAsset,
        ...filters,
      };
      this.meta.set(symbolInfo.symbol, entry);

      if (symbolInfo.quoteAsset === 'USDT') {
        this.assetToSymbol.set(symbolInfo.baseAsset, symbolInfo.symbol);
      }
    }
  }

  private extractFilters(symbol: RawSymbol): SymbolFilters {
    let tickSize = '0';
    let stepSize = '0';
    let minNotional = '0';
    let minQty = '0';
    let maxPrice: string | undefined;
    let minPrice: string | undefined;

    for (const filter of symbol.filters) {
      switch (filter.filterType) {
        case PRICE_FILTER:
          tickSize = filter.tickSize ?? tickSize;
          maxPrice = filter.maxPrice ?? maxPrice;
          minPrice = filter.minPrice ?? minPrice;
          break;
        case LOT_SIZE:
          stepSize = filter.stepSize ?? stepSize;
          minQty = filter.minQty ?? minQty;
          break;
        case MIN_NOTIONAL:
          minNotional = filter.minNotional ?? minNotional;
          break;
        default:
          break;
      }
    }

    return {
      symbol: symbol.symbol,
      tickSize,
      stepSize,
      minNotional,
      minQty,
      maxPrice,
      minPrice,
    };
  }
}


