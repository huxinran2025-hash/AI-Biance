import { GoogleGenAI } from "@google/genai";
import {
    UserSessionConfig,
    DashboardState,
    RiskSignalsSnapshot,
    AccountRiskState,
    AppliedRiskClamp,
    SystemMode,
    InternalModelId,
    TradeProposal,
    ModelDecisionSnapshot,
    AccountState,
    KlineSnapshot,
} from '../../types';
import { ModelProfile } from './modelProfiles';
import { buildTraderPrompt, buildScalperPrompt, getDecisionResponseSchema } from './promptBuilder';
import { formatCurrency, sanitizePrice, clampNumber, pickDefaultSymbol } from './formatters';
import { auditService } from '../audit';
import { generateContentUnified, AIClients } from './aiProviderAdapter';

/**
 * 带重试机制的AI调用
 */
async function callAIWithRetry(
    aiClients: AIClients,
    prompt: string,
    profile: ModelProfile,
    responseSchema: any,
    maxRetries: number = 3
): Promise<{ text?: string }> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await generateContentUnified({
                model: profile.llmModel,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    temperature: profile.temperature,
                    topP: profile.topP,
                    responseMimeType: 'application/json',
                    responseSchema,
                    systemInstruction: {
                        role: 'system',
                        parts: [{ text: `${profile.systemPrompt}\n始终返回符合 JSON schema 的决策，不得输出解释性文本。` }],
                    },
                },
                clients: aiClients
            });
            return response;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const errorStr = String(error);
            
            // 不可重试的错误（4xx，API Key错误）
            if (errorStr.includes('401') || errorStr.includes('403') || errorStr.includes('API_KEY') || errorStr.includes('invalid')) {
                throw lastError;
            }
            
            // 可重试的错误（网络错误、5xx、429）
            if (attempt < maxRetries - 1) {
                const delayMs = Math.min(200 * Math.pow(2, attempt), 1500);
                auditService.logWarn(`[AI] Retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms`, { 
                    error: errorStr,
                    model: profile.llmModel 
                });
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    
    throw lastError || new Error('AI call failed after retries');
}

