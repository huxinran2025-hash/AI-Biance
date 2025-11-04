import { 
    MarketData, 
    MarketTicker,
    AccountState, 
    UserSessionConfig,
    DashboardState,
    ExternalAlert,
    RssEvent,
    ShadowLedgerEntry,
    UserAIConfig,
    StrategySnapshot,
    InternalModelId,
    ModelDecisionSnapshot,
    BrakeReason,
    AttributionLogEntry,
    DecisionAuthority,
    ModelHealth,
    ModelHealthStatus,
    ModelSelfReviewSnapshot,
    AccountRiskLimits,
    StoredArticle,
    TradeProposal,
    AppliedRiskClamp,
} from '../types';
import { SYSTEM_TIMINGS } from '../constants';
import { MarketFeedBrowser } from '../exchange/binance/md/marketFeed.browser.js';
import { strategist } from './strategist';
import { auditService } from './audit';
import { newsSignalService } from './news';
import { exchangeRiskWatcher } from './exchangeRiskWatcher';
import { accountSync } from './accountSync';
import { accountRiskEngine } from './accountRiskEngine';
import { positionRiskManager } from './positionRiskManager';
import { selfReviewRepository } from './selfReviewRepository';
import { modelDisagreementMonitor } from './modelDisagreementMonitor';
import { rssWatcher } from './rssWatcher';
import { getUserAIConfig, updateUserAIConfig, getAvailableAiModels } from './userConfig';
import { buildStrategySnapshot, getInitialState, deriveRiskPolicy } from './api/stateFactory';
import { ExternalWatcher, SelfReviewCoach } from './api/mockServices';
import { DEFAULT_SESSION_CONFIG } from '../constants';
import { bootstrapBinance } from '../exchange/binance/bootstrap.js';
import type { ExecutionEngine } from '../exchange/binance/execution/index.js';
import type { NominalOrderSignal, RiskEngineContext, AccountSnapshot, MarketQuote, RiskTierKey } from '../exchange/binance/models.js';
import type { RiskMode } from '../exchange/binance/models.js';


// --- Global State ---
let sessionInterval: number | null = null;
let state: DashboardState;
let marketFeed: MarketFeedBrowser | null = null;
let liveConfig: UserSessionConfig; // 动态配置，支持在线更新
const MODEL_IDS: InternalModelId[] = ['model_A', 'model_B', 'model_C'];
const RECENT_ALERT_WINDOW_MS = 10 * 60 * 1000;
let lastRssPollTs = 0;
let cachedExternalAlerts: ExternalAlert[] = [];
let rssFailureCount = 0;
let rssFirstFailureTs = 0;
const LOCAL_SESSION_ID = 'local-session';
let executionEngine: ExecutionEngine | null = null;
let binanceRestClient: any = null; // BinanceRestClient instance from bootstrap

const normalizePairs = (pairs: string[] | undefined): string[] => {
    if (!pairs) return [];
    return Array.from(new Set(pairs.map((symbol) => symbol.toUpperCase())));
};

/**
 * 统一计算可用现金
 * 原则：以交易所 free 为准，夹紧到 [0, totalCapital]，并在缺失时保持上次值但不增长
 */
function recomputeAvailableCapital(
    cashFree: number | undefined,
    prevAvailableCapital: number,
    totalCapital: number
): number {
    if (cashFree !== undefined && cashFree >= 0) {
        // 有交易所数据时，以交易所数据为准，但不超过总资本
        return Math.min(totalCapital, Math.max(0, cashFree));
    } else {
        // 没有交易所数据时，保持上次值，但不允许超过总资本
        return Math.max(0, Math.min(totalCapital, prevAvailableCapital));
    }
}

const toExternalAlert = (event: RssEvent): ExternalAlert => ({
    idHash: event.idHash,
    source: event.source,
    title: event.title,
    link: event.link,
    publishedAt: event.publishedAt,
    severity: event.severity,
    topic: event.topic,
    summary: event.summary,
});

// Re-export from stateFactory
export { buildStrategySnapshot };

// Mock Services instances
const externalWatcher = new ExternalWatcher();
const selfReviewCoach = new SelfReviewCoach();

// Shadow Ledger
const shadowLedger: ShadowLedgerEntry[] = [];

