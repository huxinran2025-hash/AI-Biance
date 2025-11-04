// 可配置的 WS 端点，默认使用官方，可选镜像
const DEFAULT_WS_URL = 'wss://stream.binance.com:9443/stream';
const WS_URL = import.meta.env.VITE_BINANCE_WS_URL || DEFAULT_WS_URL;

// 可配置的 REST 端点，默认使用代理，可选镜像
const DEFAULT_REST_BASE = '/binance';
const REST_BASE = import.meta.env.VITE_BINANCE_REST || DEFAULT_REST_BASE;
const REST_MIRROR = 'https://data-api.binance.vision';

export interface BrowserTickerSnapshot {
  symbol: string;
  price: number;
  priceChange24h: number;
  volume24h?: number;
  quoteVolume24h?: number;
  tradeCount24h?: number;
  bestBid?: number;
  bestAsk?: number;
  eventTime?: number;
  updatedAt: number;
}

export interface MarketFeedBrowserOptions {
  reconnectDelayMs?: number;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
  wsEndpoint?: string; // 可选的 WS 端点
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export class MarketFeedBrowser {
  private symbols: string[];
  private readonly reconnectDelayMs: number;
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;
  private readonly wsEndpoint: string;
  private snapshot = new Map<string, BrowserTickerSnapshot>();
  private ws: WebSocket | null = null;
  private shouldRun = false;
  private reconnectTimer: number | null = null;
  private wsHealthy = false;
  private lastWsAt = 0;
  private fallbackIntervalId: number | null = null;

  constructor(symbols: string[], options: MarketFeedBrowserOptions = {}) {
    this.symbols = this.normalizeSymbols(symbols);
    this.reconnectDelayMs = Math.max(options.reconnectDelayMs ?? 3000, 1000);
    this.logger = options.logger ?? console;
    this.wsEndpoint = options.wsEndpoint || WS_URL;
  }

  private normalizeSymbols(symbols: string[]): string[] {
    return Array.from(new Set(symbols.map((s) => s.toUpperCase())));
  }

  async start(): Promise<void> {
    if (this.shouldRun) {
      return;
    }
    this.shouldRun = true;
    if (!this.symbols.length) {
      return;
    }
    this.open();
    void this.fetchRestSnapshot();
    this.startFallbackPolling();
  }

  stop(): void {
    this.shouldRun = false;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.fallbackIntervalId !== null) {
      window.clearInterval(this.fallbackIntervalId);
      this.fallbackIntervalId = null;
    }
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      try {
        this.ws.close(1000, 'client_close');
      } catch (error) {
        this.logger.warn?.('[MarketFeedBrowser] failed to close websocket', { error });
      }
    }
    this.ws = null;
    this.wsHealthy = false;
  }

  getSnapshot(): Record<string, BrowserTickerSnapshot> {
    const result: Record<string, BrowserTickerSnapshot> = {};
    for (const [symbol, entry] of this.snapshot.entries()) {
      result[symbol] = { ...entry };
    }
    return result;
  }

  restart(symbols: string[]): void {
    const wasRunning = this.shouldRun;
    this.stop();
    this.symbols = this.normalizeSymbols(symbols);
    this.snapshot.clear();
    if (wasRunning) {
      void this.start();
    }
  }

  private open(): void {
    const streamPath = this.symbols
      .map((symbol) => `${symbol.toLowerCase()}@ticker/${symbol.toLowerCase()}@bookTicker`)
      .join('/');

    const url = `${this.wsEndpoint}?streams=${streamPath}`;
    this.logger.info?.('[MarketFeedBrowser] connecting', { url });

    try {
      this.ws = new WebSocket(url);
    } catch (error) {
      this.logger.error?.('[MarketFeedBrowser] failed to create websocket', { error });
      this.scheduleReconnect();
      return;
    }

    this.ws.addEventListener('open', () => {
      this.logger.info?.('[MarketFeedBrowser] websocket open');
      this.wsHealthy = true;
      this.lastWsAt = Date.now();
    });

    this.ws.addEventListener('close', (event) => {
      this.logger.warn?.('[MarketFeedBrowser] websocket closed', { code: event.code, reason: event.reason });
      this.wsHealthy = false;
      this.ws = null;
      if (this.shouldRun) {
        this.scheduleReconnect();
      }
    });

    this.ws.addEventListener('error', (event) => {
      this.logger.warn?.('[MarketFeedBrowser] websocket error', { event });
      this.wsHealthy = false;
    });

    this.ws.addEventListener('message', (event) => {
      try {
        this.lastWsAt = Date.now();
        this.wsHealthy = true;
        const payload = JSON.parse(event.data as string);
        this.handleMessage(payload);
      } catch (error) {
        this.logger.warn?.('[MarketFeedBrowser] failed to parse message', { error });
      }
    });
  }

  private scheduleReconnect(): void {
    if (!this.shouldRun || this.reconnectTimer !== null) {
      return;
    }
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldRun) {
        this.open();
      }
    }, this.reconnectDelayMs);
  }

  private handleMessage(message: any): void {
    const data = message?.data ?? message;
    if (!data) {
      return;
    }

    const symbol = (data.s ?? data.symbol) as string | undefined;
    if (!symbol) {
      return;
    }
    const normalized = symbol.toUpperCase();
    if (!this.symbols.includes(normalized)) {
      return;
    }

    const now = Date.now();
    const existing = this.snapshot.get(normalized) ?? {
      symbol: normalized,
      price: 0,
      priceChange24h: 0,
      updatedAt: now,
    };

    const next: BrowserTickerSnapshot = { ...existing, symbol: normalized, updatedAt: now };

    const eventType = data.e as string | undefined;
    if (eventType === '24hrTicker' || data.c !== undefined || data.P !== undefined) {
      const lastPrice = toNumber(data.c) ?? existing.price;
      const priceChangePct = toNumber(data.P) ?? existing.priceChange24h;
      const baseVolume = toNumber(data.v);
      const quoteVolume = toNumber(data.q);
      const tradeCount = toNumber(data.n);
      next.price = lastPrice;
      if (priceChangePct !== undefined) {
        next.priceChange24h = priceChangePct;
      }
      if (baseVolume !== undefined) {
        next.volume24h = baseVolume;
      }
      if (quoteVolume !== undefined) {
        next.quoteVolume24h = quoteVolume;
      }
      if (tradeCount !== undefined) {
        next.tradeCount24h = tradeCount;
      }
      next.eventTime = typeof data.E === 'number' ? data.E : now;
    }

    if (eventType === 'bookTicker' || (data.b !== undefined && data.a !== undefined)) {
      const bid = toNumber(data.b);
      const ask = toNumber(data.a);
      if (bid !== undefined) {
        next.bestBid = bid;
      }
      if (ask !== undefined) {
        next.bestAsk = ask;
      }
      if ((bid !== undefined && ask !== undefined) && (!Number.isFinite(next.price) || next.price === 0)) {
        next.price = (bid + ask) / 2;
      }
      next.eventTime = typeof data.E === 'number' ? data.E : now;
    }

    this.snapshot.set(normalized, next);
  }

  async fetchRestSnapshot(): Promise<void> {
    if (!this.symbols.length || typeof fetch === 'undefined') {
      return;
    }

    const query = encodeURIComponent(JSON.stringify(this.symbols));
    const urls = [
      `${REST_BASE}/api/v3/ticker/24hr?symbols=${query}`,
      `${REST_MIRROR}/api/v3/ticker/24hr?symbols=${query}`,
    ];

    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          continue; // 尝试下一个 URL
        }
        const tickers = await response.json();
        const now = Date.now();

        if (!Array.isArray(tickers)) {
          continue;
        }

        tickers.forEach((ticker) => {
          const symbol = typeof ticker?.symbol === 'string' ? ticker.symbol.toUpperCase() : undefined;
          if (!symbol || !this.symbols.includes(symbol)) {
            return;
          }

          const lastPrice = toNumber(ticker?.lastPrice);
          const priceChangePct = toNumber(ticker?.priceChangePercent);
          const baseVolume = toNumber(ticker?.volume);
          const quoteVolume = toNumber(ticker?.quoteVolume);
          const bestBid = toNumber(ticker?.bidPrice);
          const bestAsk = toNumber(ticker?.askPrice);
          const eventTime = typeof ticker?.closeTime === 'number' ? ticker.closeTime : now;
          const tradeCount = toNumber(ticker?.count ?? ticker?.n);

          const next: BrowserTickerSnapshot = {
            symbol,
            price: lastPrice ?? this.snapshot.get(symbol)?.price ?? 0,
            priceChange24h: priceChangePct ?? this.snapshot.get(symbol)?.priceChange24h ?? 0,
            volume24h: baseVolume ?? this.snapshot.get(symbol)?.volume24h,
            quoteVolume24h: quoteVolume ?? this.snapshot.get(symbol)?.quoteVolume24h,
            tradeCount24h: tradeCount ?? this.snapshot.get(symbol)?.tradeCount24h,
            bestBid: bestBid ?? this.snapshot.get(symbol)?.bestBid,
            bestAsk: bestAsk ?? this.snapshot.get(symbol)?.bestAsk,
            updatedAt: now,
            eventTime,
          };

          this.snapshot.set(symbol, next);
        });
        
        // 成功获取数据，返回
        this.logger.info?.('[MarketFeedBrowser] REST snapshot fetched successfully', { source: url });
        return;
      } catch (error) {
        this.logger.warn?.('[MarketFeedBrowser] failed to fetch REST snapshot from', { url, error });
        // 继续尝试下一个 URL
      }
    }
    
    // 所有 URL 都失败了
    this.logger.warn?.('[MarketFeedBrowser] All REST endpoints failed');
  }

  private startFallbackPolling(): void {
    if (this.fallbackIntervalId !== null) {
      return;
    }
    
    this.fallbackIntervalId = window.setInterval(async () => {
      if (!this.shouldRun) {
        return;
      }
      
      const now = Date.now();
      const tooQuiet = now - this.lastWsAt > 10_000; // 10秒无数据
      
      if (!this.wsHealthy || tooQuiet) {
        try {
          await this.fetchRestSnapshot();
          this.logger.info?.('[MarketFeedBrowser] REST fallback active', { 
            wsHealthy: this.wsHealthy, 
            secondsSinceLastWs: Math.floor((now - this.lastWsAt) / 1000) 
          });
        } catch (error) {
          this.logger.warn?.('[MarketFeedBrowser] REST fallback failed', { error });
        }
      }
    }, 3000); // 每3秒检查一次
  }

  private mergeSnapshot(restData: Record<string, BrowserTickerSnapshot>): void {
    for (const [symbol, data] of Object.entries(restData)) {
      const existing = this.snapshot.get(symbol);
      if (existing) {
        // 合并数据，REST数据优先（如果WS数据过期）
        this.snapshot.set(symbol, {
          ...existing,
          ...data,
          // 保留WS的实时bestBid/bestAsk（如果存在且较新）
          bestBid: existing.bestBid && existing.updatedAt > data.updatedAt - 5000 
            ? existing.bestBid 
            : data.bestBid,
          bestAsk: existing.bestAsk && existing.updatedAt > data.updatedAt - 5000 
            ? existing.bestAsk 
            : data.bestAsk,
        });
      } else {
        this.snapshot.set(symbol, data);
      }
    }
  }
}


