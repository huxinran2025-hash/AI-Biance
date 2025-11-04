// AIDecisionTrigger - AI决策触发器，基于事件驱动和条件检查
import { eventBus } from './EventBus';
import { auditService } from '../audit';
import { tokenUsageTracker } from './TokenUsageTracker';
import { performanceMonitor } from './PerformanceMonitor';
import type { DashboardState, MarketData, AccountState } from '../../types';

export interface AIDecisionConfig {
    minIntervalMs: number;           // 最小间隔（默认15秒）
    fallbackIntervalMs: number;       // 兜底间隔（默认30秒）
    marketChangeThreshold: number;    // 市场变化阈值（默认1%）
    balanceChangeThreshold: number;   // 余额变化阈值（默认0.1%）
}

export class AIDecisionTrigger {
    private config: AIDecisionConfig;
    private lastDecisionTime = 0;
    private lastMarketPrices: Map<string, number> = new Map();
    private lastBalance = 0;
    private fallbackTimer: number | null = null;
    private decisionCallback: (() => Promise<void>) | null = null;
    private isEnabled = true;

    constructor(config: Partial<AIDecisionConfig> = {}) {
        this.config = {
            minIntervalMs: config.minIntervalMs ?? 15000,
            fallbackIntervalMs: config.fallbackIntervalMs ?? 30000,
            marketChangeThreshold: config.marketChangeThreshold ?? 0.01, // 1%
            balanceChangeThreshold: config.balanceChangeThreshold ?? 0.001, // 0.1%
        };
    }

    /**
     * 设置AI决策回调函数
     */
    setDecisionCallback(callback: () => Promise<void>): void {
        this.decisionCallback = callback;
    }

    /**
     * 启动触发器
     */
    start(): void {
        if (!this.isEnabled) return;

        // 监听各种事件
        this.setupEventListeners();

        // 启动兜底定时器
        this.startFallbackTimer();

        auditService.logInfo('[AIDecisionTrigger] Started');
    }

    /**
     * 停止触发器
     */
    stop(): void {
        this.isEnabled = false;
        if (this.fallbackTimer !== null) {
            clearTimeout(this.fallbackTimer);
            this.fallbackTimer = null;
        }
        eventBus.clear();
        auditService.logInfo('[AIDecisionTrigger] Stopped');
    }

    /**
     * 检查市场数据变化
     */
    checkMarketChange(market: MarketData): boolean {
        let hasSignificantChange = false;

        for (const [symbol, ticker] of Object.entries(market)) {
            if (!ticker || !ticker.price || ticker.price <= 0) continue;

            const lastPrice = this.lastMarketPrices.get(symbol);
            if (lastPrice !== undefined) {
                const changePct = Math.abs((ticker.price - lastPrice) / lastPrice);
                if (changePct >= this.config.marketChangeThreshold) {
                    hasSignificantChange = true;
                    auditService.logInfo(`[AIDecisionTrigger] Market change detected: ${symbol} ${(changePct * 100).toFixed(2)}%`);
                    break;
                }
            }
            this.lastMarketPrices.set(symbol, ticker.price);
        }

        return hasSignificantChange;
    }

    /**
     * 检查余额变化
     */
    checkBalanceChange(balance: number): boolean {
        if (this.lastBalance === 0) {
            this.lastBalance = balance;
            return false;
        }

        const changePct = Math.abs((balance - this.lastBalance) / this.lastBalance);
        if (changePct >= this.config.balanceChangeThreshold) {
            this.lastBalance = balance;
            auditService.logInfo(`[AIDecisionTrigger] Balance change detected: ${(changePct * 100).toFixed(2)}%`);
            return true;
        }

        return false;
    }