// --- Core Simulation Loop ---
async function sessionTick(config: UserSessionConfig) {
    const now = Date.now();
    const tickStart = Date.now();

    if (state.session) {
        state.session.lastTickAt = now;
    }

    // 单一真相源：净值计算的唯一入口
    const refreshAccountSnapshot = (accountData?: { cashUsd?: number; unrealizedPnlUsd?: number }) => {
        // 1. 获取现金（优先使用accountSync提供的数据，否则使用availableCapital）
        const cashUsd = accountData?.cashUsd ?? state.account.availableCapital ?? state.account.totalCapital ?? 0;
        
        // 2. 获取未实现盈亏（优先使用accountSync提供的数据，否则从持仓计算）
        const totalUnrealized = accountData?.unrealizedPnlUsd ?? 
            state.account.openPositions.reduce((sum, pos) => sum + (pos.unrealizedPnl || 0), 0);
        
        // 3. 计算净值（唯一计算点）
        const equity = cashUsd + totalUnrealized;
        state.account.equityNowUsd = equity;
        
        // 4. 更新峰值
        state.account.equityPeakUsd = Math.max(state.account.equityPeakUsd ?? equity, equity);
        
        // 5. 更新totalCapital（基于当前净值，用于兼容性）
        state.account.totalCapital = equity;
        
        // 6. 计算杠杆
        const exposure = state.account.openPositions.reduce((sum, pos) => sum + Math.abs(pos.notionalUsd || 0), 0);
        state.account.currentLeverage = equity > 0 ? exposure / equity : 0;
        
        // 7. 计算当日P&L和收益率（相对于totalCapital基准）
        const dayStartCapital = state.account.totalCapital; // 可以改为存储当日开始时的capital
        state.account.dayPnlUsd = totalUnrealized; // 简化：当日P&L = 未实现盈亏
        state.account.dayReturn = dayStartCapital > 0 ? (totalUnrealized / dayStartCapital) : 0;
        
        // 8. 同步cashUsd到availableCapital（用于兼容性）
        state.account.availableCapital = cashUsd;
        
        return exposure;
    };

    // 1. Update Market Data & PNL
    const feedSnapshot = marketFeed?.getSnapshot() ?? {};
        const nowTs = Date.now();
    
    // 如果快照为空，尝试REST降级（兜底）
    if (Object.keys(feedSnapshot).length === 0 && marketFeed) {
        try {
            await marketFeed.fetchRestSnapshot();
            const restSnapshot = marketFeed.getSnapshot();
            if (restSnapshot && Object.keys(restSnapshot).length > 0) {
                Object.assign(feedSnapshot, restSnapshot);
                auditService.logInfo('[Market] Using REST fallback for market data');
            }
        } catch (error) {
            auditService.logWarn('[Market] REST fallback also failed', { error: String(error) });
        }
    }
    
    if (Object.keys(feedSnapshot).length > 0) {
        const allowed = new Set((config.allowedPairs ?? []).map(symbol => symbol.toUpperCase()));
        for (const [symbol, quote] of Object.entries(feedSnapshot)) {
            if (!allowed.has(symbol)) {
                continue;
            }

            const entry: MarketTicker = {
                price: quote.price,
                volume24h: quote.volume24h ?? state.market[symbol]?.volume24h ?? 0,
            quoteVolume24h: quote.quoteVolume24h ?? state.market[symbol]?.quoteVolume24h ?? 0,
            tradeCount24h: quote.tradeCount24h ?? state.market[symbol]?.tradeCount24h ?? 0,
                priceChange24h: quote.priceChange24h,
                bestBid: quote.bestBid ?? state.market[symbol]?.bestBid,
                bestAsk: quote.bestAsk ?? state.market[symbol]?.bestAsk,
                updatedAt: quote.updatedAt ?? nowTs,
                eventTime: quote.eventTime ?? quote.updatedAt ?? nowTs,
                lastPrice: quote.price,
            };
            state.market[symbol] = {
                ...state.market[symbol],
                ...entry,
            } as MarketTicker;
        }
    }

    // 1.1 更新持仓的未实现盈亏（基于市场数据）
    state.account.openPositions.forEach(pos => {
        const marketTicker = state.market[pos.symbol];
        if (marketTicker && marketTicker.price > 0) {
            const currentPrice = marketTicker.price;
        pos.unrealizedPnl = (currentPrice - pos.entryPrice) * pos.size * (pos.side === 'LONG' ? 1 : -1);
        }
    });
    
    // 3. Poll External & Internal Intel
    const marketRegime = await externalWatcher.tick();
    externalWatcher.setLastMarketRegime(marketRegime);
    state.marketRegime = marketRegime;
    state.disciplineState = selfReviewCoach.tick(state.account);
    state.exchangeHealth = exchangeRiskWatcher.getHealthSummary();

    // 3.1 Poll RSS Events for External Risk Alerts
    let rssEvents: RssEvent[] = [];
    try {
        rssEvents = await rssWatcher.pollRssEventsSince(lastRssPollTs, { maxAgeMs: RECENT_ALERT_WINDOW_MS });
        if (rssEvents.length > 0) {
            auditService.logInfo(`[RSS] Fetched ${rssEvents.length} new RSS events since ${new Date(lastRssPollTs).toISOString()}`);
        }
        // 成功后重置失败计数
        rssFailureCount = 0;
        rssFirstFailureTs = 0;
    } catch (error) {
        // 记录失败
        rssFailureCount++;
        if (rssFirstFailureTs === 0) {
            rssFirstFailureTs = Date.now();
        }
        const errorStr = String(error);
        const failureDurationMs = Date.now() - rssFirstFailureTs;
        
        // 移除静默逻辑，统一记录所有失败
        auditService.logWarn(`[RSS] Failed to poll RSS events (Attempt ${rssFailureCount}, Duration: ${Math.round(failureDurationMs / 1000)}s)`, { error: errorStr });
        
        // 连续失败超过 5 次或持续失败超过 10 分钟，升级为 CRITICAL
        if (rssFailureCount >= 5 || failureDurationMs > 10 * 60 * 1000) {
            auditService.logError(`[RSS] CRITICAL: RSS polling has failed ${rssFailureCount} consecutive times (${Math.round(failureDurationMs / 1000)}s). Risk data may be stale.`);
            // 可选：触发系统警报或模式切换
            // 暂不自动切换模式，仅记录日志供人工决策
        }
    }

    if (rssEvents.length) {
        lastRssPollTs = Math.max(lastRssPollTs, ...rssEvents.map(event => event.publishedAt));
    }

    // 3.2 Process and cache external alerts
    const newAlerts = rssEvents.map(toExternalAlert);
    const alertMap = new Map<string, ExternalAlert>();
    const combinedAlerts = [...cachedExternalAlerts, ...newAlerts];
    combinedAlerts.forEach(alert => {
        if (now - alert.publishedAt <= RECENT_ALERT_WINDOW_MS) {
            alertMap.set(alert.idHash, alert);
        }
    });
    cachedExternalAlerts = Array.from(alertMap.values()).sort((a, b) => b.publishedAt - a.publishedAt);
    
    // Count critical alerts for logging
    const criticalAlerts = cachedExternalAlerts.filter(a => a.severity === 'critical' && (a.topic === 'regulator' || a.topic === 'exchange'));
    if (criticalAlerts.length > 0) {
        auditService.logWarn(`[RSS] Active critical external alerts: ${criticalAlerts.length}`, {
            alerts: criticalAlerts.map(a => ({ source: a.source, title: a.title, topic: a.topic }))
        });
    }
    
    state.account.externalAlerts = cachedExternalAlerts;
    state.recentExternalAlerts = cachedExternalAlerts.slice(0, 10);
    
    // 4. Account Sync (账户同步) - 只接收素材，不覆盖equity
    const reconcileResult = accountSync.getCurrentState();

    // 添加空值检查
    if (!reconcileResult) {
        auditService.logWarn('[AccountSync] getCurrentState returned null/undefined, skipping account sync this tick.');
    } else {
        // 只接收素材数据，不写入equity
        // state.account.cashUsd = reconcileResult.cashUsd; // 如果AccountState有cashUsd字段
        const cashBalance = reconcileResult.balances?.find(balance => balance.asset === 'USDT');
        state.account.availableCapital = recomputeAvailableCapital(
            cashBalance?.free,
            state.account.availableCapital ?? 0,
            state.account.totalCapital ?? 0
        );

        // 合并外部持仓到系统状态
        reconcileResult.positions?.forEach(externalPos => {
            const existingIndex = state.account.openPositions.findIndex(pos => 
                pos.symbol === externalPos.symbol && pos.side === externalPos.side
            );
            
            if (existingIndex >= 0) {
                // 更新现有持仓
                state.account.openPositions[existingIndex] = {
                    ...state.account.openPositions[existingIndex],
                    size: externalPos.size,
                    entryPrice: externalPos.entryPrice,
                    leverage: externalPos.leverage,
                    notionalUsd: externalPos.notionalUsd,
                    unrealizedPnl: externalPos.unrealizedPnl,
                };
            } else {
                // 添加新持仓（外部手动开仓）
                state.account.openPositions.push({
                    symbol: externalPos.symbol,
                    side: externalPos.side,
                    entryPrice: externalPos.entryPrice,
                    size: externalPos.size,
                    leverage: externalPos.leverage,
                    unrealizedPnl: externalPos.unrealizedPnl,
                    notionalUsd: externalPos.notionalUsd,
                });
            }
        });

        positionRiskManager.bootstrapPositions(state.account);
        const riskAdjustments = positionRiskManager.evaluate(state.account, state.market);
        if (riskAdjustments.length) {
            positionRiskManager.applyAdjustments(state.account, riskAdjustments);
        }

        // 统一刷新账户快照（单一真相源）
        // 传入accountSync提供的素材数据
        refreshAccountSnapshot({
            cashUsd: reconcileResult.cashUsd,
            unrealizedPnlUsd: reconcileResult.positionsUnrealizedUsd
        });
    }
    // availableCapital 已在上面统一更新，这里不再重复更新

    state.riskLimits = accountRiskEngine.getLimits();
    state.accountRiskState = accountRiskEngine.evaluate(state.account);

    const strategySnapshot = buildStrategySnapshot(liveConfig, state);
    state.lastStrategySnapshot = strategySnapshot;

    // 5. Strategist determines new system mode & gets proposals
    const strategistStart = Date.now();
    const { newMode, reason, proposals, tradeAttribution, decisionSnapshots } = await strategist.tick(
        liveConfig, state
    );
    const strategistTime = Date.now() - strategistStart;
    auditService.logAttribution(tradeAttribution);
    state.volatilitySignals = modelDisagreementMonitor.getSignals();

    // 6. Update System Mode if changed & create Safety Snapshot
    if (newMode !== state.systemStatus.mode) {
        strategist.generateAndLogSafetySnapshot(newMode, reason, state);
        state.systemStatus.mode = newMode;
        if (newMode === 'NORMAL') {
            state.systemStatus.brakeReason = null;
            state.systemStatus.brakeSinceTs = null;
        } else {
            state.systemStatus.brakeReason = reason as BrakeReason; // 'RECOVERY' is not a brake reason
            state.systemStatus.brakeSinceTs = now;
        }
    }
    
    // 7. Apply Risk Clamp based on current mode
    state.systemStatus.activeRiskClamp = strategist.getCurrentRiskClamp(newMode, liveConfig);

    // 8. Trade Execution & Shadow Ledger
    const clamp = state.systemStatus.activeRiskClamp;
    const tradingEnabled = state.session?.tradeEnabled ?? false;

    // 记录Shadow Ledger（保留原有逻辑）
    proposals.forEach(proposal => {
        if (proposal.action === 'hold') return;

        let blockedBy: ShadowLedgerEntry['blockedBy'] = undefined;
        if (proposal.action.includes('enter') && clamp.forbidNewEntries) {
            blockedBy = clamp.modeLabel;
        } else if (proposal.action.includes('enter') && !tradingEnabled) {
            blockedBy = 'StrategistConsensus';
        }

        shadowLedger.unshift({
            ts: now, model: proposal.model, pair: proposal.symbol,
            action: blockedBy ? 'forbidden_by_riskClamp' : proposal.action,
            leverage: proposal.leverage, notionalUsd: proposal.notionalUsd,
            reasonFromModel: proposal.reasonFromModel,
            blockedBy, snapshotMode: state.systemStatus.mode,
        });
    });
    if (shadowLedger.length > 200) shadowLedger.pop();
    
    // 执行交易（使用ExecutionEngine或Mock回退）
    if (tradingEnabled && executionEngine && proposals.length > 0) {
        try {
            const signals = proposalsToSignals(proposals, state.market, liveConfig);
            const ctx = buildExecContext(state, liveConfig);
            
            // Live模式安全限制
            const MAX_LIVE_NOTIONAL = Number(process.env.MAX_LIVE_NOTIONAL_USD) || 50;
            const isLiveMode = liveConfig.executionMode === 'live';
            
            for (const signal of signals) {
                // 检查风险限制（在ExecutionEngine内部也会检查，这里做预检查）
                if (signal.targetNominal && signal.targetNominal > 0) {
                    // 检查是否被风险限制阻止
                    if (clamp.forbidNewEntries) {
                        auditService.logInfo('[Exec] Signal blocked by risk clamp', { symbol: signal.symbol });
                        continue;
                    }
                    
                    // Live模式金额上限检查
                    if (isLiveMode && signal.targetNominal > MAX_LIVE_NOTIONAL) {
                        auditService.logWarn('[Risk] Live order rejected: exceeds max notional', { 
                            notional: signal.targetNominal, 
                            max: MAX_LIVE_NOTIONAL,
                            symbol: signal.symbol 
                        });
                        continue;
                    }
                    
                    const execStart = Date.now();
                    const result = await executionEngine.process(signal, ctx);
                    const execTime = Date.now() - execStart;
                    
                    auditService.logInfo('[Exec] Processed signal', { 
                        symbol: signal.symbol, 
                        side: signal.side,
                        accepted: result.accepted,
                        reason: result.reason,
                        execTimeMs: execTime
                    });
                    
                    if (result.accepted && result.preparedOrder) {
                        // ExecutionEngine已经处理了订单记录和执行，这里只需要更新状态
                        // 状态更新会通过accountSync在下个tick自动同步
                    }
                }
            }
        } catch (error) {
            auditService.logWarn('[Exec] ExecutionEngine failed, falling back to Mock', { error: String(error) });
            // 回退到Mock执行
            executeMockFallback(proposals, clamp, tradingEnabled);
        }
    } else if (tradingEnabled && proposals.length > 0) {
        // Mock回退逻辑（当ExecutionEngine未初始化时）
        if (state.session && state.session.executionEngineStatus !== 'failed') {
            state.session.executionEngineStatus = 'mock_fallback';
        }
        executeMockFallback(proposals, clamp, tradingEnabled);
    }

    positionRiskManager.bootstrapPositions(state.account);
    // 注意：这里不需要再次调用refreshAccountSnapshot，因为之前已经调用过了
    // 如果持仓有变化，未实现盈亏会在下次tick时自动更新
    const exposureNowUsd = state.account.openPositions.reduce((sum, pos) => sum + Math.abs(pos.notionalUsd || 0), 0);
    // 使用统一的 availableCapital 计算函数
    state.account.availableCapital = recomputeAvailableCapital(
        undefined, // 没有新的交易所数据
        state.account.availableCapital ?? 0,
        state.account.totalCapital ?? 0
    );
    state.accountRiskState = accountRiskEngine.evaluate(state.account);

    const totalReturnPct = state.account.equityPeakUsd > 0
        ? (state.account.equityNowUsd - state.account.equityPeakUsd) / state.account.equityPeakUsd
        : 0;
    const maxDrawdownPct = state.accountRiskState?.metrics.drawdownPct ?? 0;
    const leverageNow = state.account.currentLeverage;

    const decisionByModel = new Map<InternalModelId, ModelDecisionSnapshot>();
    decisionSnapshots.forEach(snapshot => {
        decisionByModel.set(snapshot.model, snapshot);
    });

    MODEL_IDS.forEach(modelId => {
        const decision = decisionByModel.get(modelId);
        const comment = decision
            ? `本轮意图: ${decision.stance} 杠杆${decision.leverage} 信心${decision.confidence.toFixed(2)}`
            : '本轮未提出新增仓位。';

        const snapshot: ModelSelfReviewSnapshot = {
            ts: now,
            model: modelId,
            accountValueUsd: state.account.equityNowUsd,
            availableCashUsd: state.account.availableCapital,
            totalReturnPct,
            maxDrawdownPct,
            exposureUsd: exposureNowUsd,
            leverageNow,
            comment,
            positions: state.account.openPositions.map(pos => ({
                symbol: pos.symbol,
                side: pos.side,
                leverage: pos.leverage,
                notionalUsd: pos.notionalUsd,
                unrealizedPnl: pos.unrealizedPnl,
                profitTarget: pos.takeProfit,
                stopLoss: pos.stopLoss,
                invalidationCondition: pos.invalidationCondition,
                riskManagement: pos.riskManagement,
            })),
            systemMode: state.systemStatus.mode,
        };

        selfReviewRepository.record(snapshot);
        accountRiskEngine.ingestSelfReview(snapshot);
    });

    state.selfReviewFeed = selfReviewRepository.getAllSummaries();
    state.accountRiskState = accountRiskEngine.evaluate(state.account);
    if (state.account.closedTrades.length > 100) {
        state.account.closedTrades = state.account.closedTrades.slice(-100);
    }


    // 9. Update Daily Report
    const todayStr = new Date(now).toDateString();
    if (!state.dailyReport || new Date(state.dailyReport.date).toDateString() !== todayStr) {
        state.dailyReport = getInitialState(config).dailyReport; // Reset for new day
        if (state.dailyReport) {
            state.dailyReport.date = new Date(now).toISOString().split('T')[0];
        }
    }

    if (state.dailyReport) {
        const blockedEntriesToday = shadowLedger.filter(e => e.blockedBy && new Date(e.ts).toDateString() === todayStr);
        state.dailyReport.topBlockedProposals = blockedEntriesToday.slice(0, 5);
        
        const todayLogs = auditService.getHistory().filter(log => new Date(log.timestamp).toDateString() === todayStr);
        const todayAttributionLogs = todayLogs.filter(log => log.type === 'ATTRIBUTION') as AttributionLogEntry[];

        const authorityCounts: Record<DecisionAuthority, number> = {
            'StrategistConsensus': 0, 'RiskClamp': 0, 'DrawdownGuard': 0, 'ManualOverride': 0, 'ExternalSignalFreeze': 0,
        };
        todayAttributionLogs.forEach(log => {
            const authority = log.details.decisionAuthority;
            if (authority in authorityCounts) {
                authorityCounts[authority]++;
            }
        });
        state.dailyReport.decisionAuthorityBreakdown = Object.entries(authorityCounts)
            .map(([authority, count]) => ({ authority: authority as DecisionAuthority, count }))
            .filter(item => item.count > 0);

        const models: InternalModelId[] = ['model_A', 'model_B', 'model_C'];
        const modelHealth: ModelHealth[] = models.map(modelId => {
            const myProposals = todayAttributionLogs.filter(log => 
                log.details.contributingModels.some(cm => cm.model === modelId && cm.stance !== 'flat')
            );
            const totalProposals = myProposals.length;
            const approvedCount = myProposals.filter(log => log.details.mergedOutcome === 'approved').length;

            let status: ModelHealthStatus = 'UNDER_REVIEW';
            let notes = `提出了 ${totalProposals} 个交易意图，其中 ${approvedCount} 个被批准。`;

            if (totalProposals > 3 && (approvedCount / totalProposals) >= 0.7) {
                status = 'TRUSTED';
                notes = `表现稳健，提出 ${totalProposals} 个意图，批准率高 (${((approvedCount/totalProposals)*100).toFixed(0)}%)。`;
            } else if (totalProposals > 4 && (approvedCount / totalProposals) < 0.2) {
                status = 'RESTRICT';
                notes = `信号噪音较多，提出 ${totalProposals} 个意图，但批准率低 (${((approvedCount/totalProposals)*100).toFixed(0)}%)。`;
            }

            const madeProposalDuringRevengeTrading = state.disciplineState.diagnostics.revengeTrading && myProposals.length > 0;
            if(madeProposalDuringRevengeTrading){
                status = 'UNDER_REVIEW';
                notes += ' 在报复性交易窗口期内仍有活动，需要观察。'
            }

            return { model: modelId, status, notes };
        });
        state.dailyReport.modelHealth = modelHealth;
    }
    
    state.logs = auditService.getHistory();
    
    // 9.1 Aggregate RSS data for risk ticker bar (跑马灯数据聚合)
    try {
        // 获取两路数据源
        const articlesA: StoredArticle[] = newsSignalService.getLatestArticles() ?? [];
        
        // 将RssEvent转换为StoredArticle格式（云端数据源，如果失败则跳过）
        const articlesB: StoredArticle[] = rssEvents.map(ev => ({
            idHash: ev.idHash,
            feedId: ev.feedId,
            feedLabel: ev.feedLabel,
            title: ev.title,
            link: ev.link ?? '',
            publishedAt: ev.publishedAt,
            snippet: ev.snippet ?? ev.summary ?? '',
            critical: ev.severity === 'critical',
            category: ev.topic === 'regulator' ? 'regulation' : 
                     ev.topic === 'exchange' ? 'exchange' : 
                     ev.topic === 'macro' ? 'macro' : 'crypto' as any,
        }));
        
        // 合并去重（同源同标题24h内最多2条）
        // 只要本地分支（newsSignalService）有数据就写入 riskNews
        const merged = [...articlesA, ...articlesB];
        const dayAgo = now - 24 * 3600 * 1000;
        const byKey = new Map<string, StoredArticle[]>();
        
        for (const a of merged) {
            if (a.publishedAt < dayAgo) continue;
            const key = `${a.feedId || a.source || 'unknown'}|${a.title}`.slice(0, 256);
            const arr = byKey.get(key) ?? [];
            if (arr.length < 2) {
                arr.push(a);
            }
            byKey.set(key, arr);
        }
        
        const deduped = Array.from(byKey.values()).flat();
        
        // 按严重度→时间倒序排序
        const sevRank: Record<string, number> = { 
            critical: 4, 
            high: 3, 
            medium: 2, 
            low: 1, 
            info: 0,
            non_critical: 1 
        };
        deduped.sort((a, b) => {
            const sevDiff = (sevRank[b.critical ? 'critical' : 'low'] ?? 0) - 
                           (sevRank[a.critical ? 'critical' : 'low'] ?? 0);
            if (sevDiff !== 0) return sevDiff;
            return b.publishedAt - a.publishedAt;
        });
        
        // 限流到200条
        state.riskNews = deduped.slice(0, 200);
    } catch (error) {
        // 聚合失败时，至少保留本地数据源的文章
        const localArticles = newsSignalService.getLatestArticles() ?? [];
        state.riskNews = localArticles.slice(0, 200);
        auditService.logWarn('[RSS] Failed to aggregate risk news, using local articles only', { error: String(error) });
    }
    
    state.lastUpdated = now;
    
    // 记录tick性能指标
    const totalTickTime = Date.now() - tickStart;
    if (totalTickTime > 1000) {
        auditService.logWarn('[Metrics] Slow tick detected', { 
            totalMs: totalTickTime,
            strategistMs: strategistTime 
        });
    }
}


