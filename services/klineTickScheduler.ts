/**
 * K线TICK调度器
 * 负责决定何时向AI发送K线数据（TICK）
 * 初始实现：10分钟固定间隔
 */

import { KlineSnapshot } from '../types';

export interface TokenUsageStats {
  dailyKlineTicks: number;
  dailyKlineTokens: number;
  averageTokensPerTick: number;
  triggerTypeDistribution: Record<string, number>;
}

export class KlineTickScheduler {
  private lastTick: number = 0;
  private minInterval: number = 2 * 60 * 1000;  // 最小2分钟
  private maxInterval: number = 30 * 60 * 1000; // 最大30分钟
  private defaultInterval: number = 10 * 60 * 1000; // 默认10分钟
  private dailyStats: TokenUsageStats = {
    dailyKlineTicks: 0,
    dailyKlineTokens: 0,
    averageTokensPerTick: 0,
    triggerTypeDistribution: {},
  };
  private lastResetDate: number = new Date().setHours(0, 0, 0, 0);

  /**
   * 检查是否应该触发TICK
   * @param snapshot 当前K线快照
   * @returns {shouldTick: boolean, triggerType?: string}
   */
  shouldTick(snapshot: KlineSnapshot): { shouldTick: boolean; triggerType?: string } {
    const now = Date.now();
    const timeSinceLastTick = now - this.lastTick;

    // 重置每日统计
    this.resetDailyStatsIfNeeded();

    // 1. 检查时间兜底（最大间隔）
    if (timeSinceLastTick >= this.maxInterval) {
      this.lastTick = now;
      this.recordTick('time_fallback');
      return { shouldTick: true, triggerType: 'time_fallback' };
    }

    // 2. 检查默认间隔（固定10分钟）
    if (timeSinceLastTick >= this.defaultInterval) {
      this.lastTick = now;
      this.recordTick('fixed_interval');
      return { shouldTick: true, triggerType: 'fixed_interval' };
    }

    // 3. 检查最小间隔（防止过于频繁）
    if (timeSinceLastTick < this.minInterval) {
      return { shouldTick: false };
    }

    // TODO: 未来可以实现智能触发机制
    // - 价格突破触发
    // - 形态完成触发
    // - 成交量异常触发
    // - 指标信号触发

    return { shouldTick: false };
  }

  /**
   * 手动触发一次TICK（用于测试或特殊情况）
   */
  forceTick(): void {
    this.lastTick = Date.now();
    this.recordTick('manual');
  }

  /**
   * 获取每日统计信息
   */
  getDailyStats(): TokenUsageStats {
    this.resetDailyStatsIfNeeded();
    return { ...this.dailyStats };
  }

  /**
   * 估算单次TICK的Token消耗
   */
  estimateTokensPerTick(): number {
    // 估算：100根K线 × 6个字段 ≈ 300-500 tokens
    // 技术指标数据 ≈ 100-200 tokens
    // 总计约 400-700 tokens，取平均值 550
    return 550;
  }

  /**
   * 记录一次TICK
   */
  private recordTick(triggerType: string): void {
    this.dailyStats.dailyKlineTicks++;
    const tokens = this.estimateTokensPerTick();
    this.dailyStats.dailyKlineTokens += tokens;
    this.dailyStats.averageTokensPerTick = 
      this.dailyStats.dailyKlineTokens / this.dailyStats.dailyKlineTicks;
    
    if (!this.dailyStats.triggerTypeDistribution[triggerType]) {
      this.dailyStats.triggerTypeDistribution[triggerType] = 0;
    }
    this.dailyStats.triggerTypeDistribution[triggerType]++;
  }

  /**
   * 如果需要，重置每日统计
   */
  private resetDailyStatsIfNeeded(): void {
    const today = new Date().setHours(0, 0, 0, 0);
    if (today > this.lastResetDate) {
      this.dailyStats = {
        dailyKlineTicks: 0,
        dailyKlineTokens: 0,
        averageTokensPerTick: 0,
        triggerTypeDistribution: {},
      };
      this.lastResetDate = today;
    }
  }

  /**
   * 获取上次TICK时间
   */
  getLastTickTime(): number {
    return this.lastTick;
  }

  /**
   * 获取下次预计TICK时间
   */
  getNextTickTime(): number {
    return this.lastTick + this.defaultInterval;
  }
}