    /**
     * 手动触发AI决策（用于测试或特殊情况）
     */
    async triggerDecision(reason: string): Promise<void> {
        if (!this.isEnabled || !this.decisionCallback) return;

        const now = Date.now();
        const timeSinceLastDecision = now - this.lastDecisionTime;

        if (timeSinceLastDecision < this.config.minIntervalMs) {
            auditService.logInfo(`[AIDecisionTrigger] Skipped (too soon): ${timeSinceLastDecision}ms < ${this.config.minIntervalMs}ms`);
            return;
        }

        // 检查Token使用限制
        if (!tokenUsageTracker.canCall()) {
            auditService.logWarn('[AIDecisionTrigger] Token limit reached, skipping AI decision');
            return;
        }

        auditService.logInfo(`[AIDecisionTrigger] Triggering AI decision: ${reason}`);
        this.lastDecisionTime = now;

        const startTime = Date.now();
        let hasError = false;

        try {
            // 记录Token使用
            tokenUsageTracker.recordCall('ai_decision');

            await this.decisionCallback();
            
            // 重置兜底定时器
            this.startFallbackTimer();
        } catch (error) {
            hasError = true;
            auditService.logError('[AIDecisionTrigger] Error in decision callback:', {
                error: error instanceof Error ? error.message : String(error)
            });
            performanceMonitor.recordError();
        } finally {
            // 记录性能指标
            const duration = Date.now() - startTime;
            performanceMonitor.recordTick(duration, hasError);
        }
    }

    /**
     * 更新状态（由外部调用，用于检查变化）
     */
    updateState(state: DashboardState): void {
        if (!this.isEnabled) return;

        let shouldTrigger = false;
        let reason = '';

        // 检查市场变化
        if (this.checkMarketChange(state.market)) {
            shouldTrigger = true;
            reason = 'market_change';
        }

        // 检查余额变化
        const currentBalance = state.account.availableCapital || state.account.totalCapital || 0;
        if (this.checkBalanceChange(currentBalance)) {
            shouldTrigger = true;
            reason = reason ? `${reason}+balance_change` : 'balance_change';
        }

        if (shouldTrigger) {
            this.triggerDecision(reason).catch(err => {
                auditService.logError('[AIDecisionTrigger] Failed to trigger decision:', { error: String(err) });
            });
        }
    }

    /**
     * 获取统计信息
     */
    getStats(): {
        lastDecisionTime: number;
        timeSinceLastDecision: number;
        isEnabled: boolean;
    } {
        return {
            lastDecisionTime: this.lastDecisionTime,
            timeSinceLastDecision: Date.now() - this.lastDecisionTime,
            isEnabled: this.isEnabled,
        };
    }

    private setupEventListeners(): void {
        // 监听市场变化事件
        eventBus.on('market_change', (payload) => {
            this.triggerDecision('event:market_change').catch(err => {
                auditService.logError('[AIDecisionTrigger] Event handler error:', { error: String(err) });
            });
        });

        // 监听余额变化事件
        eventBus.on('balance_change', (payload) => {
            if (payload.data?.balance) {
                this.checkBalanceChange(payload.data.balance);
            }
            this.triggerDecision('event:balance_change').catch(err => {
                auditService.logError('[AIDecisionTrigger] Event handler error:', { error: String(err) });
            });
        });

        // 监听新闻事件
        eventBus.on('news_event', (payload) => {
            this.triggerDecision('event:news_event').catch(err => {
                auditService.logError('[AIDecisionTrigger] Event handler error:', { error: String(err) });
            });
        });

        // 监听K线形态事件
        eventBus.on('kline_pattern', (payload) => {
            this.triggerDecision('event:kline_pattern').catch(err => {
                auditService.logError('[AIDecisionTrigger] Event handler error:', { error: String(err) });
            });
        });

        // 监听持仓变化事件
        eventBus.on('position_change', (payload) => {
            this.triggerDecision('event:position_change').catch(err => {
                auditService.logError('[AIDecisionTrigger] Event handler error:', { error: String(err) });
            });
        });
    }

    private startFallbackTimer(): void {
        if (this.fallbackTimer !== null) {
            clearTimeout(this.fallbackTimer);
        }

        this.fallbackTimer = window.setTimeout(() => {
            const timeSinceLastDecision = Date.now() - this.lastDecisionTime;
            if (timeSinceLastDecision >= this.config.fallbackIntervalMs) {
                this.triggerDecision('fallback_timer').catch(err => {
                    auditService.logError('[AIDecisionTrigger] Fallback timer error:', { error: String(err) });
                });
            } else {
                // 如果还没到时间，继续设置定时器
                this.startFallbackTimer();
            }
        }, this.config.fallbackIntervalMs) as any;
    }
}