// --- Public API ---
export function startBackend(config: UserSessionConfig, restoreState?: DashboardState) {
    if (sessionInterval) {
        // 如果已经在运行，只更新配置
        liveConfig = { ...config, allowedPairs: normalizePairs(config.allowedPairs) };
        setupMarketFeed(liveConfig);
        // 如果executionEngine已初始化，更新模式
        if (executionEngine && config.executionMode) {
            executionEngine.setMode(config.executionMode);
        }
        return;
    }
    console.log('[API] Starting backend session...');
    
    liveConfig = { ...config, allowedPairs: normalizePairs(config.allowedPairs) }; // 保存动态配置
    
    // 如果有恢复的状态，使用它；否则初始化新状态
    if (restoreState) {
        state = restoreState;
        console.log('[API] Restored session state from persistence');
    } else {
        state = getInitialState(config);
    }

    if (!state.session) {
        state.session = {
            sid: LOCAL_SESSION_ID,
            status: 'PAUSED',
            startedAt: Date.now(),
            lastTickAt: Date.now(),
            tradeEnabled: false,
            executionEngineStatus: 'initializing',
        };
    }

    state.session.sid = LOCAL_SESSION_ID;
    state.session.startedAt = Date.now();
    state.session.lastTickAt = Date.now();
    state.session.tradeEnabled = state.session.tradeEnabled ?? false;
    state.session.status = 'RUNNING';
    state.session.executionEngineStatus = 'initializing';

    setupMarketFeed(liveConfig);

    newsSignalService.start();
    exchangeRiskWatcher.start();
    accountSync.start();
    
    // 异步初始化ExecutionEngine（不阻塞启动）
    initializeExecutionEngine(config).catch(err => {
        console.error('[API] Failed to initialize ExecutionEngine:', err);
        auditService.logError('[Bootstrap] CRITICAL: ExecutionEngine initialization failed', { error: String(err) });
    });
    
    sessionInterval = window.setInterval(() => sessionTick(config), SYSTEM_TIMINGS.BACKEND_TICK_MS);
}

