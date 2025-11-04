import {
  AccountSnapshot,
  MarketQuote,
  NominalOrderSignal,
  PreparedOrder,
  RiskConfig,
  RiskEvaluationResult,
  RiskMode,
  RiskSnapshot,
  RiskTierKey,
  SymbolFilters,
} from '../models.js';
import type { MetricsRegistry } from '../monitor/metrics.js';
import { alignToStep, clamp, ensureMinNotional, withinPriceBand, toFixedWithStep } from './utils.js';

export interface RiskEngineDependencies {
  filtersProvider: {
    getFilters(symbol: string): SymbolFilters | undefined;
  };
  riskConfig: RiskConfig;
  whitelist: Map<string, RiskTierKey>;
  metrics?: MetricsRegistry;
}

export interface RiskEngineContext {
  account: AccountSnapshot;
  quotes: Map<string, MarketQuote>;
  mode: RiskMode;
  tierOverride?: RiskTierKey;
  cooldownWeight?: number;
}

export class NominalRiskEngine {
  private readonly filtersProvider: RiskEngineDependencies['filtersProvider'];
  private readonly riskConfig: RiskConfig;
  private readonly whitelist: Map<string, RiskTierKey>;
  private readonly metrics?: MetricsRegistry;

  constructor({ filtersProvider, riskConfig, whitelist, metrics }: RiskEngineDependencies) {
    this.filtersProvider = filtersProvider;
    this.riskConfig = riskConfig;
    this.whitelist = whitelist;
    this.metrics = metrics;
  }

  evaluate(signal: NominalOrderSignal, ctx: RiskEngineContext): RiskEvaluationResult {
    const tier = ctx.tierOverride ?? this.whitelist.get(signal.symbol);
    if (!tier) {
      return this.reject('WHITE_LIST_BLOCK', signal, ctx);
    }

    const filters = this.filtersProvider.getFilters(signal.symbol);
    if (!filters) {
      return this.reject('MISSING_FILTERS', signal, ctx);
    }

    const quote = ctx.quotes.get(signal.symbol);
    if (!quote) {
      return this.reject('NO_MARKET_DATA', signal, ctx);
    }

    const tierCfg = this.riskConfig.tiers[tier];
    if (!tierCfg) {
      return this.reject('TIER_NOT_CONFIGURED', signal, ctx);
    }

    const mode = ctx.mode;
    const coolWeight = ctx.cooldownWeight ?? (mode === 'COOL_DOWN' ? this.riskConfig.coolDownWeight : 1);
    if (mode === 'EMERGENCY') {
      return this.reject('RISK_MODE_EMERGENCY', signal, ctx);
    }

    const netWorth = ctx.account.netWorth;
    const totalExposure = ctx.account.totalExposure;
    const symbolExposure = ctx.account.symbolExposure[signal.symbol] ?? 0;

    const remainingAccountCap = this.riskConfig.accountMaxExposurePct * netWorth - totalExposure;
    const remainingSymbolCap = tierCfg.symbolCapPct * netWorth - symbolExposure;

    const leverage = Math.min(signal.targetLeverage, tierCfg.maxLeverage);
    const baseBudget = signal.targetNominal ?? netWorth * leverage * coolWeight;
    let budget = Math.min(baseBudget, remainingAccountCap, remainingSymbolCap);

    const perOrderCap = tierCfg.perOrderCapPct * netWorth;
    budget = Math.min(budget, perOrderCap);

    if (budget <= 0) {
      return this.reject('NO_BUDGET', signal, ctx);
    }

    const slippageBps = signal.maxSlippageBps ?? this.riskConfig.slippageBps[signal.side === 'BUY' ? 'buy' : 'sell'];
    const reference = quote.lastPrice ?? (quote.bestBid + quote.bestAsk) / 2;
    const slipFactor = slippageBps / 10_000;
    const price = signal.side === 'BUY' ? quote.bestAsk * (1 + slipFactor) : quote.bestBid * (1 - slipFactor);

    if (!withinPriceBand(price, reference, this.riskConfig.priceBandPct)) {
      return this.reject('PRICE_BAND', signal, ctx);
    }

    const qtyRaw = budget / price;
    const qty = alignToStep(qtyRaw, Number(filters.stepSize));
    const notional = price * qty;

    if (!ensureMinNotional(price, qty, Number(filters.minNotional))) {
      if (this.riskConfig.fallbackMarketIfMinNotionalBlocked && signal.allowMarket) {
        // fallback to market: reuse qtyRaw with step alignment at current best
        const marketQty = alignToStep(qtyRaw, Number(filters.stepSize));
        if (!ensureMinNotional(reference, marketQty, Number(filters.minNotional))) {
          return this.reject('MIN_NOTIONAL', signal, ctx);
        }

        const request = {
          symbol: signal.symbol,
          side: signal.side,
          type: 'MARKET' as const,
          quantity: toFixedWithStep(marketQty, Number(filters.stepSize)),
          newClientOrderId: signal.clientOrderId,
        };

        return this.accept(signal, ctx, {
          request,
          price: reference,
          quantity: marketQty,
          nominal: reference * marketQty,
          reason: 'FALLBACK_MARKET',
        });
      }

      return this.reject('MIN_NOTIONAL', signal, ctx);
    }

    const finalQty = qty;
    const nominal = notional;
    const exposureAfter = totalExposure + nominal;
    if (exposureAfter > this.riskConfig.accountMaxExposurePct * netWorth + 1e-8) {
      const available = this.riskConfig.accountMaxExposurePct * netWorth - totalExposure;
      if (available <= 0) {
        return this.reject('ACCOUNT_CAP', signal, ctx);
      }
      const adjustedQty = alignToStep(available / price, Number(filters.stepSize));
      if (adjustedQty <= 0) {
        return this.reject('ACCOUNT_CAP', signal, ctx);
      }
      const adjustedNotional = adjustedQty * price;
      if (adjustedNotional < Number(filters.minNotional)) {
        return this.reject('ACCOUNT_CAP', signal, ctx);
      }

      return this.accept(signal, ctx, {
        request: this.buildLimitRequest(signal, filters, price, adjustedQty),
        price,
        quantity: adjustedQty,
        nominal: adjustedNotional,
        reason: 'ACCOUNT_CAP_LIMITED',
      });
    }

    return this.accept(signal, ctx, {
      request: this.buildLimitRequest(signal, filters, price, finalQty),
      price,
      quantity: finalQty,
      nominal,
    });
  }

