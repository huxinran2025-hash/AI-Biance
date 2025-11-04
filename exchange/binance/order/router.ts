import { BinanceRestClient } from '../rest/index.js';
import { PlaceOrderRequest, PreparedOrder } from '../models.js';

export interface OrderRouterOptions {
  api: BinanceRestClient;
  /**
   * Optional callback invoked once the order has been submitted (or retrieved
   * from Binance upon retry). Useful for logging and auditing.
   */
  onSubmit?: (prepared: PreparedOrder, response: unknown) => Promise<void> | void;
  /**
   * Optional callback for rejections (after retries). Allows centralised
   * logging/metrics without coupling to risk engine.
   */
  onError?: (prepared: PreparedOrder, error: unknown) => Promise<void> | void;
}

export class IdempotentOrderRouter {
  private readonly api: BinanceRestClient;
  private readonly onSubmit?: OrderRouterOptions['onSubmit'];
  private readonly onError?: OrderRouterOptions['onError'];

  constructor({ api, onSubmit, onError }: OrderRouterOptions) {
    this.api = api;
    this.onSubmit = onSubmit;
    this.onError = onError;
  }

  async place(prepared: PreparedOrder): Promise<unknown> {
    try {
      const response = await this.api.postSigned('/api/v3/order', this.serialize(prepared.request));
      await this.onSubmit?.(prepared, response.data);
      return response.data;
    } catch (error: any) {
      if (this.shouldRetryLookup(error) && prepared.request.newClientOrderId) {
        try {
          const existing = await this.lookupExisting(prepared.request.symbol, prepared.request.newClientOrderId);
          await this.onSubmit?.(prepared, existing);
          return existing;
        } catch (lookupErr) {
          await this.onError?.(prepared, lookupErr);
          throw lookupErr;
        }
      }

      await this.onError?.(prepared, error);
      throw error;
    }
  }

  private shouldRetryLookup(error: any): boolean {
    const status = error?.status as number | undefined;
    if (status && status >= 500) {
      return true;
    }
    const code = error?.responseBody?.code as number | undefined;
    return code === -1001 || code === -1021 || code === -1013;
  }

  private async lookupExisting(symbol: string, clientOrderId: string): Promise<unknown> {
    const { data } = await this.api.getSigned('/api/v3/order', {
      symbol,
      origClientOrderId: clientOrderId,
    });
    return data;
  }

  private serialize(request: PlaceOrderRequest): Record<string, string> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(request)) {
      if (value === undefined || value === null) continue;
      params[key] = String(value);
    }
    return params;
  }
}


