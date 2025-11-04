// ExchangeRiskWatcherService - 监控交易所状态、稳定币和链健康的关键风险源
import { EventEmitter } from './utils/EventEmitter';
import { ExchangeHealthSnapshot, ExchangeRiskEvent, ExchangeStatus } from '../types';
import { auditService } from './audit';

export class ExchangeRiskWatcherService {
    public emitter = new EventEmitter();
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private readonly POLL_INTERVAL_MS = 30 * 1000; // 30秒轮询一次
    private currentHealth: Map<string, ExchangeHealthSnapshot> = new Map();
    private lastCheckTs = 0;

    // 监控的交易所和稳定币/链状态源
    private readonly MONITORED_SOURCES = [
        {
            id: 'binance',
            name: 'Binance',
            type: 'exchange' as const,
            statusUrl: 'https://www.binance.com/en/status',
            announcementUrl: 'https://www.binance.com/en/support/announcement',
            critical: true,
        },
        {
            id: 'usdt',
            name: 'Tether (USDT)',
            type: 'stablecoin' as const,
            statusUrl: 'https://tether.to/en/transparency/',
            announcementUrl: 'https://tether.to/en/news/',
            critical: true,
        },
        {
            id: 'usdc',
            name: 'USD Coin (USDC)',
            type: 'stablecoin' as const,
            statusUrl: 'https://www.circle.com/en/usdc',
            announcementUrl: 'https://www.circle.com/en/news',
            critical: true,
        },
        {
            id: 'solana',
            name: 'Solana Network',
            type: 'blockchain' as const,
            statusUrl: 'https://status.solana.com/',
            announcementUrl: 'https://solana.com/news',
            critical: true,
        },
        {
            id: 'ethereum',
            name: 'Ethereum Network',
            type: 'blockchain' as const,
            statusUrl: 'https://ethereum.org/en/developers/docs/networks/',
            announcementUrl: 'https://blog.ethereum.org/',
            critical: false, // 暂时设为非关键，因为以太坊相对稳定
        }
    ];

    constructor() {
        // 添加 CRITICAL 警告
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('⚠️  CRITICAL: ExchangeRiskWatcher is a STUB');
        console.error('⚠️  Real-time exchange risk monitoring is NOT active');
        console.error('⚠️  All exchange status checks return hardcoded "ok"');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        auditService.logError('[ExchangeRiskWatcher] CRITICAL: Exchange status check is a STUB and NOT monitoring real-time risk.');
        auditService.logInfo('ExchangeRiskWatcherService initialized');
    }

    public start(): void {
        if (this.intervalId) return;
        
        auditService.logInfo('Starting ExchangeRiskWatcherService polling...');
        
        // 环境检测：浏览器使用window.setInterval，Node.js使用setInterval
        const setIntervalFn = typeof window !== 'undefined' ? window.setInterval : setInterval;
        this.intervalId = setIntervalFn(() => this.pollAllSources(), this.POLL_INTERVAL_MS);
        
        // 立即执行一次检查
        this.pollAllSources();
    }

    public stop(): void {
        if (this.intervalId) {
            auditService.logInfo('Stopping ExchangeRiskWatcherService...');
            
            // 环境检测：浏览器使用window.clearInterval，Node.js使用clearInterval
            const clearIntervalFn = typeof window !== 'undefined' ? window.clearInterval : clearInterval;
            clearIntervalFn(this.intervalId);
            this.intervalId = null;
        }
    }

    public getCurrentHealth(): Map<string, ExchangeHealthSnapshot> {
        return new Map(this.currentHealth);
    }

    public getOverallRiskLevel(): 'ok' | 'degraded' | 'critical' {
        const healthSnapshots = Array.from(this.currentHealth.values());
        
        // 如果有任何关键源状态异常，返回 critical
        const criticalSources = healthSnapshots.filter(h => h.critical && h.status !== 'ok');
        if (criticalSources.length > 0) {
            return 'critical';
        }
        
        // 如果有任何源状态异常，返回 degraded
        const degradedSources = healthSnapshots.filter(h => h.status !== 'ok');
        if (degradedSources.length > 0) {
            return 'degraded';
        }
        
        return 'ok';
    }

    private async pollAllSources(): Promise<void> {
        const now = Date.now();
        this.lastCheckTs = now;

        for (const source of this.MONITORED_SOURCES) {
            try {
                const healthSnapshot = await this.checkSourceHealth(source);
                this.currentHealth.set(source.id, healthSnapshot);
                
                // 检查状态变化，如果从正常变为异常，触发风险事件
                this.checkForRiskEvents(source.id, healthSnapshot);
                
            } catch (error) {
                auditService.logError(`Failed to check ${source.name}: ${error}`);
                
                // 如果检查失败，标记为不可达
                const errorSnapshot: ExchangeHealthSnapshot = {
                    ts: now,
                    exchange: source.id,
                    status: 'unreachable',
                    lastGoodTs: this.currentHealth.get(source.id)?.lastGoodTs || now,
                    details: `检查失败: ${error}`,
                    critical: source.critical,
                };
                this.currentHealth.set(source.id, errorSnapshot);
            }
        }
    }

