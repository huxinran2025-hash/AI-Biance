import EventEmitter from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import WebSocket from 'ws';
import { BinanceWebSocketOptions } from './types.js';

const DEFAULT_RECONNECT = {
  initialDelayMs: 500,
  maxDelayMs: 10_000,
  multiplier: 2,
};

const DEFAULT_PING_INTERVAL = 45_000;
const DEFAULT_PONG_TIMEOUT = 10_000;

export interface WebSocketStateMetrics {
  onOpen(): void;
  onClose(code: number, reason: string): void;
  onReconnect(attempt: number, delay: number): void;
}

export abstract class BinanceWebSocket extends EventEmitter {
  protected socket: WebSocket | null = null;
  private reconnectDelay: number;
  private reconnectAttempt = 0;
  private shuttingDown = false;
  private pingTimer: NodeJS.Timeout | null = null;
  private pongTimer: NodeJS.Timeout | null = null;

  constructor(protected readonly options: BinanceWebSocketOptions) {
    super();
    const config = { ...DEFAULT_RECONNECT, ...(options.reconnect ?? {}) };
    this.reconnectDelay = config.initialDelayMs ?? DEFAULT_RECONNECT.initialDelayMs!;
  }

  protected abstract targetUrl(): Promise<string> | string;

  protected log(level: 'info' | 'warn' | 'error', message: string, extra?: Record<string, unknown>) {
    const logger = this.options.logger ?? console;
    logger[level](`[BinanceWS:${this.options.name}] ${message}` + (extra ? ` ${JSON.stringify(extra)}` : ''));
  }

  async start(): Promise<void> {
    this.shuttingDown = false;
    await this.open();
  }

  async stop(): Promise<void> {
    this.shuttingDown = true;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(1000, 'client_close');
    }
    this.cleanupTimers();
    this.socket = null;
  }

  protected async open(): Promise<void> {
    const url = await this.targetUrl();
    this.log('info', 'connecting', { url });

    const ws = new WebSocket(url);
    this.socket = ws;

    ws.on('open', () => {
      this.log('info', 'connected');
      this.reconnectAttempt = 0;
      this.reconnectDelay = this.options.reconnect?.initialDelayMs ?? DEFAULT_RECONNECT.initialDelayMs!;
      this.schedulePing();
      this.options.metrics?.setGauge('binance_ws_connected', 1, this.formatLabels({ state: 'open' }));
      this.emit('open');
    });

    ws.on('message', (raw: WebSocket.RawData) => {
      this.handleMessage(raw.toString());
    });

    ws.on('close', (code, reasonBuffer) => {
      const reason = reasonBuffer.toString();
      this.log('warn', 'closed', { code, reason });
      this.options.metrics?.setGauge('binance_ws_connected', 0, this.formatLabels({ state: 'closed', code }));
      this.emit('close', code, reason);
      this.cleanupTimers();
      if (!this.shuttingDown) {
        this.scheduleReconnect(code, reason);
      }
    });

    ws.on('error', (error) => {
      this.log('error', 'socket error', { error: (error as Error).message });
      this.options.metrics?.incrementCounter('binance_ws_error_total', 1, this.formatLabels());
      this.emit('error', error);
    });

    ws.on('pong', () => {
      this.log('info', 'pong received');
      if (this.pongTimer) {
        clearTimeout(this.pongTimer);
        this.pongTimer = null;
      }
    });
  }

  protected handleMessage(payload: string): void {
    this.emit('message', payload);
  }

  private async scheduleReconnect(code: number, reason: string) {
    if (this.shuttingDown) return;
    const cfg = { ...DEFAULT_RECONNECT, ...(this.options.reconnect ?? {}) };
    const delay = Math.min(this.reconnectDelay, cfg.maxDelayMs ?? DEFAULT_RECONNECT.maxDelayMs!);
    this.reconnectAttempt += 1;
    this.log('warn', 'reconnecting', { attempt: this.reconnectAttempt, delay });
    this.options.metrics?.incrementCounter('binance_ws_reconnect_total', 1, this.formatLabels({ code }));
    this.emit('reconnect', this.reconnectAttempt, delay, code, reason);
    await sleep(delay);
    this.reconnectDelay = Math.min(delay * (cfg.multiplier ?? DEFAULT_RECONNECT.multiplier!), cfg.maxDelayMs ?? DEFAULT_RECONNECT.maxDelayMs!);
    if (!this.shuttingDown) {
      this.options.metrics?.setGauge('binance_ws_connected', 0, this.formatLabels({ state: 'reconnecting' }));
      await this.open();
    }
  }

  private schedulePing() {
    if (this.options.pingIntervalMs === 0) {
      return;
    }
    const interval = this.options.pingIntervalMs ?? DEFAULT_PING_INTERVAL;
    this.cleanupTimers();
    this.pingTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      this.socket.ping();
      this.pongTimer = setTimeout(() => {
        this.log('warn', 'pong timeout');
        this.socket?.terminate();
        this.options.metrics?.incrementCounter('binance_ws_pong_timeout_total', 1, this.formatLabels());
      }, this.options.pongTimeoutMs ?? DEFAULT_PONG_TIMEOUT);
    }, interval);
  }

  private cleanupTimers() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  protected formatLabels(extra?: Record<string, string | number | boolean>) {
    return { ...(this.options.labels ?? {}), ...(extra ?? {}) };
  }
}

