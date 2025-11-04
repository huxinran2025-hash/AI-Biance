// TokenUsageTracker - Token使用追踪器
import { auditService } from '../audit';

export interface TokenUsageStats {
    dailyCalls: number;
    dailyTokens: number;
    averageTokensPerCall: number;
    lastCallTime: number;
    callsByType: Record<string, number>;
}

export class TokenUsageTracker {
    private stats: TokenUsageStats = {
        dailyCalls: 0,
        dailyTokens: 0,
        averageTokensPerCall: 0,
        lastCallTime: 0,
        callsByType: {},
    };
    private lastResetDate: number = new Date().setHours(0, 0, 0, 0);
    private readonly dailyLimit: number;
    private readonly tokensPerCall: number; // 估算每次AI调用的Token数

    constructor(dailyLimit: number = 1000000, tokensPerCall: number = 5000) {
        this.dailyLimit = dailyLimit;
        this.tokensPerCall = tokensPerCall;
    }

    /**
     * 记录一次AI调用
     */
    recordCall(type: string = 'ai_decision', actualTokens?: number): void {
        this.resetDailyStatsIfNeeded();

        const tokens = actualTokens ?? this.tokensPerCall;
        
        this.stats.dailyCalls++;
        this.stats.dailyTokens += tokens;
        this.stats.averageTokensPerCall = this.stats.dailyTokens / this.stats.dailyCalls;
        this.stats.lastCallTime = Date.now();

        if (!this.stats.callsByType[type]) {
            this.stats.callsByType[type] = 0;
        }
        this.stats.callsByType[type]++;

        // 检查是否超限
        if (this.stats.dailyTokens >= this.dailyLimit) {
            auditService.logWarn('[TokenTracker] Daily token limit reached', {
                dailyTokens: this.stats.dailyTokens,
                limit: this.dailyLimit,
            });
        }
    }

    /**
     * 检查是否可以继续调用
     */
    canCall(): boolean {
        this.resetDailyStatsIfNeeded();
        return this.stats.dailyTokens < this.dailyLimit;
    }

    /**
     * 获取剩余Token额度
     */
    getRemainingTokens(): number {
        this.resetDailyStatsIfNeeded();
        return Math.max(0, this.dailyLimit - this.stats.dailyTokens);
    }

    /**
     * 获取统计信息
     */
    getStats(): TokenUsageStats {
        this.resetDailyStatsIfNeeded();
        return { ...this.stats };
    }

    /**
     * 获取使用率
     */
    getUsageRate(): number {
        this.resetDailyStatsIfNeeded();
        return this.dailyLimit > 0 ? (this.stats.dailyTokens / this.dailyLimit) * 100 : 0;
    }

    /**
     * 重置每日统计
     */
    private resetDailyStatsIfNeeded(): void {
        const today = new Date().setHours(0, 0, 0, 0);
        if (today > this.lastResetDate) {
            this.stats = {
                dailyCalls: 0,
                dailyTokens: 0,
                averageTokensPerCall: 0,
                lastCallTime: 0,
                callsByType: {},
            };
            this.lastResetDate = today;
            auditService.logInfo('[TokenTracker] Daily stats reset');
        }
    }
}

// 全局单例
export const tokenUsageTracker = new TokenUsageTracker();