    private async checkSourceHealth(source: typeof this.MONITORED_SOURCES[0]): Promise<ExchangeHealthSnapshot> {
        const now = Date.now();
        
        // 模拟不同源的检查逻辑
        // 在实际实现中，这里会调用 Cloudflare Worker 或直接 HTTP 请求
        
        switch (source.type) {
            case 'exchange':
                return await this.checkExchangeStatus(source);
            case 'stablecoin':
                return await this.checkStablecoinStatus(source);
            case 'blockchain':
                return await this.checkBlockchainStatus(source);
        }
        // TypeScript 已知所有 case 已覆盖，这行永远不会执行
        throw new Error('Unknown source type');
    }

    private async checkExchangeStatus(source: typeof this.MONITORED_SOURCES[0]): Promise<ExchangeHealthSnapshot> {
        const now = Date.now();
        
        // STUB: 硬编码返回正常状态，不注入随机风险信号
        const status: ExchangeStatus = 'ok';
        const details = '所有系统正常运行（注意：这是存根实现，未监控真实状态）';
        
        return {
            ts: now,
            exchange: source.id,
            status,
            lastGoodTs: now,
            details,
            critical: source.critical,
        };
    }

    private async checkStablecoinStatus(source: typeof this.MONITORED_SOURCES[0]): Promise<ExchangeHealthSnapshot> {
        const now = Date.now();
        
        // STUB: 硬编码返回正常状态，不注入随机风险信号
        const status: ExchangeStatus = 'ok';
        const details = '所有系统正常运行（注意：这是存根实现，未监控真实状态）';
        
        return {
            ts: now,
            exchange: source.id,
            status,
            lastGoodTs: now,
            details,
            critical: source.critical,
        };
    }

    private async checkBlockchainStatus(source: typeof this.MONITORED_SOURCES[0]): Promise<ExchangeHealthSnapshot> {
        const now = Date.now();
        
        // STUB: 硬编码返回正常状态，不注入随机风险信号
        const status: ExchangeStatus = 'ok';
        const details = '所有系统正常运行（注意：这是存根实现，未监控真实状态）';
        
        return {
            ts: now,
            exchange: source.id,
            status,
            lastGoodTs: now,
            details,
            critical: source.critical,
        };
    }

    private checkForRiskEvents(sourceId: string, newSnapshot: ExchangeHealthSnapshot): void {
        const oldSnapshot = this.currentHealth.get(sourceId);
        
        // 如果状态从正常变为异常，触发风险事件
        if (oldSnapshot?.status === 'ok' && newSnapshot.status !== 'ok') {
            const riskEvent: ExchangeRiskEvent = {
                ts: newSnapshot.ts,
                sourceId,
                triggerReason: 'EXTERNAL_EXCHANGE_RISK',
                recommendedMode: this.getRecommendedMode(newSnapshot.status),
                details: newSnapshot.details,
                severity: newSnapshot.critical ? 'CRITICAL' : 'ELEVATED',
            };
            
            auditService.logSystemModeChange({
                ts: newSnapshot.ts,
                newMode: riskEvent.recommendedMode,
                triggerReason: riskEvent.triggerReason,
                externalContext: {
                    available: false,
                    environmentAdvisory: null,
                    disagreementLevel: null,
                    confidence: 0,
                    sourceMeta: {
                        status: 'unreachable',
                        reason: 'ExchangeRisk',
                        lastGoodTs: newSnapshot.lastGoodTs,
                    }
                },
                appliedRiskClamp: {
                    forbidNewEntries: true,
                    maxTotalExposurePct: 0.05,
                    maxConcurrentSymbols: 1,
                    modeLabel: riskEvent.recommendedMode,
                },
                currentPortfolioSnapshot: [],
                noteToHuman: `交易所风险检测: ${newSnapshot.details}`,
            });
            
            // 触发自定义事件，供其他模块监听
            this.emitter.emit('exchangeRiskDetected', riskEvent);
        }
    }

    private getRecommendedMode(status: ExchangeStatus): 'COOL_DOWN_EXTERNAL_UNSAFE' | 'EMERGENCY_LANDING' | 'REDUCE_ONLY' {
        switch (status) {
            case 'withdrawal_suspended':
            case 'trading_halted':
            case 'regulatory_action':
                return 'EMERGENCY_LANDING';
            case 'degraded':
                return 'COOL_DOWN_EXTERNAL_UNSAFE';
            default:
                return 'REDUCE_ONLY';
        }
    }

    // 获取所有监控源的摘要信息
    public getHealthSummary(): {
        overallRisk: 'ok' | 'degraded' | 'critical';
        criticalIssues: ExchangeHealthSnapshot[];
        allSources: ExchangeHealthSnapshot[];
        lastCheckTs: number;
    } {
        const allSources = Array.from(this.currentHealth.values());
        const criticalIssues = allSources.filter(s => s.critical && s.status !== 'ok');
        
        return {
            overallRisk: this.getOverallRiskLevel(),
            criticalIssues,
            allSources,
            lastCheckTs: this.lastCheckTs,
        };
    }
}

export const exchangeRiskWatcher = new ExchangeRiskWatcherService();
