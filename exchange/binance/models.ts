import type { MetricLabel, MetricsRegistry } from './monitor/metrics.js';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'MARKET';
export type TimeInForce = 'GTC' | 'IOC' | 'FOK';

export interface SymbolFilters {
  symbol: string;
  tickSize: string;
  stepSize: string;
  minNotional: string;
  minQty: string;
  maxPrice?: string;
  minPrice?: string;
}

export interface ExchangeSymbolMeta extends SymbolFilters {
  baseAsset: string;
  quoteAsset: string;
  status: string;
}

export interface PlaceOrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity?: string;
  quoteOrderQty?: string;
  price?: string;
  timeInForce?: TimeInForce;
  newClientOrderId?: string;
  recvWindow?: number;
}

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
  /** UTC epoch millis when the credential expires. null/undefined means no expiration. */
  expiresAt?: number | null;
  /** Source identifier for observability (e.g. `kms`, `env`). */
  source?: string;
}

export type RiskTierKey = 'T1' | 'T2' | 'T3' | (string & {});

export interface RiskTierConfig {
  maxLeverage: number;
  perOrderCapPct: number;
  symbolCapPct: number;
  dailyTurnoverCapPct?: number;
}

export interface SlippageConfig {
  buy: number;
  sell: number;
  panic: number;
}

export type RiskMode = 'NORMAL' | 'COOL_DOWN' | 'EMERGENCY';

export interface RiskConfig {
  accountMaxExposurePct: number;
  coolDownWeight: number;
  emergencyFlattenAll: boolean;
  tiers: Record<RiskTierKey, RiskTierConfig>;
  slippageBps: SlippageConfig;
  fallbackMarketIfMinNotionalBlocked: boolean;
  priceBandPct: number;
}

export interface RiskSnapshot {
  netWorth: number;
  totalExposure: number;
  availableExposure: number;
  symbolExposure: Record<string, number>;
  mode: RiskMode;
  tier: RiskTierKey;
}

export interface BinanceAccountBalance {
  asset: string;
  free: number;
  locked: number;
}

export interface AccountSnapshot {
  balances: BinanceAccountBalance[];
  netWorth: number;
  totalExposure: number;
  symbolExposure: Record<string, number>;
  timestamp: number;
}

export interface MarketQuote {
  symbol: string;
  bestBid: number;
  bestAsk: number;
  lastPrice?: number;
  updatedAt: number;
}

export interface NominalOrderSignal {
  symbol: string;
  side: OrderSide;
  tier: RiskTierKey;
  targetLeverage: number;
  targetNominal?: number;
  confidence?: number;
  allowMarket?: boolean;
  maxSlippageBps?: number;
  clientOrderId?: string;
  timeInForce?: TimeInForce;
  portfolioId?: string;
  strategyId?: string;
}

export interface PreparedOrder {
  request: PlaceOrderRequest;
  price: number;
  quantity: number;
  nominal: number;
  reason?: string;
}

export interface RiskEvaluationResult {
  accepted: boolean;
  reason?: string;
  preparedOrder?: PreparedOrder;
  snapshot: RiskSnapshot;
}

export interface BinanceCredentialProvider {
  /**
   * Resolve the current API credentials. Providers should cache and reuse the
   * secret until it is close to expiration.
   */
  getCredentials(): Promise<BinanceCredentials>;

  /**
   * Invalidate any cached credentials (e.g. upon auth failure) so they will be
   * reloaded on the next request.
   */
  invalidate(reason?: string): void;
}

export interface RateLimitSnapshot {
  usedWeight1m?: number;
  orderCount10s?: number;
  responseTimeMs?: number;
}

export interface HttpRetryOptions {
  retries: number;
  backoffInitialMs: number;
  backoffMultiplier: number;
  backoffMaxMs: number;
  retryStatusCodes: number[];
}

export interface BinanceRestClientOptions {
  baseUrl?: string;
  credentialProvider: BinanceCredentialProvider;
  recvWindow?: number;
  userAgent?: string;
  retry?: Partial<HttpRetryOptions>;
  /** Inject custom fetch implementation, useful for testing. */
  fetchFn?: typeof fetch;
  metrics?: MetricsRegistry;
  metricsLabels?: MetricLabel;
}

export interface SignedRequestParams {
  [key: string]: string | number | boolean | undefined;
}

export interface BinanceApiResponse<T> {
  data: T;
  rateLimit?: RateLimitSnapshot;
}

export interface ServerTimeResponse {
  serverTime: number;
}

export type ExecutionMode = 'paper' | 'shadow' | 'live';

export interface PaperPosition {
  symbol: string;
  quantity: number;
  averagePrice: number;
  markPrice?: number;
  updatedAt: number;
}

export interface PaperAccountState {
  portfolioId: string;
  baseCurrency: string;
  cash: number;
  equity: number;
  exposure: number;
  realizedPnl: number;
  unrealizedPnl: number;
  feesPaid: number;
  positions: Record<string, PaperPosition>;
  updatedAt: number;
}

export interface PaperExecutionContext {
  mode: ExecutionMode;
  portfolioId: string;
  signal: NominalOrderSignal;
  quote?: MarketQuote;
}

export interface PaperFill {
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  fee: number;
  timestamp: number;
  mode: ExecutionMode;
  portfolioId: string;
  reason?: string;
}

export interface PaperExecutionResult {
  status: 'FILLED' | 'PARTIAL' | 'REJECTED';
  fill?: PaperFill;
  rejectionReason?: string;
  account: PaperAccountState;
}

