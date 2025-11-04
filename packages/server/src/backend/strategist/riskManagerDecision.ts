import {
    UserSessionConfig,
    DashboardState,
    RiskSignalsSnapshot,
    AccountRiskState,
    AppliedRiskClamp,
    SystemMode,
    RiskManagerDecision,
} from '../../types';
import { ModelProfile } from './modelProfiles';
import { AIClients } from './aiProviderAdapter';
import { generateContentUnified } from './aiProviderAdapter';
import { formatCurrency, formatPositions, formatNewsContext, formatVolatilityContext, clampNumber } from './formatters';
import { buildRiskPromptSections } from './riskPromptSections';
import { auditService } from '../audit';

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
                        parts: [{ text: `${profile.systemPrompt}\n始终返回符合 JSON schema 的风险评分，不得输出解释性文本。` }],
                    },
                },
                clients: aiClients
            });
            return response;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const errorStr = String(error);
            
            if (errorStr.includes('401') || errorStr.includes('403') || errorStr.includes('API_KEY') || errorStr.includes('invalid')) {
                throw lastError;
            }
            
            if (attempt < maxRetries - 1) {
                const delayMs = Math.min(200 * Math.pow(2, attempt), 1500);
                auditService.logWarn(`[RiskManager] Retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms`, { 
                    error: errorStr,
                    model: profile.llmModel 
                });
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    
    throw lastError || new Error('Risk Manager AI call failed after retries');
}

function buildRiskManagerPrompt(params: {
    state: DashboardState;
    config: UserSessionConfig;
    news: RiskSignalsSnapshot;
    riskState: AccountRiskState;
    clamp: AppliedRiskClamp;
    newMode: SystemMode;
    reason: string;
}): string {
    const { state, config, news, riskState, clamp, newMode, reason } = params;
    const account = state.account;
    const riskMetrics = riskState.metrics;

    const drawdownFraction = account.equityPeakUsd > 0
        ? (account.equityPeakUsd - account.equityNowUsd) / account.equityPeakUsd
        : 0;

    const positionsOverview = formatPositions(account.openPositions);
    const externalAlerts = state.recentExternalAlerts ?? account.externalAlerts ?? [];
    const newsContext = formatNewsContext(news, externalAlerts);
    const volatilityContext = formatVolatilityContext(state.volatilitySignals ?? []);
    const cooldownStatus = riskState.cooldownActive
        ? `Active (${riskState.cooldownReason ?? 'reason unknown'})`
        : 'Inactive';
    const disciplineInfo = state.disciplineState
        ? [
            `- Last review: ${new Date(state.disciplineState.lastReviewTs).toISOString()}`,
            `- Diagnostics: ${JSON.stringify(state.disciplineState.diagnostics, null, 2)}`
        ].join('\n')
        : 'No recent self-discipline data';

    const sections = buildRiskPromptSections({
        account: {
            equityNow: formatCurrency(account.equityNowUsd),
            equityPeak: formatCurrency(account.equityPeakUsd),
            drawdownPct: `${(drawdownFraction * 100).toFixed(2)}%`,
            availableCapital: formatCurrency(account.availableCapital),
            cashRatioPct: `${(riskMetrics.cashRatio * 100).toFixed(1)}%`,
            marginUsagePct: `${(riskMetrics.marginUsage * 100).toFixed(1)}%`,
            leverage: `${riskMetrics.accountLeverage.toFixed(2)}x`,
            maxDrawdownPct: `${(riskMetrics.drawdownPct * 100).toFixed(1)}%`,
            cooldownStatus,
        },
        positionsOverview,
        newsContext,
        volatilityContext,
        system: {
            mode: String(newMode),
            triggerReason: reason,
            entryRestriction: clamp.forbidNewEntries ? 'Blocked' : 'Allowed',
        },
        disciplineInfo,
    });

    return sections.join('\n\n');
}

export async function generateRiskManagerDecision({
    aiClients,
    profile,
    state,
    config,
    news,
    riskState,
    clamp,
    newMode,
    reason,
}: {
    aiClients: AIClients;
    profile: ModelProfile;
    state: DashboardState;
    config: UserSessionConfig;
    news: RiskSignalsSnapshot;
    riskState: AccountRiskState;
    clamp: AppliedRiskClamp;
    newMode: SystemMode;
    reason: string;
}): Promise<RiskManagerDecision> {
    const prompt = buildRiskManagerPrompt({
        state,
        config,
        news,
        riskState,
        clamp,
        newMode,
        reason,
    });

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
            exposureNowUsd: 0,
            capUsd: 0,
            allowedPairs: config.allowedPairs || [],
            klineMeta: null,
        },
    });

    const responseSchema = {
        type: 'object',
        properties: {
            masterRiskScore: {
                type: 'number',
                minimum: 0.0,
                maximum: 1.0,
                description: 'Aggregated portfolio risk score (0.0 = very risky, 1.0 = very safe)',
            },
            reason: {
                type: 'string',
                description: 'Explanation produced by the model for the assigned risk score',
            },
        },
        required: ['masterRiskScore', 'reason'],
    };

    let parsed: any;
    try {
        const response = await callAIWithRetry(
            aiClients,
            prompt,
            profile,
            responseSchema,
            3
        );

        const rawText = response.text?.trim();
        if (!rawText) {
            throw new Error('Risk Manager LLM returned empty payload');
        }
        parsed = JSON.parse(rawText);
    } catch (error) {
        auditService.logWarn(`[RiskManager:${profile.label}] LLM response parse failed, using fallback`, {
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            masterRiskScore: 0.7,
            reason: `Fallback: ${error instanceof Error ? error.message : String(error)}`,
        };
    }

    const masterRiskScore = clampNumber(parsed.masterRiskScore ?? 0.7, 0, 1);
    const parsedReason = typeof parsed.reason === 'string' ? parsed.reason.trim() : 'No reason provided';

    auditService.logStrategy(`[RiskManager] ${profile.label} Risk Score`, {
        masterRiskScore,
        reason: parsedReason,
    });

    return {
        masterRiskScore,
        reason: parsedReason,
    };
}
