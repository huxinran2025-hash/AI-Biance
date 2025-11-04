import { BinanceSecretProvider } from '../../../config/binance-secret-provider.js';
import { BinanceRestClient } from '../rest/index.js';
import { MarketStream } from '../ws/marketStream.js';
import type { BinanceCredentialProvider } from '../models.js';
import type { BinanceWebSocketOptions, MarketStreamMessage } from '../ws/types.js';

const DEFAULT_POLL_INTERVAL_MS = 30_000;

interface Binance24HrTicker {
  symbol: string;
  priceChangePercent?: string;
  lastPrice?: string;
  weightedAvgPrice?: string;
  openPrice?: string;
  highPrice?: string;
  lowPrice?: string;
  bidPrice?: string;
  askPrice?: string;
  volume?: string;
  quoteVolume?: string;
  openTime?: number;
  closeTime?: number;
}

interface BinanceWsTicker {
  e?: string;
  E?: number;
  s?: string;
  p?: string;
  P?: string;
  w?: string;
  c?: string;
  o?: string;
  h?: string;
  l?: string;
  v?: string;
  q?: string;
  b?: string;
  a?: string;
}

export interface MarketFeedTicker {
  symbol: string;
  price: number;
  volume24h: number;
  priceChange24h: number;
  openPrice?: number;
  highPrice24h?: number;
  lowPrice24h?: number;
  bestBid?: number;
  bestAsk?: number;
  eventTime?: number;
  updatedAt: number;
  source: 'rest' | 'ws';
}

export type MarketFeedSnapshot = Record<string, MarketFeedTicker>;

export interface MarketFeedOptions {
  symbols: string[];
  pollIntervalMs?: number;
  restClient?: BinanceRestClient;
  credentialProvider?: BinanceCredentialProvider;
  ws?: Partial<BinanceWebSocketOptions>;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return fallback;
}

export class MarketFeed {
  private readonly symbols: string[];
  private readonly symbolSet: Set<string>;
  private readonly pollIntervalMs: number;
  private readonly restClient: BinanceRestClient;
  private readonly stream: MarketStream;
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;
  private readonly snapshot: Map<string, MarketFeedTicker> = new Map();

  private pollTimer: NodeJS.Timeout | null = null;
  private fetchInFlight: Promise<void> | null = null;
  private started = false;

  constructor(options: MarketFeedOptions) {
    if (!options.symbols.length) {
      throw new Error('MarketFeed requires at least one symbol');
    }

    this.symbols = Array.from(new Set(options.symbols.map((s) => s.toUpperCase())));
    this.symbolSet = new Set(this.symbols);
    this.pollIntervalMs = Math.max(options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS, 5_000);
    this.logger = options.logger ?? console;

    if (options.restClient) {
      this.restClient = options.restClient;
    } else {
      const credentialProvider = options.credentialProvider ?? new BinanceSecretProvider();
      this.restClient = new BinanceRestClient({
        credentialProvider,
        userAgent: 'Biance-MarketFeed/1.0',
        retry: {
          retries: 5,
          backoffInitialMs: 200,
          backoffMultiplier: 2,
          backoffMaxMs: 3_000,
        },
      });
    }

    const wsOptions: Partial<BinanceWebSocketOptions> = {
      name: options.ws?.name ?? 'market-feed',
      reconnect: options.ws?.reconnect,
      pingIntervalMs: options.ws?.pingIntervalMs,
      pongTimeoutMs: options.ws?.pongTimeoutMs,
      logger: options.ws?.logger ?? this.logger,
      metrics: options.ws?.metrics,
      labels: options.ws?.labels,
    };

    this.stream = new MarketStream({
      streams: this.symbols.map((symbol) => `${symbol.toLowerCase()}@ticker`),
      ws: wsOptions,
    });

    this.stream.on('data', (message: MarketStreamMessage<BinanceWsTicker>) => {
      this.handleWsMessage(message);
    });
    this.stream.on('open', () => {
      this.logger.info?.('[MarketFeed] WebSocket connected');
    });
    this.stream.on('close', (code: number, reason: string) => {
      this.logger.warn?.('[MarketFeed] WebSocket closed', { code, reason });
    });
    this.stream.on('reconnect', (attempt: number, delay: number, code: number, reason: string) => {
      this.logger.warn?.('[MarketFeed] WebSocket reconnect scheduled', { attempt, delay, code, reason });
    });
    this.stream.on('error', (error: unknown) => {
      this.logger.error?.('[MarketFeed] WebSocket error', { error });
    });

    const now = Date.now();
    this.symbols.forEach((symbol) => {
      this.snapshot.set(symbol, {
        symbol,
        price: 0,
        volume24h: 0,
        priceChange24h: 0,
        updatedAt: now,
        source: 'rest',
      });
    });
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;

    try {
      await this.fetchSnapshot('initial');
    } catch (error) {
      this.logger.warn?.('[MarketFeed] Initial REST snapshot failed', { error });
    }

    try {
      await this.stream.start();
    } catch (error) {
      this.logger.error?.('[MarketFeed] Failed to start market stream', { error });
    }

    this.startPolling();
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    this.started = false;
    this.clearPolling();
    await this.stream.stop();
  }

