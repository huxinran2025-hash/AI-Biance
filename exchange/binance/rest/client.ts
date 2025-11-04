import { createHmac } from 'node:crypto';
import { URL, URLSearchParams } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  BinanceApiResponse,
  BinanceCredentialProvider,
  BinanceRestClientOptions,
  HttpRetryOptions,
  RateLimitSnapshot,
  SignedRequestParams,
  ServerTimeResponse,
} from '../models.js';
import type { MetricLabel, MetricsRegistry } from '../monitor/metrics.js';
const HISTOGRAM_BUCKETS_MS = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
import { BinanceTimeSync } from '../time/sync.js';

type HttpMethod = 'GET' | 'POST' | 'DELETE' | 'PUT';

const DEFAULT_BASE_URL = 'https://api.binance.com';

const DEFAULT_RETRY: HttpRetryOptions = {
  retries: 5,
  backoffInitialMs: 200,
  backoffMultiplier: 2,
  backoffMaxMs: 3000,
  retryStatusCodes: [418, 429, 500, 502, 503, 504],
};

const RETRYABLE_ERROR_CODES = new Set([-1021]); // timestamp out of window

export interface RequestOptions {
  method?: HttpMethod;
  params?: SignedRequestParams;
  signed?: boolean;
  apiKey?: boolean;
}

interface RequestContext {
  path: string;
  method: HttpMethod;
  params: SignedRequestParams;
  signed: boolean;
  apiKey: boolean;
}

export class BinanceRestClient {
  private readonly baseUrl: string;
  private readonly credentialProvider: BinanceCredentialProvider;
  private readonly recvWindow: number;
  private readonly retry: HttpRetryOptions;
  private readonly fetchFn: typeof fetch;
  private readonly userAgent?: string;
  private readonly timeSync: BinanceTimeSync;
  private readonly metrics?: MetricsRegistry;
  private readonly metricsLabels?: MetricLabel;

  constructor(options: BinanceRestClientOptions & { timeSync?: BinanceTimeSync }) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.credentialProvider = options.credentialProvider;
    this.recvWindow = options.recvWindow ?? 5000;
    this.retry = { ...DEFAULT_RETRY, ...options.retry };
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.userAgent = options.userAgent;
    this.metrics = options.metrics;
    this.metricsLabels = options.metricsLabels;

