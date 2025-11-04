import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import {
    UserSessionConfig,
    MarketData,
    RiskSignalsSnapshot,
    TradeDecision,
    SystemMode,
    BrakeReason,
    DashboardState,
    AppliedRiskClamp,
    TradeProposal,
    InternalModelId,
    TradeAttribution,
    DecisionAuthority,
    ModelDecisionSnapshot,
    AccountRiskState,
    SafetySnapshotBundle,
    AccountState,
} from '../types';
import { auditService } from "./audit";
import { newsSignalService } from "./news";
import { accountRiskEngine } from "./accountRiskEngine";
import { modelDisagreementMonitor } from "./modelDisagreementMonitor";
import { updateSystemMode, getCurrentRiskClamp } from "./strategist/modeManager";
import { MODEL_PROFILES, INTERNAL_MODELS } from "./strategist/modelProfiles";
import { generateModelDecision } from "./strategist/modelDecision";
import { generateRiskManagerDecision } from "./strategist/riskManagerDecision";
import { formatCurrency } from "./strategist/formatters";
import { fetchKlineSnapshot } from "../services/klineAnalysis";
import { KlineTickScheduler } from "../services/klineTickScheduler";
import { sumExposureUsd } from "../utils/exposure";
import { MINIMUM_TRADE_NOTIONAL_USD } from "../constants";

class Strategist {
    private googleClient: GoogleGenAI | null = null;
    private openAiClient: OpenAI | null = null;
    private deepSeekClient: OpenAI | null = null;
    private klineTickScheduler: KlineTickScheduler;

    constructor() {
        // 1. 初始化 Google Gemini
        const geminiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (geminiKey) {
            this.googleClient = new GoogleGenAI({ apiKey: geminiKey });
        } else {
            console.warn("GEMINI_API_KEY environment variable not found.");
        }
        
        // 2. 初始化 OpenAI (GPT)
        const gptKey = process.env.GPT_API_KEY;
        if (gptKey) {
            this.openAiClient = new OpenAI({ apiKey: gptKey });
        } else {
            console.warn("GPT_API_KEY environment variable not found.");
        }
        
        // 3. 初始化 DeepSeek (OpenAI 兼容模式)
        const deepSeekKey = process.env.DEEPSEEK_API_KEY;
        if (deepSeekKey) {
            this.deepSeekClient = new OpenAI({
                apiKey: deepSeekKey,
                baseURL: 'https://api.deepseek.com'
            });
        } else {
            console.warn("DEEPSEEK_API_KEY environment variable not found.");
        }
        
        // 验证 API Keys（异步，不阻塞构造）
        this.validateAllApiKeys().catch(err => {
            console.error('[Strategist] API Key validation failed:', err);
            auditService.logWarn('[Strategist] API Key validation issues', { error: String(err) });
        });
        
        this.klineTickScheduler = new KlineTickScheduler();
        auditService.logInfo('Strategist initialized.');
    }

    /**
     * 验证所有 API Keys 有效性
     */
    private async validateAllApiKeys(): Promise<void> {
        const validationResults: Array<{ provider: string; success: boolean; error?: string }> = [];
        
        // 验证 Gemini
        if (this.googleClient) {
            try {
                await this.googleClient.models.generateContent({
                    model: 'gemini-2.5-pro',
                    contents: [{ role: 'user', parts: [{ text: 'test' }] }],
                });
                validationResults.push({ provider: 'Gemini', success: true });
            } catch (error) {
                validationResults.push({ 
                    provider: 'Gemini', 
                    success: false, 
                    error: error instanceof Error ? error.message : String(error) 
                });
            }
        }
        
        // 验证 GPT
        if (this.openAiClient) {
            try {
                await this.openAiClient.chat.completions.create({
                    model: 'gpt-4',
                    messages: [{ role: 'user', content: 'test' }],
                    max_tokens: 5
                });
                validationResults.push({ provider: 'GPT', success: true });
            } catch (error) {
                validationResults.push({ 
                    provider: 'GPT', 
                    success: false, 
                    error: error instanceof Error ? error.message : String(error) 
                });
            }
        }
        
        // 验证 DeepSeek
        if (this.deepSeekClient) {
            try {
                await this.deepSeekClient.chat.completions.create({
                    model: 'deepseek-reasoner',
                    messages: [{ role: 'user', content: 'test' }],
                    max_tokens: 5
                });
                validationResults.push({ provider: 'DeepSeek', success: true });
            } catch (error) {
                validationResults.push({ 
                    provider: 'DeepSeek', 
                    success: false, 
                    error: error instanceof Error ? error.message : String(error) 
                });
            }
        }
        
        // 记录验证结果
        auditService.logInfo('[Strategist] API Keys validation completed', { validationResults });
    }

