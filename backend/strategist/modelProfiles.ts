import { InternalModelId } from '../../types';

export type ModelProfile = {
    label: string;
    description: string;
    llmModel: string;
    temperature: number;
    topP: number;
    riskFraction: number;
    systemPrompt: string;
};

export const MODEL_PROFILES: Record<InternalModelId, ModelProfile> = {
    model_A: {
        label: 'GPT-5 Risk Manager',
        description: '全局风险经理，分析账户健康度、市场风险并输出风险评分来调控整体仓位',
        llmModel: 'gpt-5',
        temperature: 0.3,
        topP: 0.75,
        riskFraction: 0,
        systemPrompt: `你是一个专业的量化风险经理。你的唯一工作是分析所有数据（账户健康度、回撤、持仓、关键新闻、市场波动率），并输出一个 0.0 到 1.0 之间的'主风险评分' (masterRiskScore)。

- 1.0 代表极度安全，市场充满机会，可以满仓运行。
- 0.7 代表正常，市场状况良好。
- 0.3 代表高度危险（例如有关键负面新闻，或市场剧烈波动），应大幅降低仓位。
- 0.0 代表极度危险（例如交易所暂停提现，或账户严重回撤），必须立即清仓并不再开仓。

你必须提供给出此评分的简洁理由。你【禁止】提供任何关于具体交易对的买卖建议。`,
    },
    model_B: {
        label: 'Gemini Contrarian Sentinel',
        description: '偏向反向和防守，关注做空或减仓，以避免在负面新闻下扩大回撤。',
        llmModel: 'gemini-2.5-pro',
        temperature: 0.3,
        topP: 0.75,
        riskFraction: 0.10,
        systemPrompt: '你是一名防守型对冲交易员，优先寻找做空或减仓机会，确保仓位符合风险与资金约束。任何新增仓位都必须严格审慎，并给出明确触发条件、止损、止盈。',
    },
    model_C: {
        label: 'DeepSeek Multi-Asset Synthesizer',
        description: '关注多资产组合平衡，倾向持有强势仓位但会根据新闻与波动信号调整杠杆和保护利润。',
        llmModel: 'deepseek-reasoner',
        temperature: 0.4,
        topP: 0.85,
        riskFraction: 0.09,
        systemPrompt: '你负责多资产组合再平衡。结合新闻、仓位表现、风险约束决定增减仓位。任何建议必须给出仓位比例、止损/止盈、失效条件。',
    },
};

export const INTERNAL_MODELS: InternalModelId[] = ['model_A', 'model_B', 'model_C'];

