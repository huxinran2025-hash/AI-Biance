// FIX: Add missing types from previous updates and introduce new ones for the final acceptance criteria.
export type Language = 'en' | 'zh';

// FIX: Add missing AccountMode enum.
export enum AccountMode {
  AGGRESSIVE = 'AGGRESSIVE',
  NORMAL = 'NORMAL',
  DEFENSIVE = 'DEFENSIVE',
  PANIC = 'PANIC',
}

export interface UserSessionConfig {
    leverageCap: number;
    capitalUsageLimitPct: number;
    allowedPairs: string[];
    nightSafetyMode: boolean;
    autoScaleUpCapital: boolean;
    aiModel?: string; 
    riskPolicy?: Partial<RiskPolicy>;
    executionMode?: 'paper' | 'shadow' | 'live';
}

// --- System Mode & Risk ---

export type BrakeReason = 
  | 'MANUAL' 
  | 'CRITICAL_NEWS' 
  | 'EXTERNAL_UNAVAILABLE' 
  | 'EXTERNAL_SCHEMA_CHANGED'
  | 'SELF_ABUSE_DETECTED'
  | 'CRITICAL_INTEL'
  | 'DRAWDOWN_BREACH_LEVEL1' // Added
  | 'DRAWDOWN_BREACH_LEVEL2' // Added
  | 'EXTERNAL_DOWN_TOO_LONG' // Added
  | 'PNL_OVERCONCENTRATED'
  | 'PNL_UNREALIZED_PROFIT_LOCK_REQUIRED'
  | 'EXTERNAL_EXCHANGE_RISK' // Added for exchange risk monitoring
  | 'EXPOSURE_OVER_CAP' // Added for capital usage limit enforcement
  | 'CAP_CHANGED'; // Added for capital limit parameter changes

export type SystemMode = 
  | 'NORMAL' 
  | 'PAUSED' 
  | 'REDUCE_ONLY'
  | 'COOL_DOWN_EXTERNAL_UNSAFE'
  | 'SELF_ABUSE_PROTECTION'
  | 'COOL_DOWN_CAPITAL_STRESS' // Added
  | 'EMERGENCY_LANDING'; // Added

export interface SystemStatus {
  mode: SystemMode;
  brakeSinceTs: number | null; // UTC ms timestamp
  brakeReason: BrakeReason | null;
  activeRiskClamp: AppliedRiskClamp;
}

export interface AppliedRiskClamp {
  forbidNewEntries: boolean;
  maxTotalExposurePct: number;
  maxConcurrentSymbols: number;
  modeLabel: SystemMode;
}

export type CorrelationCluster = "BTC_MAJOR" | "ALT_L1" | "MEME" | "OTHER";

// --- News & Intel ---
export type NewsCategory = 'exchange' | 'regulation' | 'stablecoin' | 'crypto' | 'macro';

export interface NewsFeed {
    id: string;
    label: string;
    rssUrl: string;
    category: NewsCategory;
    critical: boolean;
    region: 'GLOBAL' | 'US' | 'ASIA';
}

export interface StoredArticle {
    idHash: string;
    feedId: string;
    feedLabel?: string;
    title: string;
    link: string;
    publishedAt: number;
    snippet: string;
    critical: boolean;
    category: NewsCategory;
}

export type ExternalAlertSeverity = 'critical' | 'non_critical';

export type ExternalAlertTopic = 'regulator' | 'exchange' | 'macro' | 'crypto_sentiment';

export interface ExternalAlert {
    idHash: string;
    source: string;
    title: string;
    link?: string;
    publishedAt: number;
    severity: ExternalAlertSeverity;
    topic: ExternalAlertTopic;
    summary: string;
}

export interface RssEvent extends ExternalAlert {
    feedId: string;
    feedLabel?: string;
    snippet?: string;
}

export type RiskSeverity = "NORMAL" | "ELEVATED" | "CRITICAL";

export type RiskSummary = Partial<Record<NewsCategory, string[]>>;