/**
 * 测试币安 API 连接是否有效
 */
async function testBinanceConnection(client: any): Promise<void> {
    try {
        // 调用轻量级的账户信息接口验证密钥
        const response = await client.getSigned('/api/v3/account', { 
            recvWindow: 5000 
        });
        
        if (!response || response.status !== 200) {
            throw new Error(`API test failed with status ${response?.status}`);
        }
    } catch (error: any) {
        if (error.status === 401 || error.status === 403) {
            throw new Error('Binance API authentication failed: Invalid API key or secret');
        }
        throw new Error(`Binance API connection test failed: ${error.message}`);
    }
}

/**
 * 异步初始化ExecutionEngine
 */
async function initializeExecutionEngine(config: UserSessionConfig): Promise<void> {
    if (executionEngine) {
        // 如果已初始化，只需更新模式
        executionEngine.setMode(config.executionMode ?? 'paper');
        if (state.session) {
            state.session.executionEngineStatus = 'ready';
        }
        return;
    }
    
    try {
        const boot = await bootstrapBinance({});
        executionEngine = boot.executionEngine;
        binanceRestClient = boot.restClient; // 保存restClient供accountSync使用
        executionEngine.setMode(config.executionMode ?? 'paper');
        
        // P1: API 连接测试（初始化时）
        const hasApiKey = process.env.BINANCE_API_KEY || process.env.BINANCE_SECRET_ENDPOINT;
        if (hasApiKey && binanceRestClient) {
            try {
                await testBinanceConnection(binanceRestClient);
                auditService.logInfo('[Bootstrap] Binance API connection verified');
            } catch (apiError) {
                auditService.logError('[Bootstrap] Binance API connection test failed', { 
                    error: String(apiError) 
                });
                // API测试失败但不影响Paper模式的使用
            }
        }
        
        if (state.session) {
            state.session.executionEngineStatus = 'ready';
        }
        auditService.logInfo('[Bootstrap] ExecutionEngine initialized', { 
            mode: executionEngine.getMode() 
        });
        
        if (accountSync.setRestClient) {
            accountSync.setRestClient(binanceRestClient);
        }
    } catch (error) {
        auditService.logError('[Bootstrap] CRITICAL: ExecutionEngine initialization failed', { 
            error: String(error) 
        });
        executionEngine = null;
        binanceRestClient = null;
        
        if (state.session) {
            state.session.executionEngineStatus = 'failed';
        }
        
        // 自动重试1次（延迟3秒）
        console.log('[API] Will retry ExecutionEngine initialization in 3 seconds...');
        setTimeout(() => {
            retryExecutionEngineInit(config);
        }, 3000);
    }
}

