import {
    UserSessionConfig,
    DashboardState,
    RiskSignalsSnapshot,
    AccountRiskState,
    AppliedRiskClamp,
    SystemMode,
    KlineSnapshot,
} from '../../types';
import { ModelProfile } from './modelProfiles';
import { formatCurrency, formatPositions, formatNewsContext, formatVolatilityContext } from './formatters';
import { sumExposureUsd, clipPct01 } from '../../utils/exposure';

/**
 * 格式化 K 线技术分析部分（用于 Scalper 和 Trader）
 */
function formatKlineContext(klineSnapshot: KlineSnapshot): string {
    if (!klineSnapshot || 
        !Array.isArray(klineSnapshot.klines) || 
        klineSnapshot.klines.length === 0 || 
        !klineSnapshot.indicators) {
        return '';
    }
    
    const ind = klineSnapshot.indicators;
    const ms = klineSnapshot.marketState;
    const latestKline = klineSnapshot.klines[klineSnapshot.klines.length - 1];
    const recentKlines = klineSnapshot.klines.slice(-10);
    
    return `## 技术分析能力

你现在可以获得实时K线数据和技术指标。请基于以下框架进行分析：

### 1. 趋势识别
- 当前趋势: ${ms.trend === 'uptrend' ? '上升趋势' : ms.trend === 'downtrend' ? '下降趋势' : '横盘整理'}
- MA20 (20日均线): ${ind.ma20.toFixed(2)}
- MA50 (50日均线): ${ind.ma50.toFixed(2)}
- MA20 ${ind.ma20 > ind.ma50 ? '在' : '低于'} MA50 ${ind.ma20 > ind.ma50 ? '上方（多头排列）' : '下方（空头排列）'}

### 2. 关键技术指标
- RSI (14): ${ind.rsi.toFixed(2)} ${ind.rsi > 70 ? '（超买）' : ind.rsi < 30 ? '（超卖）' : '（正常区间）'}
- MACD: ${ind.macd.macd.toFixed(4)}, 信号线: ${ind.macd.signal.toFixed(4)}, 柱状图: ${ind.macd.histogram.toFixed(4)}
  ${ind.macd.histogram > 0 ? 'MACD柱状图为正，动能向上' : 'MACD柱状图为负，动能向下'}
- 布林带: 上轨 ${ind.bollingerBands.upper.toFixed(2)}, 中轨 ${ind.bollingerBands.middle.toFixed(2)}, 下轨 ${ind.bollingerBands.lower.toFixed(2)}
- 当前价格: ${latestKline.close.toFixed(2)} ${latestKline.close > ind.bollingerBands.upper ? '（触及上轨）' : latestKline.close < ind.bollingerBands.lower ? '（触及下轨）' : '（中轨附近）'}

### 3. 市场状态
- 波动率: ${ms.volatility === 'high' ? '高波动' : ms.volatility === 'low' ? '低波动' : '中等波动'}
- 支撑位: ${ms.support.length > 0 ? ms.support.map((s: number) => s.toFixed(2)).join(', ') : '暂无'}
- 阻力位: ${ms.resistance.length > 0 ? ms.resistance.map((r: number) => r.toFixed(2)).join(', ') : '暂无'}

### 4. 最近K线形态（最近10根）
${recentKlines.map((k, i) => {
    const isUp = k.close > k.open;
    const body = Math.abs(k.close - k.open);
    const upperShadow = k.high - Math.max(k.open, k.close);
    const lowerShadow = Math.min(k.open, k.close) - k.low;
    const isLongBody = body > (k.high - k.low) * 0.6;
    const isLongUpperShadow = upperShadow > body * 2;
    const isLongLowerShadow = lowerShadow > body * 2;
    
    let pattern = '';
    if (isLongLowerShadow && !isLongUpperShadow && !isUp) pattern = '锤子线（看涨）';
    else if (isLongUpperShadow && !isLongLowerShadow && isUp) pattern = '上吊线（看跌）';
    else if (isLongBody) pattern = isUp ? '大阳线（看涨）' : '大阴线（看跌）';
    else if (body < (k.high - k.low) * 0.2) pattern = '十字星（中性）';
    
    const klineNum = recentKlines.length - i;
    const date = new Date(k.time * 1000);
    return `  ${klineNum}. 时间: ${date.toLocaleString('zh-CN')}, 开盘: ${k.open.toFixed(2)}, 最高: ${k.high.toFixed(2)}, 最低: ${k.low.toFixed(2)}, 收盘: ${k.close.toFixed(2)}, 成交量: ${k.volume.toFixed(2)}${pattern ? `, 形态: ${pattern}` : ''}`;
}).join('\n')}

### 5. 决策建议框架
基于以上技术分析，给出交易建议时必须说明：
- 识别到的技术形态和趋势方向
- 关键技术位（支撑/阻力）
- 主要指标信号（RSI、MACD、布林带）
- 技术面与基本面（新闻）的结合判断
- 当前价格相对支撑/阻力位的距离和突破概率`;
}

