// TickScheduler - 统一Tick调度器
import { eventBus } from './EventBus';
import { auditService } from '../audit';

export type TickType = 'frequent' | 'medium' | 'low' | 'ai_decision';

export interface TickConfig {
    frequentTickMs: number;      // 高频Tick间隔（默认2秒）
    mediumTickMs: number;         // 中频Tick间隔（默认10秒）
    lowTickMs: number;             // 低频Tick间隔（默认30秒）
}

export interface TickHandler {
    name: string;
    tickType: TickType;
    handler: () => void | Promise<void>;
    enabled?: boolean;
}

export class TickScheduler {
    private config: TickConfig;
    private handlers: Map<TickType, TickHandler[]> = new Map();
    private intervals: Map<TickType, number | null> = new Map();
    private isRunning = false;
    private lastTickTime: Map<TickType, number> = new Map();

    constructor(config: TickConfig) {
        this.config = config;
        this.handlers.set('frequent', []);
        this.handlers.set('medium', []);
        this.handlers.set('low', []);
        this.handlers.set('ai_decision', []);
        this.intervals.set('frequent', null);
        this.intervals.set('medium', null);
        this.intervals.set('low', null);
        this.intervals.set('ai_decision', null);
    }

    /**
     * 注册Tick处理器
     */
    register(handler: TickHandler): void {
        const handlers = this.handlers.get(handler.tickType) || [];
        handlers.push(handler);
        this.handlers.set(handler.tickType, handlers);
    }

    /**
     * 取消注册
     */
    unregister(name: string): void {
        for (const [type, handlers] of this.handlers.entries()) {
            const index = handlers.findIndex(h => h.name === name);
            if (index >= 0) {
                handlers.splice(index, 1);
                this.handlers.set(type, handlers);
                break;
            }
        }
    }

    /**
     * 启动调度器
     */
    start(): void {
        if (this.isRunning) {
            auditService.logWarn('[TickScheduler] Already running');
            return;
        }

        this.isRunning = true;
        auditService.logInfo('[TickScheduler] Starting unified tick scheduler');

        // 启动高频Tick
        this.startFrequentTick();
        
        // 启动中频Tick
        this.startMediumTick();
        
        // 启动低频Tick
        this.startLowTick();

        // AI决策由事件驱动，不在这里启动定时器
        this.setupAIDecisionListener();
    }

    /**
     * 停止调度器
     */
    stop(): void {
        if (!this.isRunning) return;

        this.isRunning = false;
        auditService.logInfo('[TickScheduler] Stopping unified tick scheduler');

        // 清除所有定时器
        this.intervals.forEach((interval, type) => {
            if (interval !== null) {
                clearInterval(interval);
                this.intervals.set(type, null);
            }
        });
    }

    /**
     * 手动触发一次指定类型的Tick
     */
    async trigger(tickType: TickType): Promise<void> {
        const handlers = this.handlers.get(tickType) || [];
        const enabledHandlers = handlers.filter(h => h.enabled !== false);

        for (const handler of enabledHandlers) {
            try {
                await handler.handler();
            } catch (error) {
                auditService.logError(`[TickScheduler] Error in ${handler.name}:`, {
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        this.lastTickTime.set(tickType, Date.now());
    }

    /**
     * 获取上次Tick时间
     */
    getLastTickTime(tickType: TickType): number | undefined {
        return this.lastTickTime.get(tickType);
    }

    /**
     * 获取处理器统计
     */
    getStats(): Record<TickType, { count: number; enabled: number }> {
        const stats: any = {};
        for (const [type, handlers] of this.handlers.entries()) {
            stats[type] = {
                count: handlers.length,
                enabled: handlers.filter(h => h.enabled !== false).length,
            };
        }
        return stats;
    }

    private startFrequentTick(): void {
        const interval = window.setInterval(() => {
            this.trigger('frequent').catch(err => {
                auditService.logError('[TickScheduler] Frequent tick error:', { error: String(err) });
            });
        }, this.config.frequentTickMs);
        this.intervals.set('frequent', interval);
        this.lastTickTime.set('frequent', Date.now());
        
        // 立即执行一次
        this.trigger('frequent');
    }

    private startMediumTick(): void {
        const interval = window.setInterval(() => {
            this.trigger('medium').catch(err => {
                auditService.logError('[TickScheduler] Medium tick error:', { error: String(err) });
            });
        }, this.config.mediumTickMs);
        this.intervals.set('medium', interval);
        this.lastTickTime.set('medium', Date.now());
        
        // 立即执行一次
        this.trigger('medium');
    }

    private startLowTick(): void {
        const interval = window.setInterval(() => {
            this.trigger('low').catch(err => {
                auditService.logError('[TickScheduler] Low tick error:', { error: String(err) });
            });
        }, this.config.lowTickMs);
        this.intervals.set('low', interval);
        this.lastTickTime.set('low', Date.now());
        
        // 立即执行一次
        this.trigger('low');
    }

    private setupAIDecisionListener(): void {
        // AI决策由事件驱动，监听相关事件
        const aiTriggerEvents: Array<'market_change' | 'balance_change' | 'news_event' | 'kline_pattern' | 'position_change'> = [
            'market_change',
            'balance_change',
            'news_event',
            'kline_pattern',
            'position_change',
        ];

        aiTriggerEvents.forEach(eventType => {
            eventBus.on(eventType, () => {
                this.trigger('ai_decision').catch(err => {
                    auditService.logError('[TickScheduler] AI decision trigger error:', { error: String(err) });
                });
            });
        });
    }
}