export async function generateModelDecision({
    aiClients,
    modelId,
    profile,
    state,
    config,
    news,
    riskState,
    clamp,
    newMode,
    reason,
    exposureNowUsd,
    capUsd,
    klineSnapshot,
}: {
    aiClients: AIClients;
    modelId: InternalModelId;
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
    klineSnapshot?: KlineSnapshot;
}): Promise<{ proposal: TradeProposal; snapshot: ModelDecisionSnapshot }> {
    const allowedPairs = config.allowedPairs ?? [];
    const fallback = (fallbackReason: string) => buildFallbackDecision({
        modelId,
        profile,
        state,
        allowedPairs,
        reason: fallbackReason,
    });

    // 根据 modelId 选择合适的提示词构建器
    const allowNewEntries = !clamp.forbidNewEntries && !riskState.cooldownActive && newMode === 'NORMAL';
    
    let prompt: string;
    if (modelId === 'model_B') {
        // Trader AI - 完整上下文
        prompt = buildTraderPrompt({
            profile,
            state,
            config,
            news,
            riskState,
            clamp,
            newMode,
            reason,
            exposureNowUsd,
            capUsd,
            allowedPairs,
            klineSnapshot,
        });
    } else if (modelId === 'model_C') {
        // Scalper AI - 精简上下文（只有技术分析和市场数据）
        prompt = buildScalperPrompt({
            profile,
            state,
            config,
            allowedPairs,
            klineSnapshot,
            exposureNowUsd,
            capUsd,
            allowNewEntries,
        });
    } else {
        // Fallback to Trader prompt
        prompt = buildTraderPrompt({
            profile,
            state,
            config,
            news,
            riskState,
            clamp,
            newMode,
            reason,
            exposureNowUsd,
            capUsd,
            allowedPairs,
            klineSnapshot,
        });
    }

    // 记录提示词审计信息
    auditService.logPrompt({
        ts: Date.now(),
        sessionId: 'local-session',
        model: profile.llmModel,
        modelLabel: profile.label,
        executionMode: config.executionMode,
        systemPrompt: profile.systemPrompt,
        userPrompt: prompt,
        context: {
            riskState,
            clamp,
            exposureNowUsd,
            capUsd,
            allowedPairs,
            klineMeta: klineSnapshot ? {
                n: klineSnapshot.klines?.length || 0,
                granularity: klineSnapshot.granularity || 'unknown',
            } : null,
        },
    });

    const responseSchema = getDecisionResponseSchema();
    let parsed: any;
    try {
        const response = await callAIWithRetry(
            aiClients,
            prompt,
            profile,
            responseSchema,
            3 // maxRetries
        );

        const rawText = response.text?.trim();
        if (!rawText) {
            throw new Error('LLM 未返回内容');
        }
        parsed = JSON.parse(rawText);
    } catch (error) {
        auditService.logWarn(`[Strategist:${profile.label}] LLM 决策失败，使用回退`, {
            error: error instanceof Error ? error.message : String(error),
        });
        return fallback(error instanceof Error ? error.message : String(error));
    }

    const decisionPayload = parsed?.decision ?? parsed ?? {};
    const reasoning = typeof parsed?.reasoning === 'string' ? parsed.reasoning.trim() : '';
    const riskControls = typeof parsed?.riskControls === 'string' ? parsed.riskControls.trim() : '';
    const newsImpact = typeof parsed?.newsImpact === 'string' ? parsed.newsImpact.trim() : '';

    const allowedPairsUpper = allowedPairs.map(p => p.toUpperCase());
    let symbol = typeof decisionPayload.symbol === 'string' ? decisionPayload.symbol.toUpperCase() : '';
    if (!allowedPairsUpper.includes(symbol)) {
        const replacement = pickDefaultSymbol(state.account, allowedPairsUpper);
        if (replacement) {
            symbol = replacement;
        }
    }
    if (!symbol) {
        return fallback('缺少有效的交易对');
    }

    const actionMap: Record<string, TradeProposal['action']> = {
        'buy_to_enter': 'buy_to_enter',
        'buy': 'buy_to_enter',
        'long': 'buy_to_enter',
        'enter_long': 'buy_to_enter',
        'sell_to_enter': 'sell_to_enter',
        'sell': 'sell_to_enter',
        'short': 'sell_to_enter',
        'enter_short': 'sell_to_enter',
        'close': 'close_position',
        'exit': 'close_position',
        'close_position': 'close_position',
        'reduce': 'close_position',
        'reduce_position': 'close_position',
        'hold': 'hold',
        'flat': 'hold',
    };
    const requestedActionKey = String(decisionPayload.action ?? 'hold').toLowerCase();
    let action: TradeProposal['action'] = actionMap[requestedActionKey] ?? 'hold';

    let confidence = typeof decisionPayload.confidence === 'number' ? decisionPayload.confidence : 0.5;
    confidence = clampNumber(confidence, 0, 1);

    const account = state.account;
    const maxLeverage = config.leverageCap || 10;
    let leverage = typeof decisionPayload.leverage === 'number' ? decisionPayload.leverage : 3;
    leverage = clampNumber(leverage, 1, maxLeverage);

    // 重构为显式逻辑，明确边界条件
    let maxNotional: number;
    if (exposureNowUsd >= capUsd) {
        // 敞口已超过上限，不允许新开仓
        maxNotional = 0;
    } else {
        const remaining = capUsd - exposureNowUsd; // > 0
        const riskLimit = profile.riskFraction * Math.max(0, account.equityNowUsd);
        maxNotional = Math.max(0, Math.min(riskLimit, remaining));
    }
    let notionalUsd = typeof decisionPayload.notionalUsd === 'number' ? decisionPayload.notionalUsd : 0;
    if (action === 'buy_to_enter' || action === 'sell_to_enter') {
        if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) {
            notionalUsd = maxNotional;
        }
        notionalUsd = Math.min(Math.max(notionalUsd, 0), maxNotional);
    } else {
        notionalUsd = 0;
    }

    const stopLoss = sanitizePrice(decisionPayload.stopLoss);
    const takeProfit = sanitizePrice(decisionPayload.takeProfit);
    const invalidationCondition = typeof decisionPayload.invalidationCondition === 'string'
        ? decisionPayload.invalidationCondition.trim()
        : undefined;

    const reasonSegments: string[] = [];
    if (reasoning) reasonSegments.push(reasoning);
    if (newsImpact) reasonSegments.push(`新闻影响: ${newsImpact}`);
    if (riskControls) reasonSegments.push(`风险控制: ${riskControls}`);

    if (!allowNewEntries && (action === 'buy_to_enter' || action === 'sell_to_enter')) {
        reasonSegments.push('系统禁止新开仓，建议已转为 HOLD。');
        action = 'hold';
        notionalUsd = 0;
        confidence = clampNumber(confidence * 0.6, 0, 1);
    }

    const hasPosition = account.openPositions.some(pos => pos.symbol === symbol);
    if (action === 'close_position' && !hasPosition) {
        reasonSegments.push('账户暂无对应持仓，无法执行平仓，改为 HOLD。');
        action = 'hold';
        confidence = clampNumber(confidence * 0.7, 0, 1);
    }

    if (!allowNewEntries && action === 'hold') {
        notionalUsd = 0;
    }

    const finalReason = reasonSegments.length > 0
        ? reasonSegments.join(' | ')
        : `${profile.label} 未提供详细理由，保持当前仓位。`;

    const proposal: TradeProposal = {
        model: modelId,
        symbol,
        action,
        leverage,
        notionalUsd,
        reasonFromModel: finalReason,
        confidence,
    };

    if (stopLoss !== undefined) proposal.stopLoss = stopLoss;
    if (takeProfit !== undefined) proposal.takeProfit = takeProfit;
    if (invalidationCondition) proposal.invalidationCondition = invalidationCondition;

    const snapshot: ModelDecisionSnapshot = {
        model: modelId,
        symbol,
        stance: proposal.action === 'buy_to_enter' ? 'LONG' : proposal.action === 'sell_to_enter' ? 'SHORT' : 'FLAT',
        confidence: proposal.confidence,
        leverage: proposal.leverage,
        notionalUsd: proposal.notionalUsd,
    };

    auditService.logStrategy(`[LLM] ${profile.label} 决策`, {
        model: modelId,
        symbol: proposal.symbol,
        action: proposal.action,
        confidence: proposal.confidence,
        exposureUsd: proposal.notionalUsd,
    });

    return { proposal, snapshot };
}

function buildFallbackDecision({
    modelId,
    profile,
    state,
    allowedPairs,
    reason,
}: {
    modelId: InternalModelId;
    profile: ModelProfile;
    state: DashboardState;
    allowedPairs: string[];
    reason: string;
}): { proposal: TradeProposal; snapshot: ModelDecisionSnapshot } {
    const symbol = pickDefaultSymbol(state.account, allowedPairs.map(p => p.toUpperCase()));
    const existing = state.account.openPositions.find(pos => pos.symbol === symbol);
    const proposal: TradeProposal = {
        model: modelId,
        symbol,
        action: 'hold',
        leverage: existing?.leverage ?? 1,
        notionalUsd: 0,
        reasonFromModel: `Fallback(${profile.label}): ${reason}`,
        confidence: 0.2,
    };
    const snapshot: ModelDecisionSnapshot = {
        model: modelId,
        symbol,
        stance: 'FLAT',
        confidence: proposal.confidence,
        leverage: proposal.leverage,
        notionalUsd: 0,
    };
    return { proposal, snapshot };
}

