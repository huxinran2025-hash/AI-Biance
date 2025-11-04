import { setInterval as poll } from 'node:timers';
import { BinanceRestClient } from '../rest/index.js';
import { BinanceWebSocket } from './baseStream.js';
import { BinanceWebSocketOptions, ListenKeyResponse } from './types.js';

const BASE_WS_URL = 'wss://stream.binance.com:9443';
const KEEPALIVE_DEFAULT_MS = 25 * 60 * 1000;

export interface UserDataStreamOptions {
  restClient: BinanceRestClient;
  keepAliveMs?: number;
  ws?: Partial<BinanceWebSocketOptions>;
}

export class UserDataStream extends BinanceWebSocket {
  private listenKey: string | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private readonly restClient: BinanceRestClient;
  private readonly keepAliveMs: number;

  constructor({ restClient, keepAliveMs, ws }: UserDataStreamOptions) {
    super({
      name: ws?.name ?? 'user-data',
      reconnect: ws?.reconnect,
      pingIntervalMs: ws?.pingIntervalMs,
      pongTimeoutMs: ws?.pongTimeoutMs,
      logger: ws?.logger,
      metrics: ws?.metrics,
      labels: { ...(ws?.labels ?? {}), stream: 'user' },
    });
    this.restClient = restClient;
    this.keepAliveMs = keepAliveMs ?? KEEPALIVE_DEFAULT_MS;
  }

  override async start(): Promise<void> {
    await this.refreshListenKey();
    await super.start();
    this.scheduleKeepAlive();
  }

  override async stop(): Promise<void> {
    this.clearKeepAlive();
    await super.stop();
  }

  protected override async targetUrl(): Promise<string> {
    if (!this.listenKey) {
      await this.refreshListenKey();
    }
    if (!this.listenKey) {
      throw new Error('listenKey not available');
    }
    return `${BASE_WS_URL}/ws/${this.listenKey}`;
  }

  protected override handleMessage(payload: string): void {
    try {
      const parsed = JSON.parse(payload);
      this.emit('event', parsed);
    } catch (error) {
      this.log('warn', 'failed to parse user event', { payload });
      this.emit('parse_error', error, payload);
    }
  }

  private async refreshListenKey(): Promise<void> {
    const response = await this.restClient.postApiKey<ListenKeyResponse>('/api/v3/userDataStream');
    this.listenKey = response.data.listenKey;
    this.log('info', 'listenKey refreshed');
  }

  private scheduleKeepAlive() {
    this.clearKeepAlive();
    this.keepAliveTimer = poll(async () => {
      if (!this.listenKey) {
        return;
      }
      try {
        await this.restClient.putApiKey('/api/v3/userDataStream', { listenKey: this.listenKey });
        this.log('info', 'listenKey keepAlive success');
      } catch (error) {
        this.log('error', 'listenKey keepAlive failed', { error: (error as Error).message });
        this.options.metrics?.incrementCounter('binance_user_listenkey_keepalive_error_total', 1, this.formatLabels());
      }
    }, this.keepAliveMs);
  }

  private clearKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }
}