/**
 * 格式化市场快照（用于 Scalper）
 */
function formatMarketSnapshot(market: DashboardState['market'], allowedPairs: string[]): string {
    const symbols = allowedPairs.slice(0, 10); // 只显示前10个
    const lines = symbols.map(symbol => {
        const ticker = market[symbol];
        if (!ticker) return `  ${symbol}: 无数据`;
        return `  ${symbol}: ${ticker.price.toFixed(2)} (24h: ${(ticker.priceChange24h * 100).toFixed(2)}%)`;
    });
    return lines.join('\n');
}

export function buildTraderPrompt(params: {
    profile: ModelProfile;
    state: DashboardState;
    config: UserSessionConfig;
    news: RiskSignalsSnapshot;
    riskState: AccountRiskState;
    clamp: AppliedRiskClamp;
    newMode: SystemMode;
    reason: string;
    exposureNowUsd: number;
    capUsd: number;
    allowedPairs: string[];
    klineSnapshot?: KlineSnapshot;
}): string {
    const { profile, state, config, news, riskState, clamp, newMode, reason, exposureNowUsd, capUsd, allowedPairs, klineSnapshot } = params;
    const account = state.account;
    const riskMetrics = riskState.metrics;
    const allowedSymbols = allowedPairs.join(', ') || '（无可交易品种）';
    const capPct = (config.capitalUsageLimitPct || 30).toFixed(1);
    // 使用统一的敞口计算和百分比裁剪
    const actualExposureNowUsd = sumExposureUsd(account.openPositions);
    const exposurePct = capUsd > 0 ? clipPct01((actualExposureNowUsd / capUsd) * 100).toFixed(1) : '0.0';
    const remainingExposureUsd = Math.max(0, capUsd - exposureNowUsd);
    const allowNewEntries = !clamp.forbidNewEntries && !riskState.cooldownActive && newMode === 'NORMAL';
    const blacklist = news.blacklist_symbols?.length ? news.blacklist_symbols.join(', ') : '无';

    // 构建技术分析部分（使用格式化函数）
    const technicalAnalysisSection = klineSnapshot ? formatKlineContext(klineSnapshot) : '';

    // 检查负值并生成警告标注
    const negativeValueWarnings: string[] = [];
    if (account.equityNowUsd < 0) {
        negativeValueWarnings.push('净值异常为负数');
    }
    if (account.availableCapital < 0) {
        negativeValueWarnings.push('可用现金异常为负数');
    }
    if (actualExposureNowUsd < 0) {
        negativeValueWarnings.push('敞口异常为负数');
    }
    const warningSection = negativeValueWarnings.length > 0 
        ? `\n⚠️ 数值异常警告: ${negativeValueWarnings.join('、')}，已按0处理。`
        : '';

    const sections = [
        `## 角色说明\n你是 ${profile.label}（${profile.description}）。请根据当前状态给出唯一的下一步交易建议。`,
        `## 账户状态\n- 净值: ${formatCurrency(account.equityNowUsd)}（峰值 ${formatCurrency(account.equityPeakUsd)}）\n- 可用现金: ${formatCurrency(account.availableCapital)}\n- 当前总敞口: ${formatCurrency(exposureNowUsd)} / 上限 ${formatCurrency(capUsd)} (${exposurePct}%)\n- 系统模式: ${state.systemStatus.mode}（触发原因: ${reason}）\n- 风控冷静模式: ${riskState.cooldownActive ? `是（${riskState.cooldownReason ?? '未知原因' }）` : '否'}\n- 风控指标: 现金占比 ${(riskMetrics.cashRatio * 100).toFixed(1)}%，保证金占用 ${(riskMetrics.marginUsage * 100).toFixed(1)}%，账户杠杆 ${(riskMetrics.accountLeverage * 1).toFixed(2)}x，最大回撤 ${(riskMetrics.drawdownPct * 100).toFixed(1)}%${warningSection}`,
        `## 持仓概览\n${formatPositions(account.openPositions)}`,
        `## 新闻与警报\n${formatNewsContext(news, state.recentExternalAlerts ?? account.externalAlerts ?? [])}\n- 黑名单交易对: ${blacklist}\n- 模型分歧信号: ${formatVolatilityContext(state.volatilitySignals ?? [])}`,
        technicalAnalysisSection,
        `## 可交易标的\n允许交易对: ${allowedSymbols}\n剩余可用敞口: ${formatCurrency(remainingExposureUsd)}\n${allowNewEntries ? '当前允许在风险范围内开仓或加仓。' : '当前禁止开仓，只能持有或减仓。'}`,
        `## 输出要求
分析以下所有交易对：${allowedSymbols}。

**重要**：你只应为你发现了"高确定性"交易机会的交易对提供决策。如果你对某个交易对没有高确定性的看法，请不要在你的 JSON 响应中包含它。

一个空的决策响应（action: 'hold', notionalUsd: 0）是完全可以接受的。

返回 JSON，结构必须符合 schema，仅输出 JSON 字符串，勿添加额外文本。须确保: 
1. action 仅可为 buy_to_enter、sell_to_enter、hold、close_position。
2. symbol 必须在允许列表内（如无高信心机会，可返回 hold）。
3. 禁止开仓时不得返回 buy_to_enter 或 sell_to_enter。
4. notionalUsd 不得超过剩余敞口与策略额度。
5. 给出止损/止盈/无效条件（若适用）。
6. confidence 介于 0-1。
7. reasoning 必须结合技术分析和新闻/风险要点。${klineSnapshot ? '\n8. 技术分析部分必须说明：趋势、关键指标信号（RSI、MACD、布林带）、支撑/阻力位、K线形态。' : ''}`
    ].filter(s => s);

    return sections.join('\n\n');
}