    private getAllClients() {
        return {
            google: this.googleClient,
            openai: this.openAiClient,
            deepseek: this.deepSeekClient
        };
    }

    
    public generateAndLogSafetySnapshot(newMode: SystemMode, reason: BrakeReason | 'RECOVERY', state: DashboardState) {
        const { marketRegime, disciplineState, account } = state;
        const clamp = this.getCurrentRiskClamp(newMode, {} as any);
        
        const drawdownPct = account.equityPeakUsd > 0 ? (account.equityPeakUsd - account.equityNowUsd) / account.equityPeakUsd : 0;
        const externalFeedDownForMs = !marketRegime.available ? Date.now() - marketRegime.sourceMeta.lastGoodTs : 0;

        const noteToHuman = `System mode changed to ${newMode} due to ${reason}. ${
            clamp.forbidNewEntries ? 'New entries FORBIDDEN.' : 'New entries ALLOWED.'
        } Exposure cap: ${clamp.maxTotalExposurePct * 100}%. Drawdown: ${(drawdownPct * 100).toFixed(2)}%.`;

        const snapshot = {
            ts: Date.now(),
            newMode,
            triggerReason: reason,
            externalContext: marketRegime,
            selfReviewContext: disciplineState,
            appliedRiskClamp: clamp,
            currentPortfolioSnapshot: account.openPositions.map(p => ({
                symbol: p.symbol, side: p.side, leverage: p.leverage,
                notionalUsd: p.notionalUsd, unrealizedPnlUsd: p.unrealizedPnl
            })),
            noteToHuman,
            drawdownPct,
            externalFeedDownForMs,
        };
        auditService.logSystemModeChange(snapshot);
    }

    public getCurrentRiskClamp(mode: SystemMode, config: UserSessionConfig): AppliedRiskClamp {
        return getCurrentRiskClamp(mode, config);
    }

    /**
     * 获取主要交易对（用于K线分析）
     * 优先级：持仓中的交易对 > 配置的第一个交易对 > BTCUSDT
     */
    private getPrimarySymbol(config: UserSessionConfig, state: DashboardState): string | null {
        // 优先使用持仓中的交易对
        if (state.account.openPositions.length > 0) {
            return state.account.openPositions[0].symbol;
        }
        
        // 其次使用配置中的第一个交易对
        if (config.allowedPairs && config.allowedPairs.length > 0) {
            return config.allowedPairs[0].toUpperCase();
        }
        
        // 默认使用BTCUSDT
        return 'BTCUSDT';
    }

    /**
     * 获取K线TICK统计信息
     */
    public getKlineTickStats() {
        return this.klineTickScheduler.getDailyStats();
    }

