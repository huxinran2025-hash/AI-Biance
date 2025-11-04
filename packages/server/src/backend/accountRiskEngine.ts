import {
    AccountRiskLimits,
    AccountRiskState,
    AccountState,
    ModelSelfReviewSnapshot,
    ExternalAlert,
} from '../types';
import { auditService } from './audit';

const DEFAULT_LIMITS: AccountRiskLimits = {
    minCashRatio: 0.25,
    maxMarginUsage: 0.75,
    maxAccountLeverage: 10,
    maxAccountDrawdownPct: 0.30,
};

export interface EntryGuardResult {
    allowed: boolean;
    reason?: string;
    riskState: AccountRiskState;
}

const clampRatio = (value: number) => {
    if (!Number.isFinite(value)) return 1;
    if (value < 0) return 0;
    return value;
};

export class AccountRiskEngine {
    private limits: AccountRiskLimits = { ...DEFAULT_LIMITS };
    private lastState: AccountRiskState | null = null;

    getLimits(): AccountRiskLimits {
        return { ...this.limits };
    }

    configure(patch: Partial<AccountRiskLimits>) {
        this.limits = { ...this.limits, ...patch };
        auditService.logInfo(`Risk limits updated: ${JSON.stringify(this.limits)}`);
    }

    evaluate(account: AccountState, externalAlerts: ExternalAlert[] = account.externalAlerts ?? []): AccountRiskState {
        const exposureUsd = account.openPositions.reduce((sum, pos) => sum + Math.abs(pos.notionalUsd), 0);
        const equity = account.equityNowUsd || account.totalCapital || 1;
        const cashRatio = clampRatio(account.availableCapital / Math.max(1, equity));
        const marginUsage = clampRatio(exposureUsd / Math.max(1, equity));
        const accountLeverage = clampRatio(exposureUsd / Math.max(1, account.totalCapital));
        const drawdownPct = account.equityPeakUsd > 0
            ? (account.equityPeakUsd - account.equityNowUsd) / account.equityPeakUsd
            : 0;

        let cooldownReason: AccountRiskState['cooldownReason'];
        if (drawdownPct >= this.limits.maxAccountDrawdownPct) {
            cooldownReason = 'SEVERE_DRAWDOWN';
        } else if (cashRatio < this.limits.minCashRatio) {
            cooldownReason = 'INSUFFICIENT_CASH_BUFFER';
        } else if (marginUsage > this.limits.maxMarginUsage) {
            cooldownReason = 'MARGIN_LIMIT';
        } else if (accountLeverage > this.limits.maxAccountLeverage) {
            cooldownReason = 'LEVERAGE_LIMIT';
        } else if (externalAlerts?.some(alert => alert.severity === 'critical' && (alert.topic === 'regulator' || alert.topic === 'exchange'))) {
            cooldownReason = 'EXTERNAL_ALERT';
            const triggeringAlerts = externalAlerts.filter(alert => alert.severity === 'critical' && (alert.topic === 'regulator' || alert.topic === 'exchange'));
            auditService.logInfo(`[AccountRisk] External alert check: Found ${triggeringAlerts.length} critical alerts (${triggeringAlerts.map(a => `${a.source}:${a.topic}`).join(', ')})`);
        }

        const cooldownActive = Boolean(cooldownReason);
        const riskState: AccountRiskState = {
            cooldownActive,
            cooldownReason,
            triggeredTs: cooldownActive ? Date.now() : this.lastState?.triggeredTs,
            metrics: {
                cashRatio,
                marginUsage,
                accountLeverage,
                drawdownPct,
            },
            externalAlerts: externalAlerts?.slice(0, 10),
        };
        if (
            cooldownReason === 'EXTERNAL_ALERT' &&
            externalAlerts?.length &&
            this.lastState?.cooldownReason !== 'EXTERNAL_ALERT'
        ) {
            auditService.logExternalAlertCooldown(externalAlerts);
        }
        this.lastState = riskState;
        return riskState;
    }

    guardNewEntry(account: AccountState): EntryGuardResult {
        const riskState = this.evaluate(account);
        if (!riskState.cooldownActive) {
            return { allowed: true, riskState };
        }
        const reason = riskState.cooldownReason ?? 'UNKNOWN';
        auditService.logWarn(`Risk gate rejected new entry: ${reason}`);
        return {
            allowed: false,
            reason,
            riskState,
        };
    }

    ingestSelfReview(review: ModelSelfReviewSnapshot) {
        const { availableCashUsd, accountValueUsd, totalReturnPct, systemMode } = review;
        const cashRatio = accountValueUsd > 0 ? availableCashUsd / accountValueUsd : 0;

        if (totalReturnPct <= -this.limits.maxAccountDrawdownPct) {
            auditService.logWarn(`[SelfReview] ${review.model} is in severe drawdown (${(totalReturnPct * 100).toFixed(2)}%), enforcing cooldown.`);
            this.lastState = {
                cooldownActive: true,
                cooldownReason: 'SEVERE_DRAWDOWN',
                triggeredTs: Date.now(),
                metrics: {
                    cashRatio,
                    marginUsage: 0,
                    accountLeverage: 0,
                    drawdownPct: Math.abs(totalReturnPct),
                },
            };
        }

        if (cashRatio < this.limits.minCashRatio && systemMode === 'NORMAL') {
            auditService.logWarn(`[SelfReview] ${review.model} reports low cash buffer (${(cashRatio * 100).toFixed(1)}%).`);
        }
    }
}

export const accountRiskEngine = new AccountRiskEngine();

