import { randomUUID } from 'node:crypto';
import { IdempotentOrderRouter } from '../order/index.js';
import { NominalRiskEngine } from '../risk/index.js';
import { PaperEngine } from '../paper/index.js';
import { AccountSnapshotBuilder } from '../account/index.js';
import { ShadowAuditor } from './shadowAuditor.js';
import {
  NominalOrderSignal,
  PreparedOrder,
  RiskEvaluationResult,
  RiskSnapshot,
  ExecutionMode,
  PaperExecutionResult,
  PaperAccountState,
} from '../models.js';
import { RiskEngineContext } from '../risk/engine.js';
import type { MetricsRegistry } from '../monitor/metrics.js';
import type { OrderStore } from '../../../backend/orders/orderStore.js';

export interface ExecutionEngineOptions {
  riskEngine: NominalRiskEngine;
  router: IdempotentOrderRouter;
  paperEngine?: PaperEngine;
  mode?: ExecutionMode;
  defaultPortfolioId?: string;
  accountSnapshotBuilder?: AccountSnapshotBuilder;
  shadowAuditor?: ShadowAuditor;
  orderStore?: OrderStore;
  onAccepted?: (result: RiskEvaluationResult) => Promise<void> | void;
  onRejected?: (result: RiskEvaluationResult) => Promise<void> | void;
  onExecuted?: (prepared: PreparedOrder, response: unknown, snapshot: RiskSnapshot) => Promise<void> | void;
  metrics?: MetricsRegistry;
}

export class ExecutionEngine {
  private readonly riskEngine: NominalRiskEngine;
  private readonly router: IdempotentOrderRouter;
  private readonly paperEngine?: PaperEngine;
  private readonly accountSnapshotBuilder?: AccountSnapshotBuilder;
  private readonly shadowAuditor?: ShadowAuditor;
  private readonly orderStore?: OrderStore;
  private readonly onAccepted?: ExecutionEngineOptions['onAccepted'];
  private readonly onRejected?: ExecutionEngineOptions['onRejected'];
  private readonly onExecuted?: ExecutionEngineOptions['onExecuted'];
  private readonly metrics?: MetricsRegistry;
  private readonly defaultPortfolioId: string;
  private mode: ExecutionMode;

  constructor({
    riskEngine,
    router,
    paperEngine,
    mode,
    defaultPortfolioId,
    accountSnapshotBuilder,
    shadowAuditor,
    orderStore,
    onAccepted,
    onRejected,
    onExecuted,
    metrics,
  }: ExecutionEngineOptions) {
    this.riskEngine = riskEngine;
    this.router = router;
    this.paperEngine = paperEngine;
    this.accountSnapshotBuilder = accountSnapshotBuilder;
    this.shadowAuditor = shadowAuditor;
    this.orderStore = orderStore;
    this.onAccepted = onAccepted;
    this.onRejected = onRejected;
    this.onExecuted = onExecuted;
    this.metrics = metrics;
    this.mode = mode ?? 'paper';
    this.defaultPortfolioId = defaultPortfolioId ?? process.env.PAPER_PORTFOLIO_ID ?? 'paper-default';
  }

  setMode(mode: ExecutionMode): void {
    this.mode = mode;
  }

  getMode(): ExecutionMode {
    return this.mode;
  }