async function retryExecutionEngineInit(config: UserSessionConfig): Promise<void> {
    if (executionEngine || !state.session || state.session.executionEngineStatus === 'ready') {
        return; // 已经成功初始化
    }
    
    console.log('[API] Retrying ExecutionEngine initialization...');
    auditService.logInfo('[Bootstrap] Auto-retrying ExecutionEngine initialization');
    
    try {
        const boot = await bootstrapBinance({});
        executionEngine = boot.executionEngine;
        binanceRestClient = boot.restClient;
        executionEngine.setMode(config.executionMode ?? 'paper');
        
        if (state.session) {
            state.session.executionEngineStatus = 'ready';
        }
        auditService.logInfo('[Bootstrap] ExecutionEngine initialized on retry', { 
            mode: executionEngine.getMode() 
        });
        
        if (accountSync.setRestClient) {
            accountSync.setRestClient(binanceRestClient);
        }
    } catch (error) {
        auditService.logError('[Bootstrap] ExecutionEngine retry failed', { 
            error: String(error) 
        });
        executionEngine = null;
        binanceRestClient = null;
        
        if (state.session) {
            state.session.executionEngineStatus = 'failed';
        }
    }
}

export async function retryEngineInitialization(): Promise<boolean> {
    if (!liveConfig) {
        throw new Error('No active session');
    }
    
    if (executionEngine && state.session?.executionEngineStatus === 'ready') {
        return true; // 已经就绪
    }
    
    if (state.session) {
        state.session.executionEngineStatus = 'initializing';
    }
    
    await initializeExecutionEngine(liveConfig);
    
    return state.session?.executionEngineStatus === 'ready';
}

