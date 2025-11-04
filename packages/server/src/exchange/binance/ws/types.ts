import type { MetricsRegistry } from '../monitor/metrics.js';

export interface WebSocketMetricsContext {
  metrics?: MetricsRegistry;
  labels?: Record<string, string | number | boolean>;
}

export interface WebSocketReconnectOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  multiplier?: number;
}

export interface BinanceWebSocketOptions extends WebSocketMetricsContext {
  name: string;
  reconnect?: WebSocketReconnectOptions;
  pingIntervalMs?: number;
  pongTimeoutMs?: number;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface MarketStreamMessage<T = unknown> {
  stream: string;
  data: T;
}

export interface ListenKeyResponse {
  listenKey: string;
}