export interface RiskSignalsSnapshot {
    summary: RiskSummary;
    criticalArticles: StoredArticle[];
    blacklist_symbols: string[];
    overall_severity: RiskSeverity;
    generatedAt: string; // ISO String
}

// --- External Watcher ---
export interface MarketRegimeHint {
  available: boolean;
  environmentAdvisory: 'TRENDING_GO_WITH_IT' | 'CHAOTIC_COOL_DOWN' | 'NEUTRAL' | null;
  disagreementLevel: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  confidence: number; // 0-1
  sourceMeta: {
    status: 'ok' | 'parse_error' | 'unreachable';
    lastGoodTs: number; // UTC ms timestamp
    reason?: 'HTTP_404' | 'Timeout' | 'SchemaChanged' | 'ExchangeRisk';
    checksum?: string;
  };
}

// --- Self Review Coach ---
export interface ClosedTrade {
  symbol: string;
  side: 'LONG' | 'SHORT';
  pnlUsd: number;
  pnlPct: number;
  openTs: number; // UTC ms
  closeTs: number; // UTC ms
  durationMinutes: number;
  maxLeverage: number;
  entryReason: string;
  closeReason: string;
  attributedModel: InternalModelId;
}

export type ReviewWindow = '24h' | '3d' | '7d' | 'all';

export interface SelfReviewWindowStats {
  window: ReviewWindow;
  realizedPnLUsd: number;
  unrealizedPnLUsd: number;
  maxDrawdownPct: number;
  winRatePct: number;
  avgHoldingTimeMinutes: number;
  longVsShortBias: {
    longPct: number;
    shortPct: number;
  };
  churnRate: number;
  overexposureFlags: string[];
  tradeCount: number;
}

export interface BehaviorDiagnostics {
  panicTrading: boolean;
  revengeTrading: boolean;
  overconcentration: boolean;
  overtrading: boolean;
  profitConcentrationHigh: boolean; // Added
  unrealizedProfitHigh: boolean; // Added
}

export interface SelfDisciplineState {
  lastReviewTs: number;
  windows: SelfReviewWindowStats[];
  diagnostics: BehaviorDiagnostics;
  perModelStats: Record<InternalModelId, SelfReviewWindowStats[]>;
}

export interface ModelPositionSnapshot {
  symbol: string;
  side: 'LONG' | 'SHORT';
  leverage: number;
  notionalUsd: number;
  unrealizedPnl: number;
  profitTarget?: number;
  stopLoss?: number;
  invalidationCondition?: string;
  riskManagement?: PositionRiskManagement;
}

export interface ModelSelfReviewSnapshot {
  ts: number;
  model: InternalModelId;
  accountValueUsd: number;
  availableCashUsd: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  exposureUsd: number;
  leverageNow: number;
  comment: string;
  sharpe?: number;
  exitDisciplineNote?: string;
  positions: ModelPositionSnapshot[];
  systemMode: SystemMode;
}

export interface ModelSelfReviewSummary {
  snapshot: ModelSelfReviewSnapshot;
  summaryText: string;
}

export interface AccountRiskLimits {
  minCashRatio: number;
  maxMarginUsage: number;
  maxAccountLeverage: number;
  maxAccountDrawdownPct: number;
}

export interface AccountRiskState {
  cooldownActive: boolean;
  cooldownReason?: 'SEVERE_DRAWDOWN' | 'INSUFFICIENT_CASH_BUFFER' | 'MARGIN_LIMIT' | 'LEVERAGE_LIMIT' | 'EXTERNAL_ALERT';
  triggeredTs?: number;
  metrics: {
    cashRatio: number;
    marginUsage: number;
    accountLeverage: number;
    drawdownPct: number;
  };
  externalAlerts?: ExternalAlert[];
}

export interface ModelDecisionSnapshot {
  model: InternalModelId;
  symbol: string;
  stance: 'LONG' | 'SHORT' | 'FLAT';
  confidence: number;
  leverage: number;
  notionalUsd: number;
}

export interface DisagreementSignal {
  ts: number;
  symbol: string;
  involvedModels: InternalModelId[];
  severity: 'MODERATE' | 'HIGH';
  confidence: number;
}

