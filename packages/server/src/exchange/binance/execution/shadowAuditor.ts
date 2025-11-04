import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { PreparedOrder, NominalOrderSignal, PaperExecutionResult } from '../models.js';
import type { MetricsRegistry } from '../monitor/metrics.js';

const DEFAULT_OUTPUT = resolve(process.cwd(), 'logs/shadow-audit.jsonl');
const SHADOW_BUCKETS = [1, 2, 5, 10, 20, 50];

export interface ShadowAuditorOptions {
  metrics?: MetricsRegistry;
  outputPath?: string;
}

export interface ShadowAuditRecord {
  prepared: PreparedOrder;
  signal: NominalOrderSignal;
  paper?: PaperExecutionResult;
  live: unknown;
  portfolioId: string;
}

export interface ShadowAuditEntry {
  ts: number;
  symbol: string;
  side: string;
  strategyId: string | null;
  portfolioId: string;
  paperOrderId: string | null;
  liveOrderId: string | null;
  liveClientOrderId: string | null;
  paperFillPrice: number | null | undefined;
  liveFillPrice: number | null;
  paperFillQty: number;
  liveFillQty: number;
  priceSlipBps: number | null;
  fillRatioDiff: number;
  expectedQty: number;
}

export class ShadowAuditor {
  private readonly metrics?: MetricsRegistry;
  private readonly outputPath: string;
  private readonly ready: Promise<void>;

  constructor({ metrics, outputPath }: ShadowAuditorOptions = {}) {
    this.metrics = metrics;
    this.outputPath = outputPath ?? DEFAULT_OUTPUT;
    this.ready = mkdir(dirname(this.outputPath), { recursive: true })
      .then(() => undefined)
      .catch(() => undefined);
  }

  async record(record: ShadowAuditRecord): Promise<ShadowAuditEntry | null> {
    const { prepared, signal, paper, live, portfolioId } = record;
    const expectedQty = Number(prepared.quantity ?? 0);
    const paperFillQty = Number(paper?.fill?.quantity ?? 0);
    const paperFillPrice = paper?.fill?.price;
    const liveFill = parseLiveFill(live);
    const liveIds = parseLiveIds(live);

    const livePrice = liveFill?.price;
    const liveQty = liveFill?.quantity ?? 0;

    let priceSlipBps: number | null = null;
    if (paperFillPrice && livePrice) {
      priceSlipBps = ((livePrice - paperFillPrice) / paperFillPrice) * 10_000;
      this.metrics?.observeHistogram(
        'shadow_diff_price_bps_histogram',
        Math.abs(priceSlipBps),
        SHADOW_BUCKETS,
        {
          symbol: prepared.request.symbol,
          strategyId: signal.strategyId ?? 'default',
        },
      );
    }

    const paperFillRatio = expectedQty > 0 ? paperFillQty / expectedQty : 0;
    const liveFillRatio = expectedQty > 0 ? liveQty / expectedQty : 0;
    const fillRatioDiff = liveFillRatio - paperFillRatio;

    const entry: ShadowAuditEntry = {
      ts: Date.now(),
      symbol: prepared.request.symbol,
      side: prepared.request.side,
      strategyId: signal.strategyId ?? null,
      portfolioId,
      paperOrderId: prepared.request.newClientOrderId ?? null,
      liveOrderId: liveIds.orderId,
      liveClientOrderId: liveIds.clientOrderId,
      paperFillPrice,
      liveFillPrice: livePrice ?? null,
      paperFillQty,
      liveFillQty: liveQty,
      priceSlipBps,
      fillRatioDiff,
      expectedQty,
      latencyMs: null,
    };

    await this.ready;
    await appendFile(this.outputPath, JSON.stringify(entry) + '\n').catch(() => {});
    return entry;
  }
}

interface LiveFill {
  price?: number;
  quantity?: number;
}

function parseLiveFill(live: unknown): LiveFill | undefined {
  if (!live || typeof live !== 'object') {
    return undefined;
  }

  const obj = live as Record<string, unknown>;

  if (Array.isArray(obj.fills) && obj.fills.length > 0) {
    let totalQty = 0;
    let totalValue = 0;
    for (const fill of obj.fills as any[]) {
      const qty = Number(fill.qty ?? fill.quantity ?? 0);
      const price = Number(fill.price ?? 0);
      if (Number.isFinite(qty) && Number.isFinite(price)) {
        totalQty += qty;
        totalValue += price * qty;
      }
    }
    if (totalQty > 0 && totalValue > 0) {
      return {
        quantity: totalQty,
        price: totalValue / totalQty,
      };
    }
  }

  const executedQty = Number(obj.executedQty ?? obj.origQty ?? obj.cummulativeQty ?? 0);
  const avgPrice = Number(obj.avgPrice ?? obj.price ?? obj.stopPrice ?? 0);
  if (Number.isFinite(executedQty) && executedQty > 0 && Number.isFinite(avgPrice) && avgPrice > 0) {
    return {
      quantity: executedQty,
      price: avgPrice,
    };
  }

  return undefined;
}

function parseLiveIds(live: unknown): { orderId: string | null; clientOrderId: string | null } {
  if (!live || typeof live !== 'object') {
    return { orderId: null, clientOrderId: null };
  }
  const obj = live as Record<string, unknown>;
  const orderId = obj.orderId ?? obj.orderID ?? obj.id;
  const clientOrderId = obj.clientOrderId ?? obj.origClientOrderId ?? obj.clientId;
  return {
    orderId: serializeId(orderId),
    clientOrderId: serializeId(clientOrderId),
  };
}

function serializeId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value.toString();
  return null;
}

