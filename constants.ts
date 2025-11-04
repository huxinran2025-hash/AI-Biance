import { AccountMode, CorrelationCluster, UserSessionConfig } from './types';
import symbolWhitelist from './config/symbol-whitelist.json';

export const SYMBOL_WHITELIST: string[] = symbolWhitelist.allowedPairs;

export const AVAILABLE_PAIRS = SYMBOL_WHITELIST;

export const DEFAULT_SESSION_CONFIG: UserSessionConfig = {
    leverageCap: 10,
    capitalUsageLimitPct: 30,
    allowedPairs: SYMBOL_WHITELIST,
    nightSafetyMode: true,
    autoScaleUpCapital: false,
    riskPolicy: {
        maxTotalRiskUsd: 5000,
        maxPositionRiskUsd: 1200,
        maxLeverage: 20,
        allowedSymbols: SYMBOL_WHITELIST,
        lockProfitAfterRoiPct: 5,
    },
    executionMode: 'paper',
};

// 1. 代理层必须从公共 corsproxy.io 换成你自己的 Cloudflare Worker
// 硬性要求：恢复我们自己的 Cloudflare Worker
export const CORS_PROXY = 'https://winter-bush-23d5.huxinran2025.workers.dev/fetch?url=';

export const RSS_BACKEND_URL = process.env.RSS_BACKEND_URL || 'https://biance-backend-495185885743.asia-east1.run.app';

export const SYSTEM_TIMINGS = {
    // 高频Tick (2秒) - UI更新、持仓盈亏计算
    FREQUENT_TICK_MS: 2000,
    BACKEND_TICK_MS: 2000, // 兼容旧代码，等同于FREQUENT_TICK_MS
    
    // 中频Tick (10秒) - 账户同步、市场数据更新
    MEDIUM_TICK_MS: 10000,
    ACCOUNT_SYNC_INTERVAL: 10000, // 账户同步间隔（对齐中频Tick）
    
    // 低频Tick (30秒) - 新闻、风险监控
    LOW_TICK_MS: 30000,
    NEWS_POLL_MS: 60000, // 新闻轮询（1分钟）
    EXCHANGE_RISK_POLL_MS: 30000, // 风险监控（30秒）
    
    // AI决策配置
    AI_DECISION_MIN_INTERVAL: 15000, // AI决策最小间隔（15秒）
    AI_DECISION_FALLBACK: 30000, // AI决策兜底间隔（30秒）
    
    // K线Tick配置
    KLINE_MIN_INTERVAL: 600000, // K线最小间隔（10分钟）
    
    // 前端轮询
    DASHBOARD_REFRESH_MS: 2000,
    DASHBOARD_POLL_MS: 2000, // Same as DASHBOARD_REFRESH_MS, for compatibility
    
    // 兼容旧代码
    STRATEGIST_REFRESH_MS: 10 * 1000, // 已废弃，使用AI_DECISION_MIN_INTERVAL
    SESSION_TICK_MS: 2000, // 已废弃，使用FREQUENT_TICK_MS
};

export const MINIMUM_TRADE_NOTIONAL_USD = 10;

// --- New Constants from User Request ---

export const CORRELATION_CLUSTERS: Record<string, CorrelationCluster> = {
    "BTCUSDT": "BTC_MAJOR",
    "ETHUSDT": "ALT_L1",
    "BNBUSDT": "ALT_L1",
    "SOLUSDT": "ALT_L1",
    "OPUSDT": "OTHER",
    "SUIUSDT": "ALT_L1",
    "XRPUSDT": "ALT_L1",
    "DOGEUSDT": "MEME",
    "ADAUSDT": "ALT_L1",
    "ATOMUSDT": "ALT_L1",
    "AVAXUSDT": "ALT_L1",
    "NEARUSDT": "ALT_L1",
    "INJUSDT": "OTHER",
    "ARBUSDT": "OTHER",
    "APTUSDT": "ALT_L1",
    "LINKUSDT": "OTHER",
    "DOTUSDT": "OTHER",
    "FILUSDT": "OTHER",
    "TRXUSDT": "ALT_L1",
};

export const RISK_POLICY_BY_MODE: Record<AccountMode, {
    maxSymbolsOpen: number;
    maxLeveragePerNewPosition: number;
    allowNewPositions: boolean;
    profitLockInRatio: number; // % of profit to lock into baseCapital
}> = {
  [AccountMode.AGGRESSIVE]: {
    maxSymbolsOpen: 4,
    maxLeveragePerNewPosition: 10,
    allowNewPositions: true,
    profitLockInRatio: 0.25,
  },
  [AccountMode.NORMAL]: {
    maxSymbolsOpen: 3,
    maxLeveragePerNewPosition: 6,
    allowNewPositions: true,
    profitLockInRatio: 0.40,
  },
  [AccountMode.DEFENSIVE]: {
    maxSymbolsOpen: 2,
    maxLeveragePerNewPosition: 3,
    allowNewPositions: true, 
    profitLockInRatio: 0.60,
  },
  [AccountMode.PANIC]: {
    maxSymbolsOpen: 1, // Will only hold existing, not open new ones
    maxLeveragePerNewPosition: 1,
    allowNewPositions: false,
    profitLockInRatio: 1.0,
  }
};

export const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes for demo

export const CONSENSUS_GATE = {
    MIN_MODELS: 2,
    MIN_CONFIDENCE: 0.65,
};

export const HIGH_IMPACT_SYMBOLS: string[] = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

// Internal AI Model Profiles for UI display
export const INTERNAL_MODEL_PROFILES: Record<string, {
    id: string;
    label: string;
    description: string;
    systemPrompt: string;
    personality: 'momentum' | 'contrarian' | 'balancer';
}> = {
    'model_A': {
        id: 'model_A',
        label: "GPT-5 Momentum Strategist",
        description: "偏向趋势多头，利用强势新闻与价格动量寻找顺势做多机会，除非风险信号要求防守。",
        systemPrompt: "你是一个纪律严格的趋势交易员，优先考虑做多顺势资产，但必须尊重风险约束、资金使用上限与新闻风险。任何建议都要包含进场方向、合理仓位、止损/止盈与无效条件。",
        personality: 'momentum',
    },
    'model_B': {
        id: 'model_B',
        label: "Gemini Contrarian Sentinel",
        description: "偏向反向和防守，关注做空或减仓，以避免在负面新闻下扩大回撤。",
        systemPrompt: "你是一名防守型对冲交易员，优先寻找做空或减仓机会，确保仓位符合风险与资金约束。任何新增仓位都必须严格审慎，并给出明确触发条件、止损、止盈。",
        personality: 'contrarian',
    },
    'model_C': {
        id: 'model_C',
        label: "DeepSeek Multi-Asset Synthesizer",
        description: "关注多资产组合平衡，倾向持有强势仓位但会根据新闻与波动信号调整杠杆和保护利润。",
        systemPrompt: "你负责多资产组合再平衡。结合新闻、仓位表现、风险约束决定增减仓位。任何建议必须给出仓位比例、止损/止盈、失效条件。",
        personality: 'balancer',
    }
};