  async process(signal: NominalOrderSignal, ctx: RiskEngineContext): Promise<RiskEvaluationResult> {
    const evaluation = this.riskEngine.evaluate(signal, ctx);

    if (!evaluation.accepted || !evaluation.preparedOrder) {
      await this.onRejected?.(evaluation);
      this.metrics?.incrementCounter('order_execution_total', 1, {
        symbol: signal.symbol,
        result: 'rejected',
      });
      return evaluation;
    }

    await this.onAccepted?.(evaluation);

    const prepared = evaluation.preparedOrder;
    const quote = ctx.quotes.get(signal.symbol);
    const mode = this.mode;
    const portfolioId = signal.portfolioId ?? this.defaultPortfolioId;
    const baseOrderId = this.resolveOrderId(prepared, mode);

    await this.ensureOrderRecord(baseOrderId, prepared, signal, mode, portfolioId);

    if (mode === 'paper') {
      if (!this.paperEngine) {
        throw new Error('PaperEngine not configured for paper mode');
      }
      const paperResult = await this.paperEngine.execute({
        prepared,
        signal,
        quote,
        mode: 'paper',
        riskSnapshot: evaluation.snapshot,
        portfolioId,
      });
      this.afterPaperExecution(paperResult.account, mode, signal);
      await this.recordPaperFill(baseOrderId, paperResult, prepared, mode);
      await this.onExecuted?.(prepared, { paper: paperResult }, evaluation.snapshot);
      return evaluation;
    }

    if (mode === 'shadow') {
      let paperResult: PaperExecutionResult | undefined;
      if (this.paperEngine) {
        paperResult = await this.paperEngine.execute({
          prepared,
          signal,
          quote,
          mode: 'shadow',
          riskSnapshot: evaluation.snapshot,
          portfolioId,
        });
        if (paperResult) {
          this.afterPaperExecution(paperResult.account, mode, signal);
          await this.recordPaperFill(baseOrderId, paperResult, prepared, mode);
        }
      }

      const liveResponse = await this.executeLive(prepared, signal.symbol);
      await this.onExecuted?.(prepared, { live: liveResponse, paper: paperResult }, evaluation.snapshot);
      const auditEntry = await this.shadowAuditor?.record({
        prepared,
        signal,
        paper: paperResult,
        live: liveResponse,
        portfolioId,
      });
      if (auditEntry) {
        await this.orderStore?.recordAudit({
          realOrderId: auditEntry.liveOrderId ?? undefined,
          paperOrderId: auditEntry.paperOrderId ?? baseOrderId,
          symbol: prepared.request.symbol,
          strategyId: signal.strategyId ?? undefined,
          priceSlipBps: auditEntry.priceSlipBps ?? undefined,
          fillRatioDiff: auditEntry.fillRatioDiff ?? undefined,
          latencyMs: auditEntry.latencyMs ?? undefined,
          ts: auditEntry.ts,
        });
      }
      await this.recordLiveOutcome(baseOrderId, liveResponse, prepared, signal, mode);
      return evaluation;
    }

    const liveResponse = await this.executeLive(prepared, signal.symbol);
    await this.onExecuted?.(prepared, liveResponse, evaluation.snapshot);
    await this.recordLiveOutcome(baseOrderId, liveResponse, prepared, signal, 'live');

    return evaluation;
  }

  private afterPaperExecution(account: PaperAccountState, mode: ExecutionMode, signal: NominalOrderSignal): void {
    this.metrics?.incrementCounter('order_execution_total', 1, {
      symbol: signal.symbol,
      result: mode,
    });
    this.accountSnapshotBuilder?.updateFromPaper(account);
    this.recordPaperMetrics(account, mode, signal);
  }

  private recordPaperMetrics(account: PaperAccountState, mode: ExecutionMode, signal: NominalOrderSignal): void {
    const portfolioId = account.portfolioId;
    const strategyId = signal.strategyId ?? 'default';
    const exposurePct = account.equity > 0 ? (account.exposure / account.equity) * 100 : 0;

    this.metrics?.incrementCounter('paper_trades_total', 1, {
      mode,
      symbol: signal.symbol,
      side: signal.side,
      strategyId,
    });

    this.metrics?.setGauge('paper_pnl_realized_usd_total', account.realizedPnl, {
      portfolioId,
    });
    this.metrics?.setGauge('paper_pnl_unrealized_usd', account.unrealizedPnl, {
      portfolioId,
    });
    this.metrics?.setGauge('paper_equity_usd', account.equity, {
      portfolioId,
    });
    this.metrics?.setGauge('paper_exposure_usd', account.exposure, {
      portfolioId,
    });
    this.metrics?.setGauge('exposure_pct_gauge', exposurePct, {
      mode,
    });
    void this.orderStore?.recordSnapshot({
      ts: Date.now(),
      portfolioId,
      equity: account.equity,
      exposurePct,
      pnlRealized: account.realizedPnl,
    });
  }

  private async executeLive(prepared: PreparedOrder, symbol: string): Promise<unknown> {
    try {
      this.accountSnapshotBuilder?.clearPaper();
      const response = await this.router.place(prepared);
      this.metrics?.incrementCounter('order_execution_total', 1, {
        symbol,
        result: 'live',
      });
      return response;
    } catch (error) {
      this.metrics?.incrementCounter('order_execution_total', 1, {
        symbol,
        result: 'live_error',
      });
      throw error;
    }
  }

  private async ensureOrderRecord(
    orderId: string,
    prepared: PreparedOrder,
    signal: NominalOrderSignal,
    mode: ExecutionMode,
    portfolioId: string,
  ): Promise<void> {
    const qty = Number(prepared.request.quantity ?? prepared.quantity ?? 0);
    await this.orderStore?.recordNewOrder({
      id: orderId,
      clientOrderId: prepared.request.newClientOrderId ?? null,
      symbol: prepared.request.symbol,
      side: prepared.request.side,
      type: prepared.request.type,
      price: this.parseNumber(prepared.request.price ?? prepared.price),
      qty,
      source: this.mapSource(mode),
      portfolioId,
      strategyId: signal.strategyId ?? null,
    });
  }

