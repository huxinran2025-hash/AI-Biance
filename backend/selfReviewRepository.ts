import {
    InternalModelId,
    ModelSelfReviewSnapshot,
    ModelSelfReviewSummary,
} from '../types';
import { auditService } from './audit';

const MAX_SNAPSHOTS_PER_MODEL = 50;

const formatPct = (value: number) => `${(value * 100).toFixed(2)}%`;

export class SelfReviewRepository {
    private snapshots = new Map<InternalModelId, ModelSelfReviewSnapshot[]>();

    record(snapshot: ModelSelfReviewSnapshot) {
        const list = this.snapshots.get(snapshot.model) ?? [];
        list.unshift(snapshot);
        if (list.length > MAX_SNAPSHOTS_PER_MODEL) {
            list.length = MAX_SNAPSHOTS_PER_MODEL;
        }
        this.snapshots.set(snapshot.model, list);
        auditService.logInfo(`Self review recorded for ${snapshot.model}: return ${formatPct(snapshot.totalReturnPct)}`);
    }

    getLatest(model: InternalModelId): ModelSelfReviewSnapshot | undefined {
        const list = this.snapshots.get(model);
        return list ? list[0] : undefined;
    }

    getSummary(model: InternalModelId): ModelSelfReviewSummary | undefined {
        const snapshot = this.getLatest(model);
        if (!snapshot) return undefined;
        return {
            snapshot,
            summaryText: this.buildSummaryText(snapshot),
        };
    }

    getAllSummaries(): Partial<Record<InternalModelId, ModelSelfReviewSummary>> {
        const result: Partial<Record<InternalModelId, ModelSelfReviewSummary>> = {};
        for (const model of this.snapshots.keys()) {
            const summary = this.getSummary(model);
            if (summary) {
                result[model] = summary;
            }
        }
        return result;
    }

    private buildSummaryText(snapshot: ModelSelfReviewSnapshot): string {
        const { accountValueUsd, availableCashUsd, totalReturnPct, maxDrawdownPct, exposureUsd, leverageNow, comment, sharpe } = snapshot;
        const cashRatio = accountValueUsd > 0 ? availableCashUsd / accountValueUsd : 0;
        const sections = [
            `净值: $${accountValueUsd.toFixed(2)} (回报 ${formatPct(totalReturnPct)})`,
            `现金: $${availableCashUsd.toFixed(2)} (${formatPct(cashRatio)})`,
            `敞口: $${exposureUsd.toFixed(2)} (杠杆 ${leverageNow.toFixed(2)}x, 回撤 ${formatPct(maxDrawdownPct)})`,
        ];
        if (typeof sharpe === 'number') {
            sections.push(`Sharpe ${sharpe.toFixed(2)}`);
        }
        if (comment) {
            sections.push(`自评: ${comment}`);
        }
        const positionsBrief = snapshot.positions
            .slice(0, 3)
            .map((pos) => `${pos.symbol} ${pos.side} x${pos.leverage} (${formatPct(pos.unrealizedPnl / Math.max(1, pos.notionalUsd))})`);
        if (positionsBrief.length > 0) {
            sections.push(`核心仓位: ${positionsBrief.join('; ')}`);
        }
        return sections.join(' | ');
    }
}

export const selfReviewRepository = new SelfReviewRepository();