  getSnapshot(): MarketFeedSnapshot {
    const result: MarketFeedSnapshot = {};
    for (const [symbol, entry] of this.snapshot.entries()) {
      result[symbol] = { ...entry };
    }
    return result;
  }

  private async fetchSnapshot(reason: 'initial' | 'poll'): Promise<void> {
    if (this.fetchInFlight) {
      return this.fetchInFlight;
    }

    this.fetchInFlight = (async () => {
      const params = { symbols: JSON.stringify(this.symbols) } as Record<string, string>;
      const { data } = await this.restClient.getPublic<Binance24HrTicker[]>('/api/v3/ticker/24hr', params);
      this.applyRestSnapshot(data);
      this.logger.info?.('[MarketFeed] REST snapshot refreshed', { reason, count: data.length });
    })()
      .catch((error) => {
        this.logger.error?.('[MarketFeed] Failed to refresh REST snapshot', { reason, error });
        throw error;
      })
      .finally(() => {
        this.fetchInFlight = null;
      });

    return this.fetchInFlight;
  }

  private startPolling(): void {
    this.clearPolling();
    this.pollTimer = setInterval(() => {
      void this.fetchSnapshot('poll').catch(() => {
        // Error already logged in fetchSnapshot
      });
    }, this.pollIntervalMs);
  }

  private clearPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private applyRestSnapshot(tickers: Binance24HrTicker[]): void {
    const now = Date.now();
    tickers.forEach((ticker) => {
      const symbol = ticker.symbol?.toUpperCase();
      if (!symbol || !this.symbolSet.has(symbol)) {
        return;
      }

      const price = toNumber(ticker.lastPrice ?? ticker.weightedAvgPrice ?? 0);
      const priceChangePercent = toNumber(ticker.priceChangePercent, 0) / 100;
      const volume = toNumber(ticker.quoteVolume ?? ticker.volume ?? 0);
      const openPrice = ticker.openPrice !== undefined ? toNumber(ticker.openPrice) : undefined;
      const highPrice = ticker.highPrice !== undefined ? toNumber(ticker.highPrice) : undefined;
      const lowPrice = ticker.lowPrice !== undefined ? toNumber(ticker.lowPrice) : undefined;
      const bestBid = ticker.bidPrice !== undefined ? toNumber(ticker.bidPrice) : undefined;
      const bestAsk = ticker.askPrice !== undefined ? toNumber(ticker.askPrice) : undefined;
      const eventTime = typeof ticker.closeTime === 'number' ? ticker.closeTime : now;

      this.mergeTicker(symbol, {
        price,
        volume24h: volume,
        priceChange24h: priceChangePercent,
        openPrice,
        highPrice24h: highPrice,
        lowPrice24h: lowPrice,
        bestBid,
        bestAsk,
        eventTime,
        updatedAt: now,
        source: 'rest',
      });
    });
  }

  private handleWsMessage(message: MarketStreamMessage<BinanceWsTicker>): void {
    const payload = message?.data;
    if (!payload) {
      return;
    }
    const symbol = payload.s?.toUpperCase();
    if (!symbol || !this.symbolSet.has(symbol)) {
      return;
    }

    const eventTime = typeof payload.E === 'number' ? payload.E : Date.now();
    const price = toNumber(payload.c ?? payload.w ?? 0);
    const priceChangePercent = toNumber(payload.P, 0) / 100;
    const volume = toNumber(payload.q ?? payload.v ?? 0);
    const openPrice = payload.o !== undefined ? toNumber(payload.o) : undefined;
    const highPrice = payload.h !== undefined ? toNumber(payload.h) : undefined;
    const lowPrice = payload.l !== undefined ? toNumber(payload.l) : undefined;
    const bestBid = payload.b !== undefined ? toNumber(payload.b) : undefined;
    const bestAsk = payload.a !== undefined ? toNumber(payload.a) : undefined;

    this.mergeTicker(symbol, {
      price,
      volume24h: volume,
      priceChange24h: priceChangePercent,
      openPrice,
      highPrice24h: highPrice,
      lowPrice24h: lowPrice,
      bestBid,
      bestAsk,
      eventTime,
      updatedAt: eventTime,
      source: 'ws',
    });
  }

  private mergeTicker(symbol: string, next: Omit<MarketFeedTicker, 'symbol'>): void {
    const previous = this.snapshot.get(symbol);
    const merged: MarketFeedTicker = {
      symbol,
      price: next.price ?? previous?.price ?? 0,
      volume24h: next.volume24h ?? previous?.volume24h ?? 0,
      priceChange24h: next.priceChange24h ?? previous?.priceChange24h ?? 0,
      openPrice: next.openPrice ?? previous?.openPrice,
      highPrice24h: next.highPrice24h ?? previous?.highPrice24h,
      lowPrice24h: next.lowPrice24h ?? previous?.lowPrice24h,
      bestBid: next.bestBid ?? previous?.bestBid,
      bestAsk: next.bestAsk ?? previous?.bestAsk,
      eventTime: next.eventTime ?? previous?.eventTime,
      updatedAt: next.updatedAt ?? Date.now(),
      source: next.source,
    };

    this.snapshot.set(symbol, merged);
  }
}