// --- Trading & Account ---
export interface Position {
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    size: number;
    leverage: number;
    unrealizedPnl: number;
    liquidationPrice?: number;
    notionalUsd: number;
    stopLoss?: number;
    takeProfit?: number;
    invalidationCondition?: string;
    riskManagement?: PositionRiskManagement;
}

export interface TakeProfitTrailingConfig {
  activated: boolean;
  triggerReturnPct: number;
  scaledOutPct: number;
  lastTriggeredTs?: number;
}

export interface DynamicStopConfig {
  activated: boolean;
  newStopLoss?: number;
  lastAdjustedTs?: number;
}

export interface PositionRiskManagement {
  takeProfitTrailing: TakeProfitTrailingConfig;
  dynamicStop: DynamicStopConfig;
  manualOverrides?: string[];
}

export type PositionAdjustment =
  | {
      kind: 'scale_out';
      symbol: string;
      reduceRatio: number;
      realizedPnlUsd: number;
      reason: string;
      newStopLoss?: number;
    }
  | {
      kind: 'stop_loss_update';
      symbol: string;
      newStopLoss: number;
      reason: string;
    }
  | {
      kind: 'stop_exit';
      symbol: string;
      exitPrice: number;
      realizedPnlUsd: number;
      reason: string;
    };

export interface AccountState {
    totalCapital: number;
    availableCapital: number;
    currentLeverage: number;
    openPositions: Position[];
    closedTrades: ClosedTrade[];
    equityPeakUsd: number; // Added
    equityNowUsd: number; // Added
    externalAlerts?: ExternalAlert[];
}

export interface MarketTicker {
    price: number;
    volume24h: number;
    quoteVolume24h?: number;
    tradeCount24h?: number;
    priceChange24h: number;
    lastPrice?: number;
    openPrice?: number;
    highPrice24h?: number;
    lowPrice24h?: number;
    bestBid?: number;
    bestAsk?: number;
    eventTime?: number;
    updatedAt?: number;
}

export type MarketData = Record<string, MarketTicker>;

// --- K-line Analysis ---
export interface KlineData {
  time: number; // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface KlineSnapshot {
  symbol: string;
  interval: string;
  timestamp: number;
  klines: KlineData[]; // 最近200根
  indicators: {
    ma20: number;
    ma50: number;
    rsi: number;
    macd: { macd: number; signal: number; histogram: number };
    bollingerBands: { upper: number; middle: number; lower: number };
  };
  marketState: {
    trend: 'uptrend' | 'downtrend' | 'sideways';
    volatility: 'high' | 'medium' | 'low';
    support: number[];
    resistance: number[];
  };
}

// --- AI Council & Decisions ---
export type InternalModelId = 'model_A' | 'model_B' | 'model_C';

export interface TradeProposal {
    model: InternalModelId;
    symbol: string;
    action: 'buy_to_enter' | 'sell_to_enter' | 'hold' | 'close_position';
    leverage: number;
    notionalUsd: number;
    reasonFromModel: string;
    confidence: number;
    stopLoss?: number;
    takeProfit?: number;
    invalidationCondition?: string;
}

export interface TradeDecision {
    action: 'BUY' | 'SELL' | 'HOLD' | 'CLOSE';
    symbol: string;
    leverage?: number;
    positionSizePct?: number;
    reasoning: string;
    source: string;
}

export interface RiskManagerDecision {
    masterRiskScore: number;
    reason: string;
}

export type AIModelId = 'gemini-2.5-pro' | 'deepseek-reasoner' | 'gpt-5';

export interface UserAIConfig {
  momentum_model: AIModelId;
  risk_model: AIModelId;
  position_model: AIModelId;
  updatedAt: number;
}

// --- Final Acceptance Criteria Types ---

