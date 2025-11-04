import { BinanceSecretProvider } from '../../config/binance-secret-provider.js';
import { loadWhitelist } from '../../config/binance-whitelist.js';
import { loadRiskConfig } from '../../config/binance-risk-config.js';
import { loadPaperConfig } from '../../config/paper-config.js';
import { BinanceRestClient } from './rest/index.js';
import { ExchangeInfoCache } from './cache/index.js';
import { AccountSnapshotBuilder } from './account/index.js';
import { NominalRiskEngine } from './risk/index.js';
import { IdempotentOrderRouter } from './order/index.js';
import { ExecutionEngine } from './execution/index.js';
import { BinanceTimeSync } from './time/sync.js';
import { MetricsRegistry } from './monitor/index.js';
import { MarketStream, UserDataStream } from './ws/index.js';
import { PaperEngine } from './paper/index.js';
import { ExecutionMode } from './models.js';
import { ShadowAuditor } from './execution/shadowAuditor.js';
import { OrderStore } from '../../backend/orders/orderStore.js';
import { ShadowReportScheduler } from '../../backend/audit/shadowReport.js';
import { startMetricsServer } from '../../monitoring/prometheus.js';

export interface BinanceBootstrapOptions {
  whitelistPath?: string;
  riskConfigPath?: string;
}

export async function bootstrapBinance(options: BinanceBootstrapOptions = {}) {
  const credentialProvider = new BinanceSecretProvider();
  const riskConfig = await loadRiskConfig(options.riskConfigPath);
  const whitelist = await loadWhitelist(options.whitelistPath);
  const paperConfig = await loadPaperConfig();

  const initEquityEnv = process.env.PAPER_INIT_EQUITY;
  const defaultPortfolioEnv = process.env.PAPER_PORTFOLIO_ID;
  if (initEquityEnv) {
    const parsed = Number(initEquityEnv);
    if (!Number.isNaN(parsed) && parsed > 0) {
      paperConfig.defaultEquity = parsed;
      if (defaultPortfolioEnv) {
        paperConfig.portfolioEquities = {
          ...(paperConfig.portfolioEquities ?? {}),
          [defaultPortfolioEnv]: parsed,
        };
      }
    }
  }

  const metrics = new MetricsRegistry();
  const orderStore = await OrderStore.create();

  const restClient = new BinanceRestClient({
    credentialProvider,
    recvWindow: 5000,
    userAgent: 'Biance-Spot-Client/1.0',
    retry: {
      retries: 5,
      backoffInitialMs: 200,
      backoffMultiplier: 2,
      backoffMaxMs: 3000,
    },
    metrics,
    metricsLabels: { service: 'binance-spot' },
  });

  const timeSync = new BinanceTimeSync({
    fetchServerTime: async () => {
      const { data } = await restClient.getPublic('/api/v3/time');
      return data as { serverTime: number };
    },
    refreshIntervalMs: 30 * 60 * 1000,
  });

  const exchangeCache = new ExchangeInfoCache({ restClient });
  await exchangeCache.ensureFresh();

  const accountSnapshots = new AccountSnapshotBuilder();
  const riskEngine = new NominalRiskEngine({
    filtersProvider: exchangeCache,
    riskConfig,
    whitelist,
    metrics,
  });

  const router = new IdempotentOrderRouter({
    api: restClient,
  });

  const paperEngine = new PaperEngine(paperConfig);
  const tradeMode = normalizeTradeMode(process.env.TRADE_MODE);
  const defaultPortfolioId = defaultPortfolioEnv ?? 'paper-default';
  const shadowAuditor = new ShadowAuditor({
    metrics,
    outputPath: process.env.SHADOW_AUDIT_PATH,
  });
  const shadowAuditPath = process.env.SHADOW_AUDIT_PATH;
  const shadowReportDir = process.env.SHADOW_REPORT_DIR;

  if (!shadowAuditPath || !shadowReportDir) {
    console.warn('[Bootstrap] SHADOW_AUDIT_PATH or SHADOW_REPORT_DIR not set. Shadow reports will be disabled.');
  }

  const shadowReportScheduler = new ShadowReportScheduler({
    inputPath: shadowAuditPath,
    outputDir: shadowReportDir,
  });

  if (shadowAuditPath && shadowReportDir) {
    shadowReportScheduler.start();
  }

  const executionEngine = new ExecutionEngine({
    riskEngine,
    router,
    paperEngine,
    mode: tradeMode,
    defaultPortfolioId,
    accountSnapshotBuilder: accountSnapshots,
    shadowAuditor,
    orderStore,
    metrics,
  });

  let metricsServer: ReturnType<typeof startMetricsServer> | undefined;
  if (process.env.DISABLE_METRICS !== '1') {
    const metricsPort = Number(process.env.METRICS_PORT ?? 9464);
    const metricsHost = process.env.METRICS_HOST ?? '0.0.0.0';
    metricsServer = startMetricsServer({
      registry: metrics,
      port: metricsPort,
      host: metricsHost,
    });
  }

  const marketStream = new MarketStream({
    streams: ['btcusdt@bookTicker'],
    ws: {
      metrics,
      labels: { service: 'binance-spot' },
      logger: console,
    },
  });

  const userStream = new UserDataStream({
    restClient,
    ws: {
      metrics,
      labels: { service: 'binance-spot' },
      logger: console,
    },
  });

  return {
    restClient,
    timeSync,
    exchangeCache,
    accountSnapshots,
    riskEngine,
    router,
    executionEngine,
    shadowAuditor,
    shadowReportScheduler,
    orderStore,
    paperEngine,
    tradeMode,
    metrics,
    metricsServer,
    streams: {
      market: marketStream,
      user: userStream,
    },
  };
}

function normalizeTradeMode(value: string | undefined): ExecutionMode {
  if (!value) return 'paper';
  const lowered = value.toLowerCase();
  if (lowered === 'live' || lowered === 'shadow' || lowered === 'paper') {
    return lowered;
  }
  return 'paper';
}

