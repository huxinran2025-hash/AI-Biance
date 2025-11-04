import { 
    LogEntry, 
    TradeDecision,
    SafetySnapshotBundle,
    TradeAttribution,
    ExternalAlert,
} from '../types';

class AuditService {
    private history: LogEntry[] = [];
    private readonly MAX_LOG_SIZE = 200;

    private addEntry(entry: LogEntry) {
        this.history.unshift(entry);
        if (this.history.length > this.MAX_LOG_SIZE) {
            this.history.pop();
        }
        console.log(`[Audit] ${entry.type}: ${entry.message}`, (entry as any).details || '');
    }

    logInfo(message: string, details?: any) {
        this.addEntry({
            timestamp: Date.now(),
            type: 'INFO',
            message,
            details
        });
    }

    logWarn(message: string, details?: any) {
        this.addEntry({
            timestamp: Date.now(),
            type: 'WARN',
            message,
            details,
        });
    }

    logError(message: string, details?: any) {
        this.addEntry({
            timestamp: Date.now(),
            type: 'ERROR',
            message,
            details,
        });
    }
    
    logStrategy(message: string, details?: any) {
        this.addEntry({
            timestamp: Date.now(),
            type: 'STRATEGY',
            message,
        });
    }

    logTrade(message: string, decision: TradeDecision) {
        this.addEntry({
            timestamp: Date.now(),
            type: 'TRADE',
            message: message,
            details: decision
        });
    }

    logSystemModeChange(snapshot: SafetySnapshotBundle) {
        this.addEntry({
            timestamp: Date.now(),
            type: 'SYSTEM_MODE_CHANGE',
            message: `System mode changed to ${snapshot.newMode} due to ${snapshot.triggerReason}`,
            details: snapshot,
        });
    }

    logAttribution(attribution: TradeAttribution) {
        this.addEntry({
            timestamp: Date.now(),
            type: 'ATTRIBUTION',
            message: `Attribution logged for ${attribution.symbol}. Outcome: ${attribution.mergedOutcome}`,
            details: attribution,
        });
    }

    logExternalAlertCooldown(alerts: ExternalAlert[]) {
        this.logWarn('External alert triggered cooldown', {
            alerts: alerts.map(alert => ({
                source: alert.source,
                title: alert.title,
                publishedAt: alert.publishedAt,
                severity: alert.severity,
                topic: alert.topic,
            })),
        });
    }

    /**
     * 记录AI提示词审计信息
     * 用于追踪每次AI决策的完整输入上下文
     */
    logPrompt(params: {
        ts: number;
        sessionId: string;
        model: string;
        modelLabel: string;
        executionMode?: 'paper' | 'shadow' | 'live';
        systemPrompt: string;
        userPrompt: string;
        context: {
            riskState?: any;
            clamp?: any;
            exposureNowUsd: number;
            capUsd: number;
            allowedPairs: string[];
            klineMeta?: {
                n: number;
                granularity: string;
            } | null;
        };
    }) {
        this.addEntry({
            timestamp: params.ts,
            type: 'PROMPT',
            message: `[AI Prompt] ${params.modelLabel} (${params.model}) - Session: ${params.sessionId}`,
            details: {
                sessionId: params.sessionId,
                model: params.model,
                modelLabel: params.modelLabel,
                executionMode: params.executionMode,
                systemPrompt: params.systemPrompt,
                userPrompt: params.userPrompt,
                context: params.context,
            },
        });
    }
    
    getHistory(): LogEntry[] {
        return [...this.history];
    }

    clear() {
        this.history = [];
    }
}

export const auditService = new AuditService();