export function stopBackend() {
    if (sessionInterval) {
        console.log('[API] Stopping backend session...');
        clearInterval(sessionInterval);
        sessionInterval = null;
        newsSignalService.stop();
        exchangeRiskWatcher.stop();
        accountSync.stop();
        // 不清除审计日志和影子账本，保留历史数据
        // auditService.clear();
        // shadowLedger.length = 0;
    }

    if (marketFeed) {
        marketFeed.stop();
        marketFeed = null;
    }

    if (state?.session) {
        // 只改 session.status=STOPPED，不清空 dashboard
        // 保留 dashboard 状态供快照显示
        state.session.status = 'STOPPED';
        state.session.tradeEnabled = false;
        // 不调用 HYDRATE_DASHBOARD(null)，保留现有 dashboard 数据
    }
}

function setupMarketFeed(config: UserSessionConfig): void {
    if (!state) {
        return;
    }

    const nowTs = Date.now();
    const pairs = normalizePairs(config.allowedPairs);

    pairs.forEach(symbol => {
        if (!state.market[symbol]) {
            state.market[symbol] = {
                price: 0,
                volume24h: 0,
                quoteVolume24h: 0,
                tradeCount24h: 0,
                priceChange24h: 0,
                updatedAt: nowTs,
            } as MarketTicker;
        }
    });

    if (marketFeed) {
        marketFeed.restart(pairs);
    } else if (pairs.length > 0) {
        marketFeed = new MarketFeedBrowser(pairs, { logger: console });
        void marketFeed.start();
    }
}

