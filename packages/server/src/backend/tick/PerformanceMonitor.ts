// PerformanceMonitor - 性能监控器
import { auditService } from '../audit';

export interface PerformanceMetrics {
    tickCount: number;
    averageTickTime: number;
    maxTickTime: number;
    slowTicks: number;
    errors: number;
    lastTickTime: number;
}

export class PerformanceMonitor {
    private metrics: PerformanceMetrics = {
        tickCount: 0,
        averageTickTime: 0,
        maxTickTime: 0,
        slowTicks: 0,
        errors: 0,
        lastTickTime: 0,
    };
    private tickTimes: number[] = [];
    private readonly MAX_SAMPLES = 100;
    private readonly SLOW_THRESHOLD_MS = 1000; // 1秒

    /**
     * 记录一次Tick执行
     */
    recordTick(duration: number, hasError: boolean = false): void {
        this.metrics.tickCount++;
        this.metrics.lastTickTime = Date.now();

        // 记录执行时间
        this.tickTimes.push(duration);
        if (this.tickTimes.length > this.MAX_SAMPLES) {
            this.tickTimes.shift();
        }

        // 计算平均值
        const sum = this.tickTimes.reduce((a, b) => a + b, 0);
        this.metrics.averageTickTime = sum / this.tickTimes.length;

        // 更新最大值
        if (duration > this.metrics.maxTickTime) {
            this.metrics.maxTickTime = duration;
        }

        // 记录慢Tick
        if (duration > this.SLOW_THRESHOLD_MS) {
            this.metrics.slowTicks++;
            auditService.logWarn('[PerformanceMonitor] Slow tick detected', {
                duration,
                threshold: this.SLOW_THRESHOLD_MS,
            });
        }

        // 记录错误
        if (hasError) {
            this.metrics.errors++;
        }

        // 如果平均时间超过阈值，发出警告
        if (this.metrics.averageTickTime > this.SLOW_THRESHOLD_MS * 2) {
            auditService.logWarn('[PerformanceMonitor] System performance degraded', {
                averageTickTime: this.metrics.averageTickTime,
                slowTicks: this.metrics.slowTicks,
            });
        }
    }

    /**
     * 记录错误
     */
    recordError(): void {
        this.metrics.errors++;
    }

    /**
     * 获取性能指标
     */
    getMetrics(): PerformanceMetrics {
        return { ...this.metrics };
    }

    /**
     * 检查系统是否健康
     */
    isHealthy(): boolean {
        return (
            this.metrics.averageTickTime < this.SLOW_THRESHOLD_MS * 2 &&
            this.metrics.errors < 10
        );
    }

    /**
     * 重置统计
     */
    reset(): void {
        this.metrics = {
            tickCount: 0,
            averageTickTime: 0,
            maxTickTime: 0,
            slowTicks: 0,
            errors: 0,
            lastTickTime: 0,
        };
        this.tickTimes = [];
    }
}

// 全局单例
export const performanceMonitor = new PerformanceMonitor();

