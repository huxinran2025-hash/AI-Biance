// EventBus - 事件总线，用于组件间通信和事件驱动的AI决策
type EventType = 
    | 'market_change'          // 市场数据显著变化
    | 'balance_change'         // 账户余额变化
    | 'news_event'              // 重要新闻事件
    | 'kline_pattern'           // K线形态完成
    | 'position_change'         // 持仓变化
    | 'risk_alert'              // 风险警报
    | 'system_mode_change';     // 系统模式变化

interface EventPayload {
    type: EventType;
    timestamp: number;
    data?: any;
}

type EventHandler = (payload: EventPayload) => void | Promise<void>;

export class EventBus {
    private handlers: Map<EventType, Set<EventHandler>> = new Map();
    private eventHistory: EventPayload[] = [];
    private readonly MAX_HISTORY = 100;
    private debounceTimers: Map<EventType, number> = new Map();
    private readonly DEBOUNCE_MS = 1000; // 1秒防抖

    /**
     * 订阅事件
     */
    on(eventType: EventType, handler: EventHandler): () => void {
        if (!this.handlers.has(eventType)) {
            this.handlers.set(eventType, new Set());
        }
        this.handlers.get(eventType)!.add(handler);

        // 返回取消订阅函数
        return () => {
            this.handlers.get(eventType)?.delete(handler);
        };
    }

    /**
     * 取消订阅
     */
    off(eventType: EventType, handler: EventHandler): void {
        this.handlers.get(eventType)?.delete(handler);
    }

    /**
     * 发布事件（带防抖）
     */
    emit(eventType: EventType, data?: any): void {
        const now = Date.now();
        
        // 防抖：如果相同事件在短时间内重复触发，只执行最后一次
        const lastEmit = this.debounceTimers.get(eventType);
        if (lastEmit && now - lastEmit < this.DEBOUNCE_MS) {
            // 清除之前的定时器，重新设置
            clearTimeout(this.debounceTimers.get(eventType)!);
        }

        const timer = window.setTimeout(() => {
            const payload: EventPayload = {
                type: eventType,
                timestamp: now,
                data,
            };

            // 记录到历史
            this.eventHistory.push(payload);
            if (this.eventHistory.length > this.MAX_HISTORY) {
                this.eventHistory.shift();
            }

            // 触发所有订阅者
            const handlers = this.handlers.get(eventType);
            if (handlers) {
                handlers.forEach(handler => {
                    try {
                        handler(payload);
                    } catch (error) {
                        console.error(`[EventBus] Error in handler for ${eventType}:`, error);
                    }
                });
            }

            this.debounceTimers.delete(eventType);
        }, this.DEBOUNCE_MS);

        this.debounceTimers.set(eventType, timer as any);
    }

    /**
     * 立即发布事件（不防抖）
     */
    emitImmediate(eventType: EventType, data?: any): void {
        const payload: EventPayload = {
            type: eventType,
            timestamp: Date.now(),
            data,
        };

        this.eventHistory.push(payload);
        if (this.eventHistory.length > this.MAX_HISTORY) {
            this.eventHistory.shift();
        }

        const handlers = this.handlers.get(eventType);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(payload);
                } catch (error) {
                    console.error(`[EventBus] Error in handler for ${eventType}:`, error);
                }
            });
        }
    }

    /**
     * 获取事件历史
     */
    getHistory(eventType?: EventType, limit = 10): EventPayload[] {
        let events = this.eventHistory;
        if (eventType) {
            events = events.filter(e => e.type === eventType);
        }
        return events.slice(-limit);
    }

    /**
     * 清除所有订阅
     */
    clear(): void {
        this.handlers.clear();
        this.debounceTimers.forEach(timer => clearTimeout(timer));
        this.debounceTimers.clear();
    }
}

// 全局单例
export const eventBus = new EventBus();