export async function getDashboardState(): Promise<DashboardState> {
    return JSON.parse(JSON.stringify(state));
}

// 在线参数更新功能
export async function updateSessionConfig(patch: Partial<UserSessionConfig>): Promise<void> {
    if (!liveConfig) {
        console.warn('No active session to update');
        return;
    }
    
    const oldConfig = { ...liveConfig };
    const nextPairs = patch.allowedPairs !== undefined ? normalizePairs(patch.allowedPairs) : liveConfig.allowedPairs;
    liveConfig = { ...liveConfig, ...patch, allowedPairs: nextPairs };
    
    if (patch.allowedPairs) {
        setupMarketFeed(liveConfig);
    }

    // 更新executionMode（如果ExecutionEngine已初始化）
    if (patch.executionMode) {
        if (!executionEngine) {
            const errorMsg = 'ExecutionEngine is not initialized. Cannot switch mode.';
            auditService.logWarn(`[Config] ${errorMsg}`);
            throw new Error(errorMsg);
        }
        
        try {
            // P1: 切换到 Live 模式前验证 API 连接
            if (patch.executionMode === 'live' && binanceRestClient) {
                auditService.logInfo('[Config] Testing Binance API before switching to Live mode');
                try {
                    await testBinanceConnection(binanceRestClient);
                    auditService.logInfo('[Config] Binance API connection verified for Live mode');
                } catch (apiError) {
                    const errorMsg = `切换失败：${(apiError as Error).message}`;
                    auditService.logError('[Config] Cannot switch to Live mode: API test failed', { 
                        error: String(apiError) 
                    });
                    throw new Error(errorMsg);
                }
            }
            
            executionEngine.setMode(patch.executionMode);
            auditService.logInfo(`[Config] Execution mode changed to ${patch.executionMode}`, { 
                oldMode: oldConfig.executionMode ?? 'paper',
                newMode: patch.executionMode,
                actualMode: executionEngine.getMode() // 使用新的 getMode()
            });
        } catch (error) {
            auditService.logWarn('[Config] Failed to change execution mode, falling back to paper', { 
                error: String(error),
                attemptedMode: patch.executionMode 
            });
            // 强制回退到paper模式
            if (executionEngine) {
                executionEngine.setMode('paper');
                liveConfig.executionMode = 'paper';
            }
            throw error; // 重新抛出错误，让前端能捕获
        }
    }

    // 检查资金使用上限是否发生变化
    if (patch.capitalUsageLimitPct !== undefined && 
        patch.capitalUsageLimitPct !== oldConfig.capitalUsageLimitPct) {
        
        const capPct = patch.capitalUsageLimitPct / 100;
        const capUsd = state.account.equityNowUsd * capPct;
        const exposureNowUsd = state.account.openPositions.reduce((sum, pos) => sum + pos.notionalUsd, 0);
        
        auditService.logInfo(`Capital usage limit updated: ${oldConfig.capitalUsageLimitPct}% → ${patch.capitalUsageLimitPct}%`);
        
        if (exposureNowUsd > capUsd) {
            auditService.logWarn(`Current exposure ($${exposureNowUsd.toFixed(2)}) exceeds new limit ($${capUsd.toFixed(2)})`);
            // 系统会在下一个 tick 自动进入降级模式
        }
    }
    
    console.log('Session config updated:', patch);
}

export function updateRiskLimits(patch: Partial<AccountRiskLimits>): AccountRiskLimits {
    accountRiskEngine.configure(patch);
    const updated = accountRiskEngine.getLimits();
    if (state) {
        state.riskLimits = updated;
        state.accountRiskState = accountRiskEngine.evaluate(state.account);
    }
    return updated;
}

export function getCurrentConfig(): UserSessionConfig {
    return liveConfig ? { ...liveConfig } : {} as UserSessionConfig;
}

export function startSnapshot(config?: UserSessionConfig): void {
    const snapshotConfig = config ?? liveConfig ?? DEFAULT_SESSION_CONFIG;
    startBackend(snapshotConfig);
    if (state?.session) {
        state.session.tradeEnabled = false;
        state.session.status = 'RUNNING';
        auditService.logInfo('Session switched to snapshot mode (trading disabled).');
    }
}

export function setTradeEnabled(enabled: boolean): void {
    if (!sessionInterval) {
        const fallbackConfig = liveConfig ?? DEFAULT_SESSION_CONFIG;
        startBackend(fallbackConfig);
    }

    if (!state?.session) {
        return;
    }

    if (state.session.tradeEnabled === enabled) {
        return;
    }

    state.session.tradeEnabled = enabled;
    state.session.status = 'RUNNING';
    const message = enabled ? 'Trading enabled (live automation).' : 'Trading paused; snapshot mode only.';
    auditService.logInfo(message);
}

export function getAiModelRegistry() {
    return getAvailableAiModels();
}

export function getCurrentAiConfig(): UserAIConfig {
    return { ...getUserAIConfig() };
}

export function updateUserAiConfig(partial: Partial<Omit<UserAIConfig, 'updatedAt'>>): UserAIConfig {
    return { ...updateUserAIConfig(partial) };
}

