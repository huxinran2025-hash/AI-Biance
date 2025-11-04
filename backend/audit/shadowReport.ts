import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { ShadowAuditEntry } from '../../exchange/binance/execution/shadowAuditor.js';

export interface ShadowReportOptions {
  inputPath?: string;
  outputDir?: string;
  date?: string; // YYYY-MM-DD (UTC)
}

export interface ShadowReportSummary {
  date: string;
  totalTrades: number;
  avgPriceSlipBps: number | null;
  p95PriceSlipBps: number | null;
  avgFillRatioDiff: number | null;
  bySymbol: Record<string, ShadowSymbolSummary>;
}

export interface ShadowSymbolSummary {
  trades: number;
  avgPriceSlipBps: number | null;
  p95PriceSlipBps: number | null;
  avgFillRatioDiff: number | null;
}

const DEFAULT_INPUT = path.resolve(process.cwd(), 'logs/shadow-audit.jsonl');
const DEFAULT_OUTPUT = path.resolve(process.cwd(), 'reports/shadow');

export async function generateShadowReport(options: ShadowReportOptions = {}): Promise<ShadowReportSummary | null> {
  const inputPath = options.inputPath ?? DEFAULT_INPUT;
  const outputDir = options.outputDir ?? DEFAULT_OUTPUT;
  if (!existsSync(inputPath)) {
    return null;
  }

  const date = options.date ?? formatDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const start = new Date(date + 'T00:00:00Z').getTime();
  const end = new Date(date + 'T23:59:59.999Z').getTime();

  const rl = readline.createInterface({
    input: createReadStream(inputPath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  const slips: number[] = [];
  let fillDiffSum = 0;
  let count = 0;
  const bySymbol: Record<string, { slips: number[]; fillDiffSum: number; count: number }> = {};

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as ShadowAuditEntry;
      if (entry.ts < start || entry.ts > end) continue;
      count += 1;
      if (entry.priceSlipBps !== null && entry.priceSlipBps !== undefined) {
        slips.push(Math.abs(entry.priceSlipBps));
      }
      if (!Number.isNaN(entry.fillRatioDiff)) {
        fillDiffSum += entry.fillRatioDiff;
      }

      const key = `${entry.symbol}::${entry.strategyId ?? 'default'}`;
      let bucket = bySymbol[key];
      if (!bucket) {
        bucket = { slips: [], fillDiffSum: 0, count: 0 };
        bySymbol[key] = bucket;
      }
      bucket.count += 1;
      if (entry.priceSlipBps !== null && entry.priceSlipBps !== undefined) {
        bucket.slips.push(Math.abs(entry.priceSlipBps));
      }
      if (!Number.isNaN(entry.fillRatioDiff)) {
        bucket.fillDiffSum += entry.fillRatioDiff;
      }
    } catch (error) {
      // ignore malformed lines
    }
  }

  if (count === 0) {
    return null;
  }

  const summary: ShadowReportSummary = {
    date,
    totalTrades: count,
    avgPriceSlipBps: slips.length ? average(slips) : null,
    p95PriceSlipBps: slips.length ? percentile(slips, 0.95) : null,
    avgFillRatioDiff: count ? fillDiffSum / count : null,
    bySymbol: Object.fromEntries(
      Object.entries(bySymbol).map(([key, bucket]) => {
        const [symbol, strategyId] = key.split('::');
        const stats: ShadowSymbolSummary = {
          trades: bucket.count,
          avgPriceSlipBps: bucket.slips.length ? average(bucket.slips) : null,
          p95PriceSlipBps: bucket.slips.length ? percentile(bucket.slips, 0.95) : null,
          avgFillRatioDiff: bucket.count ? bucket.fillDiffSum / bucket.count : null,
        };
        return [`${symbol}::${strategyId}`, stats];
      }),
    ),
  };

  await mkdir(outputDir, { recursive: true });
  const jsonPath = path.resolve(outputDir, `${date}.json`);
  await writeFile(jsonPath, JSON.stringify(summary, null, 2));

  const csvPath = path.resolve(outputDir, `${date}.csv`);
  const csvLines = ['symbol,strategyId,trades,avgPriceSlipBps,p95PriceSlipBps,avgFillRatioDiff'];
  for (const [key, stats] of Object.entries(summary.bySymbol)) {
    const [symbol, strategyId] = key.split('::');
    csvLines.push(
      [
        symbol,
        strategyId,
        stats.trades,
        stats.avgPriceSlipBps ?? '',
        stats.p95PriceSlipBps ?? '',
        stats.avgFillRatioDiff ?? '',
      ].join(','),
    );
  }
  await writeFile(csvPath, csvLines.join('\n'));

  return summary;
}

export class ShadowReportScheduler {
  private readonly options: ShadowReportOptions;
  private timer: NodeJS.Timeout | null = null;

  constructor(options: ShadowReportOptions = {}) {
    this.options = options;
  }

  start(intervalMs = 24 * 60 * 60 * 1000): void {
    if (this.timer) return;
    const run = async () => {
      try {
        await generateShadowReport(this.options);
      } catch (error) {
        console.error('[ShadowReportScheduler] failed to generate report', error);
      }
    };
    void run();
    this.timer = setInterval(run, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

function average(values: number[]): number {
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p)));
  return sorted[idx];
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