export interface SafetySnapshotBundle {
  ts: number;
  newMode: SystemMode;
  triggerReason: BrakeReason | 'RECOVERY';
  externalContext?: MarketRegimeHint;
  selfReviewContext?: SelfDisciplineState;
  appliedRiskClamp: AppliedRiskClamp;
  currentPortfolioSnapshot: Array<{
    symbol: string;
    side: 'LONG' | 'SHORT';
    leverage: number;
    notionalUsd: number;
    unrealizedPnlUsd: number;
  }>;
  noteToHuman: string;
  drawdownPct?: number; // Added
  externalFeedDownForMs?: number; // Added
}

export interface ShadowLedgerEntry {
  ts: number;
  model: InternalModelId;
  pair: string;
  action: 'buy_to_enter' | 'sell_to_enter' | 'hold' | 'close_position' | 'forbidden_by_riskClamp';
  leverage: number;
  notionalUsd: number;
  reasonFromModel: string;
  blockedBy?: SystemMode | 'DrawdownGuard' | 'StrategistConsensus'; // Expanded
  snapshotMode: SystemMode;
}

export type DecisionAuthority = 'StrategistConsensus' | 'RiskClamp' | 'DrawdownGuard' | 'ManualOverride' | 'ExternalSignalFreeze';

export interface TradeAttribution {
  ts: number;
  symbol: string;
  finalAction: 'enter_long' | 'enter_short' | 'close' | 'hold' | 'no_trade';
  contributingModels: Array<{
    model: InternalModelId;
    stance: 'bullish' | 'bearish' | 'flat' | 'forbid';
    confidence: number;
  }>;
  mergedOutcome: 'approved' | 'blocked_conflict' | 'blocked_riskClamp';
  decisionAuthority: DecisionAuthority; // Added
  reasonFinal: string; // Added
}

export interface DecisionAuthorityBreakdownItem {
    authority: DecisionAuthority;
    count: number;
}

export type ModelHealthStatus = 'TRUSTED' | 'UNDER_REVIEW' | 'RESTRICT';

export interface ModelHealth {
    model: InternalModelId;
    status: ModelHealthStatus;
    notes: string;
}

export interface DailyCouncilReport {
    date: string; // YYYY-MM-DD
    blockedTradeStats: Record<string, { count: number; byModel: Record<InternalModelId, number> }>;
    opportunityCostUsd: number;
    savedLossUsd: number;
    topBlockedProposals: ShadowLedgerEntry[];
    decisionAuthorityBreakdown: DecisionAuthorityBreakdownItem[];
    modelHealth: ModelHealth[];
}


// --- Logging ---
export interface SimpleLogEntry {
    timestamp: number;
    type: 'INFO' | 'WARN' | 'ERROR' | 'STRATEGY';
    message: string;
    details?: any;
}

export interface TradeLogEntry {
  timestamp: number;
  type: 'TRADE';
  message: string;
  details: TradeDecision;
}

export interface SystemModeChangeLogEntry {
  timestamp: number;
  type: 'SYSTEM_MODE_CHANGE';
  message: string;
  details: SafetySnapshotBundle;
}

export interface AttributionLogEntry {
  timestamp: number;
  type: 'ATTRIBUTION';
  message: string;
  details: TradeAttribution;
}

export interface PromptLogEntry {
  timestamp: number;
  type: 'PROMPT';
  message: string;
  details: {
    sessionId?: string;
    model?: string;
    modelLabel?: string;
    executionMode?: 'paper' | 'shadow' | 'live';
    systemPrompt?: string;
    userPrompt?: string;
    context?: any;
  };
}

export type LogEntry = SimpleLogEntry | TradeLogEntry | SystemModeChangeLogEntry | AttributionLogEntry | PromptLogEntry;


// --- Exchange Risk Monitoring ---
export type ExchangeStatus = 
  | 'ok' 
  | 'degraded' 
  | 'withdrawal_suspended' 
  | 'trading_halted' 
  | 'regulatory_action'
  | 'unreachable';

export interface ExchangeHealthSnapshot {
    ts: number;
    exchange: string; // source ID (binance, usdt, usdc, solana, etc.)
    status: ExchangeStatus;
    lastGoodTs: number;
    details: string;
    critical: boolean;
}