  private buildLimitRequest(signal: NominalOrderSignal, filters: SymbolFilters, price: number, qty: number) {
    const priceFormatted = toFixedWithStep(price, Number(filters.tickSize));
    const qtyFormatted = toFixedWithStep(qty, Number(filters.stepSize));
    return {
      symbol: signal.symbol,
      side: signal.side,
      type: 'LIMIT' as const,
      price: priceFormatted,
      quantity: qtyFormatted,
      timeInForce: signal.timeInForce ?? 'IOC',
      newClientOrderId: signal.clientOrderId,
    };
  }

  private accept(signal: NominalOrderSignal, ctx: RiskEngineContext, prepared: PreparedOrder): RiskEvaluationResult {
    const snapshot = this.snapshot(signal, ctx, prepared.nominal);
    this.metrics?.incrementCounter('order_submit_total', 1, {
      symbol: signal.symbol,
      type: prepared.request.type,
      result: 'accepted',
    });
    this.metrics?.setGauge('risk_account_exposure_pct',
      snapshot.totalExposure / Math.max(snapshot.netWorth, 1e-8) * 100,
      { mode: snapshot.mode },
    );
    this.metrics?.setGauge('risk_symbol_exposure_pct',
      snapshot.symbolExposure[signal.symbol] / Math.max(snapshot.netWorth, 1e-8) * 100,
      { symbol: signal.symbol },
    );
    return {
      accepted: true,
      preparedOrder: prepared,
      snapshot,
    };
  }

  private reject(reason: string, signal: NominalOrderSignal, ctx: RiskEngineContext): RiskEvaluationResult {
    const snapshot = this.snapshot(signal, ctx, 0);
    this.metrics?.incrementCounter('order_submit_total', 1, {
      symbol: signal.symbol,
      type: 'NA',
      result: 'rejected',
    });
    this.metrics?.incrementCounter('risk_block_total', 1, {
      reason,
      symbol: signal.symbol,
    });
    return {
      accepted: false,
      reason,
      snapshot,
    };
  }

  private snapshot(signal: NominalOrderSignal, ctx: RiskEngineContext, deltaExposure: number): RiskSnapshot {
    const tier = ctx.tierOverride ?? this.whitelist.get(signal.symbol) ?? 'UNKNOWN';
    const totalExposure = ctx.account.totalExposure + deltaExposure;
    return {
      netWorth: ctx.account.netWorth,
      totalExposure,
      availableExposure: this.riskConfig.accountMaxExposurePct * ctx.account.netWorth - totalExposure,
      symbolExposure: {
        ...ctx.account.symbolExposure,
        [signal.symbol]: (ctx.account.symbolExposure[signal.symbol] ?? 0) + deltaExposure,
      },
      mode: ctx.mode,
      tier,
    };
  }
}

