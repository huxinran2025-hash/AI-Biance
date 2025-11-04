// LowTickHandler - 低频Tick处理器（30秒）
// 负责：RSS新闻轮询、交易所风险监控、新闻信号更新
import { auditService } from '../audit';
import { rssWatcher } from '../rssWatcher';
import { exchangeRiskWatcher } from '../exchangeRiskWatcher';
import { newsSignalService } from '../news';
import { eventBus } from './EventBus';
import type { DashboardState, RssEvent, StoredArticle, ExternalAlert } from '../../types';

// 用于转换RssEvent到StoredArticle
function toExternalAlert(event: RssEvent): ExternalAlert {
    return {
        idHash: event.idHash,
        source: event.source,
        title: event.title,
        link: event.link,
        publishedAt: event.publishedAt,
        severity: event.severity,
        topic: event.topic,
        summary: event.summary,
    };
}

export class LowTickHandler {
    private lastRssPollTs = 0;
    private readonly RECENT_ALERT_WINDOW_MS = 10 * 60 * 1000; // 10分钟
    private isEnabled = true;
    private cachedExternalAlerts: ExternalAlert[] = [];

    /**
     * 执行低频Tick
     */
    async handle(state: DashboardState): Promise<void> {
        if (!this.isEnabled) return;

        const startTime = Date.now();

        try {
            // 1. RSS新闻轮询
            await this.pollRssEvents(state);

            // 2. 交易所风险监控（exchangeRiskWatcher有自己的定时器，这里只是获取状态）
            // 不需要重复轮询，exchangeRiskWatcher会自己管理

            // 3. 新闻信号更新
            this.updateNewsSignals(state);

            const duration = Date.now() - startTime;
            if (duration > 2000) {
                auditService.logWarn('[LowTick] Slow execution', { duration });
            }
        } catch (error) {
            auditService.logError('[LowTick] Error:', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * 轮询RSS事件
     */
    private async pollRssEvents(state: DashboardState): Promise<void> {
        try {
            const rssEvents = await rssWatcher.pollRssEventsSince(this.lastRssPollTs, { 
                maxAgeMs: this.RECENT_ALERT_WINDOW_MS 
            });

            if (rssEvents.length > 0) {
                auditService.logInfo(`[LowTick] Fetched ${rssEvents.length} new RSS events`);
                
                // 检查是否有重要新闻事件
                const criticalEvents = rssEvents.filter(e => 
                    e.severity === 'critical' && 
                    (e.topic === 'regulator' || e.topic === 'exchange' || e.topic === 'stablecoin')
                );

                if (criticalEvents.length > 0) {
                    auditService.logWarn(`[LowTick] Critical news events detected: ${criticalEvents.length}`);
                    eventBus.emit('news_event', {
                        events: criticalEvents,
                        count: criticalEvents.length,
                    });
                }

                // 更新缓存的RSS事件
                this.updateRssEvents(rssEvents);
                
                // 更新RSS轮询时间戳
                if (rssEvents.length > 0) {
                    this.lastRssPollTs = Math.max(
                        this.lastRssPollTs, 
                        ...rssEvents.map(e => e.publishedAt)
                    );
                }
            }
        } catch (error) {
            // 静默失败，不影响主流程
            const errorStr = String(error);
            const isClientError = errorStr.includes('40') || errorStr.includes('401') || errorStr.includes('403') || errorStr.includes('404');
            const isTimeout = errorStr.includes('timeout') || errorStr.includes('Timeout');
            
            if (!isClientError && !isTimeout) {
                auditService.logWarn('[LowTick] RSS poll failed:', { error: errorStr });
            }
        }
    }

    /**
     * 更新新闻信号和聚合RSS数据
     */
    private updateNewsSignals(state: DashboardState): void {
        try {
            const now = Date.now();
            
            // 处理并缓存外部警报
            const newAlerts = this.cachedExternalAlerts.map(toExternalAlert);
            const alertMap = new Map<string, ExternalAlert>();
            const combinedAlerts = [...this.cachedExternalAlerts, ...newAlerts];
            combinedAlerts.forEach(alert => {
                if (now - alert.publishedAt <= this.RECENT_ALERT_WINDOW_MS) {
                    alertMap.set(alert.idHash, alert);
                }
            });
            this.cachedExternalAlerts = Array.from(alertMap.values()).sort((a, b) => b.publishedAt - a.publishedAt);
            
            // 更新状态
            state.account.externalAlerts = this.cachedExternalAlerts;
            state.recentExternalAlerts = this.cachedExternalAlerts.slice(0, 10);
            
            // 统计关键警报
            const criticalAlerts = this.cachedExternalAlerts.filter(a => 
                a.severity === 'critical' && (a.topic === 'regulator' || a.topic === 'exchange')
            );
            if (criticalAlerts.length > 0) {
                auditService.logWarn(`[LowTick] Active critical external alerts: ${criticalAlerts.length}`, {
                    alerts: criticalAlerts.map(a => ({ source: a.source, title: a.title, topic: a.topic }))
                });
            }
            
            // 聚合RSS数据到riskNews
            this.aggregateRiskNews(state, now);
        } catch (error) {
            auditService.logWarn('[LowTick] News signals update failed:', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * 聚合风险新闻（从原来的api.ts迁移）
     */
    private aggregateRiskNews(state: DashboardState, now: number): void {
        try {
            // 获取两路数据源
            const articlesA: StoredArticle[] = newsSignalService.getLatestArticles() ?? [];
            
            // 将RssEvent转换为StoredArticle格式
            const articlesB: StoredArticle[] = this.cachedExternalAlerts.map(alert => ({
                idHash: alert.idHash,
                feedId: alert.source || 'external',
                feedLabel: alert.source || 'External',
                title: alert.title,
                link: alert.link ?? '',
                publishedAt: alert.publishedAt,
                snippet: alert.summary ?? '',
                critical: alert.severity === 'critical',
                category: alert.topic === 'regulator' ? 'regulation' : 
                         alert.topic === 'exchange' ? 'exchange' : 
                         alert.topic === 'macro' ? 'macro' : 'crypto' as any,
            }));
            
            // 合并去重（同源同标题24h内最多2条）
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
            auditService.logWarn('[LowTick] Failed to aggregate risk news, using local articles only', { 
                error: error instanceof Error ? error.message : String(error) 
            });
        }
    }

    /**
     * 更新缓存的RSS事件（由pollRssEvents调用）
     */
    updateRssEvents(rssEvents: RssEvent[]): void {
        if (rssEvents.length > 0) {
            const newAlerts = rssEvents.map(toExternalAlert);
            const alertMap = new Map<string, ExternalAlert>();
            const combinedAlerts = [...this.cachedExternalAlerts, ...newAlerts];
            const now = Date.now();
            
            combinedAlerts.forEach(alert => {
                if (now - alert.publishedAt <= this.RECENT_ALERT_WINDOW_MS) {
                    alertMap.set(alert.idHash, alert);
                }
            });
            
            this.cachedExternalAlerts = Array.from(alertMap.values()).sort((a, b) => b.publishedAt - a.publishedAt);
        }
    }

    /**
     * 设置初始RSS轮询时间戳
     */
    setLastRssPollTs(ts: number): void {
        this.lastRssPollTs = ts;
    }

    /**
     * 获取上次RSS轮询时间戳
     */
    getLastRssPollTs(): number {
        return this.lastRssPollTs;
    }

    /**
     * 启用/禁用
     */
    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
    }
}

