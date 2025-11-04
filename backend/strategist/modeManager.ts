import { SystemMode, BrakeReason, UserSessionConfig, DashboardState, AppliedRiskClamp } from '../../types';
import { newsSignalService } from '../news';
import { exchangeRiskWatcher } from '../exchangeRiskWatcher';
import { sumExposureUsd } from '../../utils/exposure';

const EXTERNAL_OUTAGE_TOLERANCE_MS = 90 * 1000;

export function updateSystemMode(state: DashboardState, config: UserSessionConfig): { newMode: SystemMode; reason: BrakeReason | 'RECOVERY' } {
    const { marketRegime, disciplineState, account } = state;
    const news = newsSignalService.getCurrentSignals();
    const exchangeHealth = exchangeRiskWatcher.getHealthSummary();

    // Priority 1: Exchange Risk Monitoring
    if (exchangeHealth.overallRisk === 'critical') {
        const criticalIssues = exchangeHealth.criticalIssues;
        if (criticalIssues.some(issue => 
            issue.status === 'withdrawal_suspended' || 
            issue.status === 'trading_halted' || 
            issue.status === 'regulatory_action'
        )) {
            return { newMode: 'EMERGENCY_LANDING', reason: 'EXTERNAL_EXCHANGE_RISK' };
        }
        return { newMode: 'COOL_DOWN_EXTERNAL_UNSAFE', reason: 'EXTERNAL_EXCHANGE_RISK' };
    }
    if (exchangeHealth.overallRisk === 'degraded') {
        return { newMode: 'COOL_DOWN_EXTERNAL_UNSAFE', reason: 'EXTERNAL_EXCHANGE_RISK' };
    }

    // Priority 2: Capital Usage Limit Enforcement
    const capPct = (config.capitalUsageLimitPct || 30) / 100;
    const capUsd = Math.max(0, account.equityNowUsd) * capPct;
    const exposureNowUsd = sumExposureUsd(account.openPositions);
    
    if (exposureNowUsd > capUsd) {
        return { newMode: 'COOL_DOWN_CAPITAL_STRESS', reason: 'EXPOSURE_OVER_CAP' };
    }

    // Priority 3: Capital-based Drawdown Guard
    const drawdownPct = account.equityPeakUsd > 0 ? (account.equityPeakUsd - account.equityNowUsd) / account.equityPeakUsd : 0;
    if (drawdownPct > 0.10) {
        return { newMode: 'SELF_ABUSE_PROTECTION', reason: 'DRAWDOWN_BREACH_LEVEL2' };
    }
    if (drawdownPct > 0.05) {
        return { newMode: 'COOL_DOWN_CAPITAL_STRESS', reason: 'DRAWDOWN_BREACH_LEVEL1' };
    }
    
    // Priority 4: External source reliability & outage duration
    if (!marketRegime.available) {
        const downTime = Date.now() - marketRegime.sourceMeta.lastGoodTs;
        if (downTime > EXTERNAL_OUTAGE_TOLERANCE_MS) {
             return { newMode: 'EMERGENCY_LANDING', reason: 'EXTERNAL_DOWN_TOO_LONG' };
        }
         const reason = marketRegime.sourceMeta.reason === 'SchemaChanged' 
            ? 'EXTERNAL_SCHEMA_CHANGED' 
            : 'EXTERNAL_UNAVAILABLE';
        return { newMode: 'COOL_DOWN_EXTERNAL_UNSAFE', reason };
    }
    
    // Priority 5: Self-abuse protection
    if (disciplineState.diagnostics.revengeTrading || disciplineState.diagnostics.panicTrading) {
        return { newMode: 'SELF_ABUSE_PROTECTION', reason: 'SELF_ABUSE_DETECTED' };
    }

    // Priority 6: P&L Nuance Guard
    if (disciplineState.diagnostics.unrealizedProfitHigh) {
        return { newMode: 'COOL_DOWN_CAPITAL_STRESS', reason: 'PNL_UNREALIZED_PROFIT_LOCK_REQUIRED' };
    }
    if (disciplineState.diagnostics.profitConcentrationHigh) {
        return { newMode: 'COOL_DOWN_CAPITAL_STRESS', reason: 'PNL_OVERCONCENTRATED' };
    }

    // Priority 7: Critical news
    if (news.overall_severity === "CRITICAL") {
        return { newMode: 'REDUCE_ONLY', reason: 'CRITICAL_NEWS' };
    }

    return { newMode: 'NORMAL', reason: 'RECOVERY' };
}

export function getCurrentRiskClamp(mode: SystemMode, config: UserSessionConfig): AppliedRiskClamp {
    switch(mode) {
        case 'EMERGENCY_LANDING':
            return { forbidNewEntries: true, maxTotalExposurePct: 0.02, maxConcurrentSymbols: 1, modeLabel: mode };
        case 'SELF_ABUSE_PROTECTION':
            return { forbidNewEntries: true, maxTotalExposurePct: 0.05, maxConcurrentSymbols: 1, modeLabel: mode };
        case 'COOL_DOWN_CAPITAL_STRESS':
            return { forbidNewEntries: true, maxTotalExposurePct: 0.10, maxConcurrentSymbols: 1, modeLabel: mode };
        case 'COOL_DOWN_EXTERNAL_UNSAFE':
            return { forbidNewEntries: true, maxTotalExposurePct: 0.10, maxConcurrentSymbols: 1, modeLabel: mode };
        case 'REDUCE_ONLY':
             return { forbidNewEntries: true, maxTotalExposurePct: 0.20, maxConcurrentSymbols: 2, modeLabel: mode };
        case 'PAUSED':
             return { forbidNewEntries: true, maxTotalExposurePct: 0, maxConcurrentSymbols: 0, modeLabel: mode };
        case 'NORMAL':
        default:
            return { 
                forbidNewEntries: false, 
                maxTotalExposurePct: (config.capitalUsageLimitPct || 30) / 100, 
                maxConcurrentSymbols: (config.allowedPairs || []).length, 
                modeLabel: 'NORMAL' 
            };
    }
}