  private async recordPaperFill(
    orderId: string,
    result: PaperExecutionResult,
    prepared: PreparedOrder,
    mode: ExecutionMode,
  ): Promise<void> {
    if (!result.fill) {
      if (result.status === 'REJECTED') {
        await this.orderStore?.recordEvent({ type: 'REJECTED', id: orderId, reason: result.rejectionReason ?? 'PAPER_REJECT', ts: Date.now() });
      }
      return;
    }
    await this.orderStore?.recordFill({
      orderId,
      mode,
      price: result.fill.price,
      qty: result.fill.quantity,
      fee: result.fill.fee,
      ts: result.fill.timestamp,
    });
    await this.orderStore?.recordEvent({ type: 'FILLED', id: orderId, ts: result.fill.timestamp });
  }

  private async recordLiveOutcome(
    orderId: string,
    response: any,
    prepared: PreparedOrder,
    signal: NominalOrderSignal,
    mode: ExecutionMode,
  ): Promise<void> {
    if (!this.orderStore) return;
    const info = normalizeLiveResponse(response, prepared, signal);
    if (!info) return;

    if (info.createdAt) {
      await this.orderStore.recordEvent({ type: 'NEW', id: orderId, clientOrderId: info.clientOrderId ?? null, qty: info.qty ?? 0, price: info.price ?? null, ts: info.createdAt, source: this.mapSource(mode) });
    }

    if (info.fill) {
      await this.orderStore.recordFill({
        orderId,
        mode: 'live',
        price: info.fill.price,
        qty: info.fill.qty,
        fee: info.fill.fee,
        ts: info.fill.ts,
      });
    }

    if (info.status === 'FILLED') {
      await this.orderStore.recordEvent({ type: 'FILLED', id: orderId, ts: info.updatedAt });
    } else if (info.status === 'PARTIAL') {
      await this.orderStore.recordEvent({ type: 'PARTIAL', id: orderId, filled: info.fill?.qty ?? 0, ts: info.updatedAt });
    } else if (info.status === 'CANCELED') {
      await this.orderStore.recordEvent({ type: 'CANCELED', id: orderId, reason: info.reason ?? 'CANCELED', ts: info.updatedAt });
    } else if (info.status === 'REJECTED') {
      await this.orderStore.recordEvent({ type: 'REJECTED', id: orderId, reason: info.reason ?? 'REJECTED', ts: info.updatedAt });
    }
  }

  private mapSource(mode: ExecutionMode): 'paper' | 'live' | 'shadow' {
    if (mode === 'live') return 'live';
    if (mode === 'shadow') return 'shadow';
    return 'paper';
  }

  private resolveOrderId(prepared: PreparedOrder, mode: ExecutionMode): string {
    if (prepared.request.newClientOrderId) {
      return prepared.request.newClientOrderId;
    }
    return `${mode}-${randomUUID()}`;
  }

  private parseNumber(value: unknown): number | null {
    if (value === undefined || value === null) return null;
    const num = typeof value === 'string' ? Number(value) : (value as number);
    return Number.isFinite(num) ? num : null;
  }
}

interface LiveFillInfo {
  price: number;
  qty: number;
  fee?: number;
  ts: number;
}

interface LiveResponseInfo {
  status: 'FILLED' | 'PARTIAL' | 'CANCELED' | 'REJECTED' | 'NEW';
  createdAt?: number;
  updatedAt: number;
  qty?: number;
  price?: number | null;
  fill?: LiveFillInfo;
  clientOrderId?: string | null;
  reason?: string | null;
}

function normalizeLiveResponse(response: any, prepared: PreparedOrder, signal: NominalOrderSignal): LiveResponseInfo | null {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const now = Date.now();
  const qty = Number(response.executedQty ?? response.cummulativeQty ?? 0);
  const price = Number(response.avgPrice ?? response.price ?? prepared.price ?? 0);
  const statusRaw: string = response.status ?? 'FILLED';
  const status = mapLiveStatus(statusRaw, qty, Number(prepared.request.quantity ?? prepared.quantity ?? 0));
  const fill: LiveFillInfo | undefined = qty > 0 && Number.isFinite(price)
    ? { price, qty, fee: Number(response.fills?.[0]?.commission ?? 0), ts: now }
    : undefined;

  return {
    status,
    createdAt: now,
    updatedAt: now,
    qty,
    price,
    fill,
    clientOrderId: response.clientOrderId ?? response.origClientOrderId ?? prepared.request.newClientOrderId ?? null,
    reason: response.status ?? null,
  };
}

function mapLiveStatus(status: string, executedQty: number, qtyExpected: number): LiveResponseInfo['status'] {
  const upper = (status ?? '').toUpperCase();
  if (upper === 'CANCELED' || upper === 'CANCELLED') return 'CANCELED';
  if (upper === 'REJECTED') return 'REJECTED';
  if (upper === 'PARTIALLY_FILLED') return 'PARTIAL';
  if (upper === 'NEW') return 'NEW';
  if (qtyExpected > 0 && executedQty < qtyExpected) {
    return executedQty > 0 ? 'PARTIAL' : 'NEW';
  }
  return 'FILLED';
}

