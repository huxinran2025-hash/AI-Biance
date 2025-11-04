import {
    UserSessionConfig,
    AccountState,
    DashboardState,
    AppliedRiskClamp,
    StrategySnapshot,
    RiskPolicy,
    MarketSnapshot,
    ExternalAlert,
    MarketData,
    SessionState,
} from '../../types';
import { accountRiskEngine } from '../accountRiskEngine';
import { getPaperConfig } from '../paperConfig';

export function deriveRiskPolicy(config: UserSessionConfig, account: AccountState): RiskPolicy {
    const equity = account.equityNowUsd || account.totalCapital || 0;
    const allowedSymbols = (config.riskPolicy?.allowedSymbols ?? config.allowedPairs ?? []).map(symbol => symbol.toUpperCase());
    const maxTotalRiskUsd = config.riskPolicy?.maxTotalRiskUsd
        ?? Math.max(1000, equity * ((config.capitalUsageLimitPct ?? 30) / 100));
    const maxPositionRiskUsd = config.riskPolicy?.maxPositionRiskUsd
        ?? Math.max(500, maxTotalRiskUsd * 0.25);
    const maxLeverage = config.riskPolicy?.maxLeverage
        ?? config.leverageCap
        ?? 10;
    const lockProfitAfterRoiPct = config.riskPolicy?.lockProfitAfterRoiPct ?? 5;

    return {
        maxTotalRiskUsd,
        maxPositionRiskUsd,
        maxLeverage,
        allowedSymbols,
        lockProfitAfterRoiPct,
    };
}

export function buildStrategySnapshot(config: UserSessionConfig, dashboard: DashboardState): StrategySnapshot {
    const symbols = new Set<string>([
        ...(config.allowedPairs ?? []),
        ...Object.keys(dashboard.market ?? {}),
    ]);

    const marketSnapshot: MarketSnapshot = {};
    symbols.forEach(symbol => {
        const upper = symbol.toUpperCase();
        const entry = dashboard.market[symbol] || dashboard.market[upper];
        if (!entry) return;
        marketSnapshot[upper] = {
            price: entry.price,
            ema20: (entry as any).ema20 ?? entry.price,
            rsi7: (entry as any).rsi7,
            macd: (entry as any).macd,
            fundingRate: (entry as any).funding_rate ?? (entry as any).fundingRate,
            openInterest: (entry as any).open_interest ?? (entry as any).openInterest,
        };
    });

    const riskPolicy = deriveRiskPolicy(config, dashboard.account);
    const externalAlerts = dashboard.recentExternalAlerts ?? dashboard.account.externalAlerts ?? [];

    return {
        market: marketSnapshot,
        account: JSON.parse(JSON.stringify(dashboard.account)) as AccountState,
        riskPolicy,
        externalAlerts: externalAlerts.map(alert => ({ ...alert })),
        timestamp: Date.now(),
    };
}

/**
 * 根据executionMode获取初始资金
 */
function getInitialCapital(config: UserSessionConfig): number {
    const executionMode = config.executionMode || 'paper';
    
    // paper模式：使用用户设置的模拟资金
    if (executionMode === 'paper') {
        try {
            const paperConfig = getPaperConfig();
            return paperConfig.paperCapital;
        } catch (error) {
            // 如果获取失败，使用默认值
            return 10000;
        }
    }
    
    // shadow和live模式：使用默认值，实际会在sessionTick中从API获取
    // 这里返回默认值作为初始值
    return 10000;
}

export function getInitialState(config: UserSessionConfig): DashboardState {
    const initialClamp: AppliedRiskClamp = {
        forbidNewEntries: false,
        maxTotalExposurePct: config.capitalUsageLimitPct / 100,
        maxConcurrentSymbols: config.allowedPairs.length,
        modeLabel: 'NORMAL',
    };
    const initialCapital = getInitialCapital(config);

    const initialAccount: AccountState = {
        totalCapital: initialCapital,
        availableCapital: initialCapital,
        currentLeverage: 0,
        openPositions: [],
        closedTrades: [],
        equityPeakUsd: initialCapital,
        equityNowUsd: initialCapital,
        externalAlerts: [],
    };

    const initialRiskState = accountRiskEngine.evaluate(initialAccount);

    const initialMarket: MarketData = {};
    const now = Date.now();
    (config.allowedPairs ?? []).forEach(symbol => {
        const normalized = symbol.toUpperCase();
        initialMarket[normalized] = {
            price: 0,
            volume24h: 0,
            quoteVolume24h: 0,
            tradeCount24h: 0,
            priceChange24h: 0,
            updatedAt: now,
        };
    });

    const session: SessionState = {
        sid: 'local-session',
        status: 'PAUSED',
        startedAt: now,
        lastTickAt: now,
        tradeEnabled: false,
    };

    return {
        account: initialAccount,
        market: initialMarket,
        systemStatus: {
            mode: 'NORMAL',
            brakeSinceTs: null,
            brakeReason: null,
            activeRiskClamp: initialClamp,
        },
        logs: [],
        marketRegime: {
            available: true,
            environmentAdvisory: 'NEUTRAL',
            disagreementLevel: 'LOW',
            confidence: 1.0,
            sourceMeta: {
                status: 'ok',
                lastGoodTs: Date.now(),
            },
        },
        disciplineState: {
            lastReviewTs: Date.now(),
            windows: [],
            diagnostics: {
                panicTrading: false,
                revengeTrading: false,
                overconcentration: false,
                overtrading: false,
                profitConcentrationHigh: false,
                unrealizedProfitHigh: false,
            },
            perModelStats: {
                model_A: [],
                model_B: [],
                model_C: [],
            }
        },
        riskLimits: accountRiskEngine.getLimits(),
        accountRiskState: initialRiskState,
        selfReviewFeed: {},
        volatilitySignals: [],
        recentExternalAlerts: [],
        lastStrategySnapshot: undefined,
        lastUpdated: Date.now(),
        dailyReport: {
            date: new Date().toISOString().split('T')[0],
            blockedTradeStats: {},
            opportunityCostUsd: 0,
            savedLossUsd: 0,
            topBlockedProposals: [],
            decisionAuthorityBreakdown: [],
            modelHealth: [],
        },
        exchangeHealth: {
            overallRisk: 'ok',
            criticalIssues: [],
            allSources: [],
            lastCheckTs: Date.now(),
        },
        session,
    };
}