// 这些函数现在通过 getDashboardState() 获取完整状态
export async function fetchMarketData(): Promise<MarketData> {
    if (!state) {
        return {} as MarketData;
    }
    return state.market || {} as MarketData;
}

export async function fetchAccountState(): Promise<AccountState> {
    if (!state) {
        return {} as AccountState;
    }
    return state.account || {} as AccountState;
}

export function initializeBackend() {}

export async function resetPaperAccount(): Promise<void> {
    // Reset paper trading state to initial values
    if (!state || !liveConfig) {
        console.warn('[API] Cannot reset paper account: backend not initialized');
        return;
    }
    
    auditService.logInfo('[API] Resetting paper trading account');
    
    // Reinitialize state with current config
    state = getInitialState(liveConfig);
    
    // Clear shadow ledger
    shadowLedger.length = 0;
    
    // Reset execution engine if exists
    if (executionEngine) {
        // Execution engine will be reinitialized on next tick
    }
}

export async function resetShadowAccount(): Promise<void> {
    // Clear shadow ledger only
    auditService.logInfo('[API] Clearing shadow ledger');
    shadowLedger.length = 0;
}

export async function stopLiveTrading(): Promise<void> {
    // Stop live trading by disabling trade execution
    auditService.logInfo('[API] Stopping live trading');
    
    if (state && state.systemStatus) {
        state.systemStatus.tradeExecutionEnabled = false;
    }
    
    // Optionally close execution engine connection
    if (executionEngine) {
        // Keep engine alive but disable trading through state flag
    }
}

// --- ExecutionEngine Helper Functions ---

/**
 * 将TradeProposal转换为NominalOrderSignal
 */
function proposalsToSignals(
    proposals: TradeProposal[], 
    market: MarketData,
    config: UserSessionConfig
): NominalOrderSignal[] {
    return proposals
        .filter(p => p.action.includes('enter') && p.action !== 'hold')
        .map(p => {
            const marketTicker = market[p.symbol];
            if (!marketTicker || marketTicker.price <= 0) {
                return null;
            }
            
            // 默认使用T1 tier，实际tier会在ExecutionEngine内部通过whitelist验证
            return {
                symbol: p.symbol,
                side: p.action === 'buy_to_enter' ? 'BUY' : 'SELL',
                tier: 'T1' as RiskTierKey,
                targetLeverage: p.leverage,
                targetNominal: p.notionalUsd,
                confidence: p.confidence,
                allowMarket: true,
                portfolioId: process.env.PAPER_PORTFOLIO_ID ?? 'paper-default',
            } as NominalOrderSignal;
        })
        .filter((s): s is NominalOrderSignal => s !== null);
}

/**
 * 构建RiskEngineContext
 */
function buildExecContext(
    state: DashboardState,
    config: UserSessionConfig
): RiskEngineContext {
    // 构建AccountSnapshot
    const netWorth = state.account.equityNowUsd ?? 0;
    const totalExposure = state.account.openPositions.reduce((sum, pos) => sum + Math.abs(pos.notionalUsd || 0), 0);
    const symbolExposure = state.account.openPositions.reduce((acc, pos) => {
        acc[pos.symbol] = (acc[pos.symbol] || 0) + Math.abs(pos.notionalUsd || 0);
        return acc;
    }, {} as Record<string, number>);
    
    // 构建balances数组（简化版，只包含USDT余额）
    const balances = [{
        asset: 'USDT',
        free: state.account.availableCapital ?? 0,
        locked: 0,
    }];
    
    const account: AccountSnapshot = {
        balances,
        netWorth,
        totalExposure,
        symbolExposure,
        timestamp: Date.now(),
    };
    
    // 构建MarketQuote Map
    const quotes = new Map<string, MarketQuote>();
    Object.entries(state.market).forEach(([symbol, ticker]) => {
        if (ticker.price > 0) {
            quotes.set(symbol, {
                symbol,
                bestBid: ticker.bestBid ?? ticker.price,
                bestAsk: ticker.bestAsk ?? ticker.price,
                lastPrice: ticker.price,
                updatedAt: ticker.updatedAt ?? Date.now(),
            });
        }
    });
    
    // 确定RiskMode（从SystemMode映射）
    const riskMode: RiskMode = state.systemStatus.mode === 'NORMAL' ? 'NORMAL' :
                     state.systemStatus.mode === 'REDUCE_ONLY' ? 'COOL_DOWN' :
                     state.systemStatus.mode === 'EMERGENCY_LANDING' ? 'EMERGENCY' : 'NORMAL';
    
    return {
        account,
        quotes,
        mode: riskMode,
    };
}

/**
 * Mock执行回退函数（当ExecutionEngine未初始化时使用）
 */
function executeMockFallback(
    proposals: TradeProposal[], 
    clamp: AppliedRiskClamp, 
    tradingEnabled: boolean
): void {
    const approvedProposal = proposals.find(p => p.action.includes('enter') && !clamp.forbidNewEntries);
    if (approvedProposal && state.account.openPositions.length < clamp.maxConcurrentSymbols) {
        state.account.openPositions.push({
            symbol: approvedProposal.symbol,
            side: approvedProposal.action === 'buy_to_enter' ? 'LONG' : 'SHORT',
            entryPrice: state.market[approvedProposal.symbol].price,
            size: approvedProposal.notionalUsd / state.market[approvedProposal.symbol].price,
            leverage: approvedProposal.leverage,
            unrealizedPnl: 0,
            notionalUsd: approvedProposal.notionalUsd,
            stopLoss: approvedProposal.stopLoss,
            takeProfit: approvedProposal.takeProfit,
            invalidationCondition: approvedProposal.invalidationCondition,
        });
        auditService.logWarn('[Exec] Using Mock execution (ExecutionEngine not available)');
    }
}