export interface ExchangeRiskEvent {
    ts: number;
    sourceId: string;
    triggerReason: 'EXTERNAL_EXCHANGE_RISK';
    recommendedMode: 'COOL_DOWN_EXTERNAL_UNSAFE' | 'EMERGENCY_LANDING' | 'REDUCE_ONLY';
    details: string;
    severity: 'ELEVATED' | 'CRITICAL';
}

// --- Account Synchronization ---
export interface BalanceInfo {
    asset: string;
    free: number;
    locked: number;
}

export interface PositionInfo {
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryPrice: number;
    size: number;
    leverage: number;
    notionalUsd: number;
    unrealizedPnl: number;
}

export interface ExternalTradeInfo {
    ts: number;
    symbol: string;
    side: 'LONG' | 'SHORT';
    size: number;
    entryPrice: number;
    notionalUsd: number;
    source: 'external_manual' | 'external_api' | 'external_web';
}

export interface ReconcileResult {
    // 只返回"素材"，不返回equity（equity由refreshAccountSnapshot统一计算）
    cashUsd: number;                // 可用现金
    positionsUnrealizedUsd: number; // 未实现盈亏（聚合）
    positionsNotionalUsd: number;   // 持仓名义规模
    maintenanceMarginUsd?: number; // 维持保证金（可选）
    balances: BalanceInfo[];
    positions: PositionInfo[];
    externalTrades: ExternalTradeInfo[];
}

export type AccountSyncEventType = 'ACCOUNT_RECONCILED' | 'BALANCE_CHANGED' | 'POSITION_CHANGED';

export interface AccountSyncEvent {
    ts: number;
    type: AccountSyncEventType;
    details: {
        equityUsd: number;
        positionCount?: number;
        balanceCount?: number;
        changeReason?: string;
    };
}

// --- Full Backend State for UI ---
export interface DashboardState {
    account: AccountState;
    market: MarketData;
    systemStatus: SystemStatus;
    logs: LogEntry[];
    marketRegime: MarketRegimeHint;
    disciplineState: SelfDisciplineState;
    dailyReport?: DailyCouncilReport; // Added
    exchangeHealth?: {
        overallRisk: 'ok' | 'degraded' | 'critical';
        criticalIssues: ExchangeHealthSnapshot[];
        allSources: ExchangeHealthSnapshot[];
        lastCheckTs: number;
    }; // Added for exchange risk monitoring
    riskLimits?: AccountRiskLimits;
    accountRiskState?: AccountRiskState;
    selfReviewFeed?: Partial<Record<InternalModelId, ModelSelfReviewSummary>>;
    volatilitySignals?: DisagreementSignal[];
    recentExternalAlerts?: ExternalAlert[];
    lastStrategySnapshot?: StrategySnapshot;
    riskNews?: StoredArticle[]; // Added for UI display
    lastDecision?: TradeAttribution | null; // Added for UI display
    session?: SessionState;
    lastUpdated: number; // UTC ms
}

export interface RiskPolicy {
  maxTotalRiskUsd: number;
  maxPositionRiskUsd: number;
  maxLeverage: number;
  allowedSymbols: string[];
  lockProfitAfterRoiPct: number;
}

// UI-specific types
export type RightDrawerSection = 'AI_DECISION' | 'COMMITTEE_CONFIG' | 'RISK_MODE';

export interface SessionState {
  sid: string;
  status: 'RUNNING' | 'PAUSED' | 'STOPPED' | 'ERROR';
  startedAt: number;
  lastTickAt: number;
  tradeEnabled: boolean;
  executionEngineStatus?: 'initializing' | 'ready' | 'failed' | 'mock_fallback';
}

export interface MarketSnapshotEntry {
  price: number;
  ema20?: number;
  rsi7?: number;
  macd?: number;
  fundingRate?: number;
  openInterest?: number;
}

export type MarketSnapshot = Record<string, MarketSnapshotEntry>;

export interface StrategySnapshot {
  market: MarketSnapshot;
  account: AccountState;
  riskPolicy: RiskPolicy;
  externalAlerts: ExternalAlert[];
  timestamp: number;
}