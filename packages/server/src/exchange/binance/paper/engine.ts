import { randomUUID } from 'node:crypto';
import {
  ExecutionMode,
  MarketQuote,
  PaperAccountState,
  PaperExecutionResult,
  PaperFill,
  PreparedOrder,
} from '../models.js';
import { PaperLedger } from './ledger.js';
import { PaperEngineOptions, PaperExecutionEvent, PaperExecutionInput } from './types.js';

const DEFAULT_OPTIONS: PaperEngineOptions = {
  baseCurrency: 'USDT',
  defaultEquity: 10_000,
  portfolioEquities: {},
  makerFeeBps: 0.1,
  takerFeeBps: 0.1,
  buySlippageBps: 10,
  sellSlippageBps: 12,
  latencyMs: 80,
  fokAsIoc: true,
  netting: 'avg',
};

export class PaperEngine {
  private readonly options: PaperEngineOptions;
  private readonly ledger: PaperLedger;

  constructor(options?: Partial<PaperEngineOptions>) {
    const base: PaperEngineOptions = {
      ...DEFAULT_OPTIONS,
      ...(options ?? {}),
    };
    if (options?.portfolioEquities) {
      base.portfolioEquities = {
        ...(DEFAULT_OPTIONS.portfolioEquities ?? {}),
        ...options.portfolioEquities,
      };
    }
    this.options = base;
    this.ledger = new PaperLedger(this.options);
  }

  async execute(input: PaperExecutionInput): Promise<PaperExecutionResult> {
    const portfolioId = input.portfolioId ?? input.signal.portfolioId ?? 'default';
    const mode: ExecutionMode = input.mode;
    const prepared = input.prepared;
    const signal = input.signal;
    const quote = input.quote;

    const result = this.processOrder({ prepared, mode, quote, portfolioId });

    const event: PaperExecutionEvent = {
      id: prepared.request.newClientOrderId ?? randomUUID(),
      timestamp: Date.now(),
      mode,
      portfolioId,
      prepared,
      signal,
      quote,
      riskSnapshot: input.riskSnapshot,
      result,
      metadata: input.metadata,
    };

    this.ledger.appendEvent(portfolioId, event);
    return result;
  }

  getAccount(portfolioId = 'default'): PaperAccountState {
    return this.ledger.snapshot(portfolioId);
  }

  getEvents(portfolioId = 'default'): PaperExecutionEvent[] {
    return this.ledger.getEvents(portfolioId);
  }

  private processOrder(params: {
    prepared: PreparedOrder;
    mode: ExecutionMode;
    quote?: MarketQuote;
    portfolioId: string;
  }): PaperExecutionResult {
    const { prepared, mode, quote, portfolioId } = params;
    const quantity = prepared.quantity;
    if (!quantity || quantity <= 0) {
      return {
        status: 'REJECTED',
        rejectionReason: 'INVALID_QUANTITY',
        account: this.ledger.snapshot(portfolioId),
      };
    }

    const side = prepared.request.side;
    const execPrice = this.determineFillPrice(prepared, quote);
    if (execPrice === undefined) {
      return {
        status: 'REJECTED',
        rejectionReason: 'NOT_FILLED',
        account: this.ledger.snapshot(portfolioId),
      };
    }

    const feeRate = this.options.takerFeeBps / 10_000;
    const fee = execPrice * quantity * feeRate;
    const fill: PaperFill = {
      symbol: prepared.request.symbol,
      side,
      quantity,
      price: execPrice,
      fee,
      timestamp: Date.now(),
      mode,
      portfolioId,
      reason: prepared.reason,
    };

    const accountState = this.ledger.applyFill(portfolioId, fill, quote);
    return {
      status: 'FILLED',
      fill,
      account: accountState,
    };
  }

  private determineFillPrice(prepared: PreparedOrder, quote?: MarketQuote): number | undefined {
    const side = prepared.request.side;
    const type = prepared.request.type;
    const basePrice = quote ? this.referencePrice(side, quote) : prepared.price;
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return undefined;
    }

    const slippageBps = side === 'BUY' ? this.options.buySlippageBps : this.options.sellSlippageBps;
    const slipFactor = slippageBps / 10_000;

    if (type === 'MARKET') {
      return side === 'BUY' ? basePrice * (1 + slipFactor) : basePrice * (1 - slipFactor);
    }

    const limitPrice = this.parsePrice(prepared.request.price ?? prepared.price);
    if (!limitPrice) {
      return undefined;
    }

    // IOC: only fill if price crosses the book
    if (side === 'BUY') {
      const ask = quote?.bestAsk ?? limitPrice;
      if (limitPrice < ask) {
        return undefined;
      }
      const executed = Math.min(limitPrice, ask * (1 + slipFactor));
      return executed;
    }

    const bid = quote?.bestBid ?? limitPrice;
    if (limitPrice > bid) {
      return undefined;
    }
    const executed = Math.max(limitPrice, bid * (1 - slipFactor));
    return executed;
  }

  private referencePrice(side: 'BUY' | 'SELL', quote: MarketQuote): number {
    if (side === 'BUY') {
      return quote.bestAsk || quote.lastPrice || (quote.bestBid + quote.bestAsk) / 2;
    }
    return quote.bestBid || quote.lastPrice || (quote.bestBid + quote.bestAsk) / 2;
  }

  private parsePrice(price: number | string | undefined): number | undefined {
    if (price === undefined) return undefined;
    const parsed = typeof price === 'string' ? Number(price) : price;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
}

