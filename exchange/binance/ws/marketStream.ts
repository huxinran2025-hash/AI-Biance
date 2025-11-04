import { BinanceWebSocket } from './baseStream.js';
import { BinanceWebSocketOptions, MarketStreamMessage } from './types.js';

const BASE_WS_URL = 'wss://stream.binance.com:9443';

export interface MarketStreamOptions {
  streams: string[];
  ws?: Partial<BinanceWebSocketOptions>;
}

export class MarketStream extends BinanceWebSocket {
  private streams: string[];

  constructor({ streams, ws }: MarketStreamOptions) {
    super({
      name: ws?.name ?? 'market',
      reconnect: ws?.reconnect,
      pingIntervalMs: ws?.pingIntervalMs,
      pongTimeoutMs: ws?.pongTimeoutMs,
      logger: ws?.logger,
      metrics: ws?.metrics,
      labels: { ...(ws?.labels ?? {}), stream: 'market' },
    });
    this.streams = streams;
  }

  setStreams(streams: string[]): void {
    this.streams = streams;
    if (this.streams.length === 0) {
      void this.stop();
    } else {
      if (this.socket) {
        void this.stop().then(() => this.start());
      }
    }
  }

  protected targetUrl(): string {
    const path = this.streams.join('/');
    const url = this.streams.length > 1 ? `${BASE_WS_URL}/stream?streams=${path}` : `${BASE_WS_URL}/ws/${path}`;
    return url;
  }

  protected override handleMessage(payload: string): void {
    try {
      const message = JSON.parse(payload) as MarketStreamMessage;
      this.emit('data', message);
    } catch (error) {
      this.log('warn', 'failed to parse message', { payload });
      this.emit('parse_error', error, payload);
    }
  }
}

