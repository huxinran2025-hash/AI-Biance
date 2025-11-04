import { Position, ExternalAlert, DisagreementSignal, RiskSignalsSnapshot } from '../types';

const MAX_OPEN_POSITION_LINES = 5;
const MAX_NEWS_ITEMS_PER_CATEGORY = 3;

const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

export function formatPositions(positions: Position[]): string {
    if (!positions.length) {
        return '无持仓。';
    }
    const lines = positions.slice(0, MAX_OPEN_POSITION_LINES).map(pos => {
        const sideLabel = pos.side === 'LONG' ? '多' : '空';
        const stop = pos.stopLoss ? ` SL:${pos.stopLoss}` : '';
        const take = pos.takeProfit ? ` TP:${pos.takeProfit}` : '';
        return `- ${pos.symbol} ${sideLabel} x${pos.leverage} | 名义 ${formatCurrency(pos.notionalUsd)} | 未实现PnL ${formatCurrency(pos.unrealizedPnl)}${stop}${take}`;
    });
    if (positions.length > MAX_OPEN_POSITION_LINES) {
        lines.push(`... 还有 ${positions.length - MAX_OPEN_POSITION_LINES} 个仓位未列出`);
    }
    return lines.join('\n');
}

export function formatNewsContext(news: RiskSignalsSnapshot, alerts: ExternalAlert[]): string {
    const lines: string[] = [];
    const summaryEntries = Object.entries(news.summary ?? {});
    summaryEntries.forEach(([category, items]) => {
        if (!items || !items.length) return;
        const limited = items.slice(0, MAX_NEWS_ITEMS_PER_CATEGORY);
        lines.push(`- ${translateNewsCategory(category)}: ${limited.join('；')}`);
    });

    const critical = news.criticalArticles?.slice(0, MAX_NEWS_ITEMS_PER_CATEGORY) ?? [];
    if (critical.length) {
        const articleLines = critical.map(article => {
            const ts = new Date(article.publishedAt).toLocaleString();
            return `[${article.category}] ${article.title} (${ts})`;
        });
        lines.push(`- 关键新闻: ${articleLines.join('；')}`);
    }

    if (alerts.length) {
        const alertLines = alerts.slice(0, MAX_NEWS_ITEMS_PER_CATEGORY).map(alert => {
            const ts = new Date(alert.publishedAt).toLocaleTimeString();
            return `[${alert.severity}] ${alert.source} ${alert.topic} ${alert.title} (${ts})`;
        });
        lines.push(`- 外部警报: ${alertLines.join('；')}`);
    }

    return lines.length ? lines.join('\n') : '无关键新闻或外部警报。';
}

export function translateNewsCategory(category: string): string {
    switch (category) {
        case 'exchange':
            return '交易所风险';
        case 'regulation':
            return '监管动作';
        case 'stablecoin':
            return '稳定币风险';
        case 'macro':
            return '宏观新闻';
        case 'crypto':
            return '加密市场情绪';
        default:
            return category;
    }
}

export function formatVolatilityContext(signals: DisagreementSignal[]): string {
    if (!signals.length) {
        return '无显著模型分歧信号。';
    }
    const limited = signals.slice(0, MAX_NEWS_ITEMS_PER_CATEGORY).map(signal => {
        return `${signal.symbol} ${signal.severity} by ${signal.involvedModels.join('/')}`;
    });
    return limited.join('；');
}

export function sanitizePrice(value: unknown): number | undefined {
    if (typeof value !== 'number') return undefined;
    if (!Number.isFinite(value)) return undefined;
    if (value <= 0) return undefined;
    return value;
}

export function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    if (min > max) return min;
    return Math.min(max, Math.max(min, value));
}

export function pickDefaultSymbol(account: any, allowedPairs: string[]): string {
    const existing = account.openPositions?.[0]?.symbol;
    if (existing) return existing;
    if (allowedPairs.length > 0) return allowedPairs[0];
    return 'BTCUSDT';
}

export { formatCurrency };