    this.timeSync =
      options.timeSync ??
      new BinanceTimeSync({
        fetchServerTime: async () => this.fetchServerTime(),
        refreshIntervalMs: 30 * 60 * 1000,
      });
  }

  async getPublic<T>(path: string, params?: SignedRequestParams): Promise<BinanceApiResponse<T>> {
    return this.send<T>({ path, method: 'GET', params, signed: false, apiKey: false });
  }

  async getSigned<T>(path: string, params?: SignedRequestParams): Promise<BinanceApiResponse<T>> {
    return this.send<T>({ path, method: 'GET', params, signed: true, apiKey: true });
  }

  async postSigned<T>(path: string, params?: SignedRequestParams): Promise<BinanceApiResponse<T>> {
    return this.send<T>({ path, method: 'POST', params, signed: true, apiKey: true });
  }

  async deleteSigned<T>(path: string, params?: SignedRequestParams): Promise<BinanceApiResponse<T>> {
    return this.send<T>({ path, method: 'DELETE', params, signed: true, apiKey: true });
  }

  async putSigned<T>(path: string, params?: SignedRequestParams): Promise<BinanceApiResponse<T>> {
    return this.send<T>({ path, method: 'PUT', params, signed: true, apiKey: true });
  }

  async postApiKey<T>(path: string, params?: SignedRequestParams): Promise<BinanceApiResponse<T>> {
    return this.send<T>({ path, method: 'POST', params, signed: false, apiKey: true });
  }

  async putApiKey<T>(path: string, params?: SignedRequestParams): Promise<BinanceApiResponse<T>> {
    return this.send<T>({ path, method: 'PUT', params, signed: false, apiKey: true });
  }

  async deleteApiKey<T>(path: string, params?: SignedRequestParams): Promise<BinanceApiResponse<T>> {
    return this.send<T>({ path, method: 'DELETE', params, signed: false, apiKey: true });
  }

  private async send<T>(options: RequestOptions & { path: string }): Promise<BinanceApiResponse<T>> {
    const { retries, backoffInitialMs, backoffMultiplier, backoffMaxMs, retryStatusCodes } = this.retry;
    let attempt = 0;
    let delayMs = backoffInitialMs;
    let lastError: unknown;

    const ctx: RequestContext = {
      path: options.path,
      method: options.method ?? 'GET',
      params: options.params ?? {},
      signed: options.signed ?? false,
      apiKey: options.apiKey ?? false,
    };

    while (attempt <= retries) {
      try {
        const response = await this.dispatch<T>(ctx);
        return response;
      } catch (error: any) {
        lastError = error;

        const status = error?.status as number | undefined;
        const code = error?.responseBody?.code as number | undefined;

        const shouldRetry =
          status !== undefined && retryStatusCodes.includes(status) || (code !== undefined && RETRYABLE_ERROR_CODES.has(code));

        if (!shouldRetry || attempt === retries) {
          this.recordFailure(ctx, error);
          throw error;
        }

        if (code === -1021) {
          this.timeSync.invalidateOffset();
        }

        await sleep(Math.min(delayMs, backoffMaxMs));
        delayMs *= backoffMultiplier;
        attempt += 1;
      }
    }

    throw lastError ?? new Error('Unknown Binance REST client error');
  }

  private async dispatch<T>(ctx: RequestContext): Promise<BinanceApiResponse<T>> {
    const { path, method, params, signed, apiKey } = ctx;
    const url = new URL(path, this.baseUrl);
    const query = new URLSearchParams();
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (this.userAgent) {
      headers['User-Agent'] = this.userAgent;
    }

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      query.append(key, String(value));
    }

    if (signed || apiKey) {
      const credentials = await this.credentialProvider.getCredentials();
      headers['X-MBX-APIKEY'] = credentials.apiKey;

      if (signed) {
        await this.timeSync.ensureFreshOffset();
        const timestamp = this.timeSync.timestamp;
        query.set('timestamp', String(timestamp));

        if (!query.has('recvWindow')) {
          query.set('recvWindow', String(this.recvWindow));
        }

        const signature = this.sign(query, credentials.apiSecret);
        query.set('signature', signature);
      }
    }

    url.search = query.toString();

    const requestInit: RequestInit = {
      method,
      headers,
    };

    const startedAt = Date.now();
    const response = await this.fetchFn(url.toString(), requestInit);
    const elapsed = Date.now() - startedAt;

    const rateLimit = this.extractRateLimit(response.headers, elapsed);

    const text = await response.text();
    let body: any;
    try {
      body = text ? JSON.parse(text) : {};
    } catch (parseError) {
      body = text;
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this.credentialProvider.invalidate(`HTTP ${response.status}`);
      }

      const error: any = new Error(`Binance REST request failed with status ${response.status}`);
      error.status = response.status;
      error.responseBody = body;
      error.request = { path, method, signed, apiKey };
      this.recordFailure(ctx, error, rateLimit, elapsed);
      throw error;
    }

    const result = {
      data: body as T,
      rateLimit,
    };

    this.recordSuccess(ctx, rateLimit, elapsed, response.status);

    return result;
  }

  private sign(params: URLSearchParams, secret: string): string {
    const queryString = params.toString();
    return createHmac('sha256', secret).update(queryString).digest('hex');
  }

  private extractRateLimit(headers: Headers, responseTimeMs: number): RateLimitSnapshot | undefined {
    const usedWeight1m = headers.get('x-mbx-used-weight-1m');
    const orderCount10s = headers.get('x-mbx-order-count-10s');

    if (!usedWeight1m && !orderCount10s) {
      return {
        responseTimeMs,
      };
    }

    return {
      usedWeight1m: usedWeight1m ? Number(usedWeight1m) : undefined,
      orderCount10s: orderCount10s ? Number(orderCount10s) : undefined,
      responseTimeMs,
    };
  }

  private async fetchServerTime(): Promise<ServerTimeResponse> {
    const url = new URL('/api/v3/time', this.baseUrl);
    const response = await this.fetchFn(url.toString(), { method: 'GET' });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Failed to fetch server time: HTTP ${response.status} - ${text}`);
    }
    const body = JSON.parse(text);
    return body as ServerTimeResponse;
  }

  private recordSuccess(
    ctx: RequestContext,
    rateLimit: RateLimitSnapshot | undefined,
    elapsed: number,
    status: number,
  ): void {
    if (!this.metrics) return;
    const labels = this.mergeLabels({ method: ctx.method, path: ctx.path, status });
    this.metrics.incrementCounter('binance_http_request_total', 1, labels);
    this.metrics.observeHistogram('binance_http_latency_ms', elapsed, HISTOGRAM_BUCKETS_MS, labels);

    if (rateLimit?.usedWeight1m !== undefined) {
      this.metrics.setGauge('mbx_used_weight_1m_gauge', rateLimit.usedWeight1m, this.mergeLabels({ path: 'global' }));
    }
    if (rateLimit?.orderCount10s !== undefined) {
      this.metrics.setGauge('mbx_order_count_10s_gauge', rateLimit.orderCount10s, this.mergeLabels({ path: 'global' }));
    }
  }

  private recordFailure(
    ctx: RequestContext,
    error: any,
    rateLimit?: RateLimitSnapshot,
    elapsed?: number,
  ): void {
    if (!this.metrics) return;
    const status = error?.status ?? 'ERR';
    const code = error?.responseBody?.code ?? 'unknown';
    const labels = this.mergeLabels({ method: ctx.method, path: ctx.path, status, code });
    this.metrics.incrementCounter('binance_http_request_total', 1, labels);
    if (elapsed !== undefined) {
      this.metrics.observeHistogram('binance_http_latency_ms', elapsed, HISTOGRAM_BUCKETS_MS, labels);
    }
    if (rateLimit?.usedWeight1m !== undefined) {
      this.metrics.setGauge('mbx_used_weight_1m_gauge', rateLimit.usedWeight1m, this.mergeLabels({ path: 'global' }));
    }
  }

  private mergeLabels(extra: MetricLabel): MetricLabel {
    return { ...(this.metricsLabels ?? {}), ...extra };
  }
}

