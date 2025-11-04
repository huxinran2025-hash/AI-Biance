export interface RiskPromptContext {
    account: {
        equityNow: string;
        equityPeak: string;
        drawdownPct: string;
        availableCapital: string;
        cashRatioPct: string;
        marginUsagePct: string;
        leverage: string;
        maxDrawdownPct: string;
        cooldownStatus: string;
    };
    positionsOverview: string;
    newsContext: string;
    volatilityContext: string;
    system: {
        mode: string;
        triggerReason: string;
        entryRestriction: string;
    };
    disciplineInfo: string;
}

export function buildRiskPromptSections(context: RiskPromptContext): string[] {
    return [
        '## Role\nYou are the system risk analyst. Review the account state, market context, and alerts, then produce a risk score between 0.0 (high risk) and 1.0 (fully safe).',
        `## Account Health\n- Equity now: ${context.account.equityNow} (peak ${context.account.equityPeak})\n- Current drawdown: ${context.account.drawdownPct}\n- Available capital: ${context.account.availableCapital}\n- Risk metrics: cash ${context.account.cashRatioPct}, margin ${context.account.marginUsagePct}, leverage ${context.account.leverage}, max drawdown ${context.account.maxDrawdownPct}\n- Cooldown status: ${context.account.cooldownStatus}`,
        `## Positions\n${context.positionsOverview}`,
        `## News And Risk Signals\n${context.newsContext}`,
        `## Volatility Signals\n${context.volatilityContext}`,
        `## System State\n- Mode: ${context.system.mode}\n- Trigger reason: ${context.system.triggerReason}\n- Entry restriction: ${context.system.entryRestriction}`,
        `## Discipline Review\n${context.disciplineInfo}`,
        '## Output Requirements\nReturn JSON: { "masterRiskScore": 0.0-1.0, "reason": "your explanation" }'
    ];
}

