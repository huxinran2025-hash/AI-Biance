import {
    DisagreementSignal,
    InternalModelId,
    ModelDecisionSnapshot,
} from '../types';
import { auditService } from './audit';

const MAX_SIGNALS = 20;

export class ModelDisagreementMonitor {
    private latestDecisions: ModelDecisionSnapshot[] = [];
    private signals: DisagreementSignal[] = [];

    recordDecisions(decisions: ModelDecisionSnapshot[]) {
        this.latestDecisions = decisions;
        const signals = this.detectDisagreements(decisions);
        signals.forEach(signal => this.pushSignal(signal));
    }

    getSignals(): DisagreementSignal[] {
        return [...this.signals];
    }

    private pushSignal(signal: DisagreementSignal) {
        this.signals.unshift(signal);
        if (this.signals.length > MAX_SIGNALS) {
            this.signals.length = MAX_SIGNALS;
        }
        auditService.logInfo(`模型分歧信号: ${signal.symbol} ${signal.severity}，参与模型 ${signal.involvedModels.join(',')}`);
    }

    private detectDisagreements(decisions: ModelDecisionSnapshot[]): DisagreementSignal[] {
        const grouped = new Map<string, ModelDecisionSnapshot[]>();
        decisions.forEach(decision => {
            if (!grouped.has(decision.symbol)) {
                grouped.set(decision.symbol, []);
            }
            grouped.get(decision.symbol)?.push(decision);
        });

        const signals: DisagreementSignal[] = [];
        for (const [symbol, symbolDecisions] of grouped.entries()) {
            const stances = new Set(symbolDecisions.map(d => d.stance));
            if (!(stances.has('LONG') && stances.has('SHORT'))) continue;

            const involved = symbolDecisions
                .filter(d => d.stance !== 'FLAT')
                .map(d => d.model as InternalModelId);
            const confidence = Math.max(...symbolDecisions.map(d => d.confidence));
            const severity = symbolDecisions.some(d => d.leverage >= 15 && d.confidence >= 0.7)
                ? 'HIGH'
                : 'MODERATE';

            signals.push({
                ts: Date.now(),
                symbol,
                involvedModels: Array.from(new Set(involved)),
                severity,
                confidence,
            });
        }
        return signals;
    }
}

export const modelDisagreementMonitor = new ModelDisagreementMonitor();