/**
 * 构建 Scalper 专用提示词（只包含技术分析和市场数据，不含新闻和账户风险）
 */
export function buildScalperPrompt(params: {
    profile: ModelProfile;
    state: DashboardState;
    config: UserSessionConfig;
    allowedPairs: string[];
    klineSnapshot?: KlineSnapshot;
    exposureNowUsd: number;
    capUsd: number;
    allowNewEntries: boolean;
}): string {
    const { profile, state, config, allowedPairs, klineSnapshot, exposureNowUsd, capUsd, allowNewEntries } = params;
    const remainingExposureUsd = Math.max(0, capUsd - exposureNowUsd);
    const allowedSymbols = allowedPairs.join(', ') || '（无可交易品种）';

    const sections = [
        `## 角色说明\n你是 ${profile.label}（${profile.description}）。专注于技术形态和短期交易机会。`,
        klineSnapshot ? formatKlineContext(klineSnapshot) : '',
        `## 市场快照\n${formatMarketSnapshot(state.market, allowedPairs)}`,
        `## 可交易标的\n允许交易对: ${allowedSymbols}\n剩余可用敞口: ${formatCurrency(remainingExposureUsd)}\n${allowNewEntries ? '当前允许在风险范围内开仓或加仓。' : '当前禁止开仓，只能持有或减仓。'}`,
        `## 输出要求
分析以下所有交易对：${allowedSymbols}。

**重要**：你只应为你发现了"高确定性"交易机会的交易对提供决策。如果你对某个交易对没有高确定性的看法，请不要在你的 JSON 响应中包含它。

一个空的决策响应（action: 'hold', notionalUsd: 0）是完全可以接受的。

返回 JSON，结构必须符合 schema。给出进场方向、仓位、止损/止盈、无效条件和 confidence (0-1)。`
    ].filter(s => s);

    return sections.join('\n\n');
}

export function getDecisionResponseSchema() {
    return {
        type: 'object',
        properties: {
            decision: {
                type: 'object',
                properties: {
                    symbol: { type: 'string' },
                    action: { type: 'string', enum: ['buy_to_enter', 'sell_to_enter', 'hold', 'close_position'] },
                    notionalUsd: { type: 'number' },
                    leverage: { type: 'number' },
                    stopLoss: { type: 'number' },
                    takeProfit: { type: 'number' },
                    invalidationCondition: { type: 'string' },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                },
                required: ['action', 'confidence'], // symbol 可以为空（表示 hold）
            },
            reasoning: { type: 'string' },
            riskControls: { type: 'string' },
            newsImpact: { type: 'string' },
        },
        required: ['decision', 'reasoning'],
    };
}