    public async tick(
        config: UserSessionConfig,
        state: DashboardState
    ) {
        // 1. Determine new system mode based on full state
        const { newMode, reason } = updateSystemMode(state, config);
        const riskState = state.accountRiskState ?? accountRiskEngine.evaluate(state.account);
        const newsSnapshot = newsSignalService.getCurrentSignals();
        const capPct = (config.capitalUsageLimitPct || 30) / 100;
        const capUsd = Math.max(0, state.account.equityNowUsd) * capPct;
        const exposureNowUsd = sumExposureUsd(state.account.openPositions);
        const clampPreview = this.getCurrentRiskClamp(newMode, config);

        // 检查是否需要K线TICK
        let klineSnapshot: import('../types').KlineSnapshot | undefined = undefined;
        const primarySymbol = this.getPrimarySymbol(config, state);
        
        if (primarySymbol) {
            try {
                // 获取K线快照（默认使用1h时间周期）
                const snapshot = await fetchKlineSnapshot(primarySymbol, '1h', 200);
                const { shouldTick, triggerType } = this.klineTickScheduler.shouldTick(snapshot);
                
                if (shouldTick) {
                    klineSnapshot = snapshot;
                    auditService.logInfo(`[KlineTick] Triggered for ${primarySymbol}, trigger type: ${triggerType || 'unknown'}`);
                }
            } catch (error) {
                auditService.logWarn(`[KlineTick] Failed to fetch kline snapshot for ${primarySymbol}`, {
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        const aiClients = this.getAllClients();
        
        // 1. 并行调用三个 AI（model_A 使用风险管理决策生成器）
        const [riskManagerDecision, traderResult, scalperResult] = await Promise.all([
            generateRiskManagerDecision({
                aiClients,
                profile: MODEL_PROFILES.model_A,
                state,
                config,
                news: newsSnapshot,
                riskState,
                clamp: clampPreview,
                newMode,
                reason,
            }),
            generateModelDecision({
                aiClients,
                modelId: 'model_B',
                profile: MODEL_PROFILES.model_B,
                state,
                config,
                news: newsSnapshot,
                riskState,
                clamp: clampPreview,
                newMode,
                reason,
                exposureNowUsd,
                capUsd,
                klineSnapshot,
            }),
            generateModelDecision({
                aiClients,
                modelId: 'model_C',
                profile: MODEL_PROFILES.model_C,
                state,
                config,
                news: newsSnapshot,
                riskState,
                clamp: clampPreview,
                newMode,
                reason,
                exposureNowUsd,
                capUsd,
                klineSnapshot,
            }),
        ]);

        // 2. 提取风险评分
        const { masterRiskScore, reason: riskReason } = riskManagerDecision;
        
        auditService.logInfo(`[Strategist] Risk Manager (gpt-5) set global risk score: ${masterRiskScore}`, { 
            reason: riskReason 
        });

        // 3. 合并交易提案
        const allProposals = [traderResult.proposal, scalperResult.proposal];

        // 4. 应用风险评分缩放
        const scaledProposals = allProposals.map(proposal => {
            // 只缩放"开仓"提案
            if (proposal.action.includes('enter')) {
                const originalNotional = proposal.notionalUsd;
                const scaledNotional = originalNotional * masterRiskScore;
                
                if (scaledNotional < originalNotional) {
                    auditService.logInfo(`[Strategist] Scaled proposal ${proposal.symbol}`, {
                        model: proposal.model,
                        original: originalNotional,
                        scaled: scaledNotional,
                        score: masterRiskScore
                    });
                }
                
                return {
                    ...proposal,
                    notionalUsd: scaledNotional,
                    reasonFromModel: `${proposal.reasonFromModel} | Scaled by RiskManager (Score: ${masterRiskScore.toFixed(2)})`
                };
            }
            // 平仓或持仓不受影响
            return proposal;
        });

        // 5. 过滤粉尘交易
        const finalProposals = scaledProposals.filter(
            p => p.notionalUsd >= MINIMUM_TRADE_NOTIONAL_USD || !p.action.includes('enter')
        );

        // 6. 构建决策快照（只包含交易员的决策）
        const decisionSnapshots = [traderResult.snapshot, scalperResult.snapshot];
        const proposals = finalProposals;
        modelDisagreementMonitor.recordDecisions(decisionSnapshots);
        
        // 3. Apply Capital Usage Limit Constraint (资金上限约束)
        const proposalsWithinCap = proposals.filter(proposal => {
            if (!proposal.action.includes('enter')) return true; // 非开仓操作不受限制
            
            const newExposureUsd = exposureNowUsd + proposal.notionalUsd;
            return newExposureUsd <= capUsd;
        });

        let proposalsAfterRisk = [...proposalsWithinCap];

        // 4. Merge logic and determine final authority
        let mergedOutcome: TradeAttribution['mergedOutcome'] = 'approved';
        let decisionAuthority: DecisionAuthority = 'StrategistConsensus';
        let reasonFinal = 'Consensus approved';

        const currentClamp = this.getCurrentRiskClamp(newMode, config);
        if (currentClamp.forbidNewEntries && proposals.some(p => p.action.includes('enter'))) {
            mergedOutcome = 'blocked_riskClamp';
            reasonFinal = `Blocked by system mode: ${newMode} due to ${reason}`;
            
            // Assign more specific authority
            if (reason === 'DRAWDOWN_BREACH_LEVEL1' || reason === 'DRAWDOWN_BREACH_LEVEL2') {
                decisionAuthority = 'DrawdownGuard';
            } else if (reason.startsWith('EXTERNAL')) {
                decisionAuthority = 'ExternalSignalFreeze';
            } else if (reason === 'EXPOSURE_OVER_CAP') {
                decisionAuthority = 'RiskClamp';
            } else {
                decisionAuthority = 'RiskClamp';
            }
        } else if (proposalsWithinCap.length < proposals.length) {
            // 有提案被资金上限约束拦截
            mergedOutcome = 'blocked_riskClamp';
            reasonFinal = `Blocked by capital usage limit: ${(capPct * 100).toFixed(0)}% (${formatCurrency(exposureNowUsd)}/${formatCurrency(capUsd)})`;
            decisionAuthority = 'RiskClamp';
        }

        if (riskState.cooldownActive) {
            const filtered = proposalsAfterRisk.filter(p => !p.action.includes('enter'));
            if (filtered.length < proposalsAfterRisk.length) {
                mergedOutcome = 'blocked_riskClamp';
                const cooldownReason = riskState.cooldownReason ?? 'cooldown';
                reasonFinal = `Blocked by account risk: ${cooldownReason}`;
                decisionAuthority = cooldownReason === 'SEVERE_DRAWDOWN' ? 'DrawdownGuard' : 'RiskClamp';
            }
            proposalsAfterRisk = filtered;
        }

        // 4. Create and log attribution
        const tradeAttribution: TradeAttribution = {
            ts: Date.now(),
            symbol: proposalsAfterRisk[0]?.symbol || proposals[0]?.symbol || '',
            finalAction: mergedOutcome === 'approved' && proposalsAfterRisk.some(p=>p.action !== 'hold')
                ? (proposalsAfterRisk.find(p => p.action.includes('sell')) ? 'enter_short' : 'enter_long')
                : 'no_trade',
            contributingModels: proposals.map(p => ({
                model: p.model,
                stance: p.action.includes('buy') ? 'bullish' : p.action.includes('sell') ? 'bearish' : 'flat',
                confidence: p.confidence
            })),
            mergedOutcome,
            decisionAuthority,
            reasonFinal,
        };
        
        return { newMode, reason, proposals: proposalsAfterRisk, tradeAttribution, decisionSnapshots };
    }

    public async generateCouncilVerdict(
        config: UserSessionConfig,
        account: AccountState,
        market: MarketData,
        news: RiskSignalsSnapshot
    ): Promise<TradeDecision> {
        auditService.logStrategy('Evaluating market conditions...', { account, market, news });
        
        const decision: TradeDecision = {
            action: 'HOLD',
            symbol: '',
            reasoning: 'Market conditions are neutral. No clear opportunity identified.',
            source: 'Mock Consensus',
        };

        auditService.logTrade('Council decision (legacy)', decision);

        return new Promise(resolve => setTimeout(() => resolve(decision), 1000));
    }
}

export const strategist = new Strategist();