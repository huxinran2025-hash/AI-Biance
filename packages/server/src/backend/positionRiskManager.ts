import {
    AccountState,
    MarketData,
    Position,
    PositionAdjustment,
    PositionRiskManagement,
} from '../types';
import { auditService } from './audit';

const DEFAULT_TP_TRIGGER = 0.30;
const DEFAULT_SCALE_OUT = 0.30;

const ensureRiskManagement = (position: Position): PositionRiskManagement => {
    if (!position.riskManagement) {
        position.riskManagement = {
            takeProfitTrailing: {
                activated: false,
                triggerReturnPct: DEFAULT_TP_TRIGGER,
                scaledOutPct: DEFAULT_SCALE_OUT,
            },
            dynamicStop: {
                activated: false,
            },
            manualOverrides: [],
        };
    }
    return position.riskManagement;
};

const calculatePnlPct = (position: Position, currentPrice: number): number => {
    const direction = position.side === 'LONG' ? 1 : -1;
    const entryPrice = position.entryPrice || currentPrice;
    if (!entryPrice) return 0;
    return direction * (currentPrice - entryPrice) / entryPrice;
};

export class PositionRiskManager {
    bootstrapPositions(account: AccountState) {
        account.openPositions.forEach(ensureRiskManagement);
    }

    evaluate(account: AccountState, market: MarketData): PositionAdjustment[] {
        const adjustments: PositionAdjustment[] = [];
        account.openPositions.forEach((position) => {
            const marketEntry = market[position.symbol];
            if (!marketEntry) return;

            const riskManagement = ensureRiskManagement(position);
            const pnlPct = calculatePnlPct(position, marketEntry.price);

            if (!riskManagement.takeProfitTrailing.activated && pnlPct >= riskManagement.takeProfitTrailing.triggerReturnPct) {
                const reduceRatio = riskManagement.takeProfitTrailing.scaledOutPct;
                const realized = pnlPct * position.notionalUsd * reduceRatio;
                adjustments.push({
                    kind: 'scale_out',
                    symbol: position.symbol,
                    reduceRatio,
                    realizedPnlUsd: realized,
                    reason: 'TRAILING_PROFIT_LOCK',
                    newStopLoss: position.entryPrice,
                });

                riskManagement.takeProfitTrailing.activated = true;
                riskManagement.takeProfitTrailing.lastTriggeredTs = Date.now();
                riskManagement.dynamicStop.activated = true;
                riskManagement.dynamicStop.newStopLoss = position.entryPrice;
                riskManagement.dynamicStop.lastAdjustedTs = Date.now();

                auditService.logInfo(`Position ${position.symbol}触发分批止盈，减仓${(reduceRatio * 100).toFixed(0)}%，止损上移至进场价。`);
            }

            if (riskManagement.dynamicStop.activated && riskManagement.dynamicStop.newStopLoss) {
                const targetPrice = riskManagement.dynamicStop.newStopLoss;
                const breached = position.side === 'LONG'
                    ? marketEntry.price <= targetPrice
                    : marketEntry.price >= targetPrice;
                if (breached) {
                    const realizedPnl = pnlPct * position.notionalUsd;
                    adjustments.push({
                        kind: 'stop_exit',
                        symbol: position.symbol,
                        exitPrice: targetPrice,
                        realizedPnlUsd: realizedPnl,
                        reason: 'DYNAMIC_STOP_TRIGGERED',
                    });
                    auditService.logInfo(`Position ${position.symbol}触发动态止损，价格触及 ${targetPrice.toFixed(2)}。`);
                }
            }
        });
        return adjustments;
    }

    applyAdjustments(account: AccountState, adjustments: PositionAdjustment[]) {
        adjustments.forEach((adjustment) => {
            const position = account.openPositions.find((pos) => pos.symbol === adjustment.symbol);
            if (!position) return;

            if (adjustment.kind === 'scale_out') {
                const reduceRatio = Math.min(0.99, Math.max(0, adjustment.reduceRatio));
                const originalSize = position.size;
                const sizeReduction = originalSize * reduceRatio;
                position.size = originalSize - sizeReduction;
                position.notionalUsd = position.notionalUsd * (1 - reduceRatio);
                account.availableCapital += adjustment.realizedPnlUsd;
                account.totalCapital += adjustment.realizedPnlUsd;
                if (position.riskManagement?.dynamicStop && adjustment.newStopLoss) {
                    position.riskManagement.dynamicStop.newStopLoss = adjustment.newStopLoss;
                }
                if (position.size <= 0.0001) {
                    // Treat as fully closed
                    this.closePosition(account, position.symbol, adjustment.reason, adjustment.realizedPnlUsd);
                }
            }

            if (adjustment.kind === 'stop_exit') {
                this.closePosition(account, position.symbol, adjustment.reason, adjustment.realizedPnlUsd);
            }

            if (adjustment.kind === 'stop_loss_update') {
                ensureRiskManagement(position).dynamicStop.newStopLoss = adjustment.newStopLoss;
                ensureRiskManagement(position).dynamicStop.lastAdjustedTs = Date.now();
            }
        });
    }

    private closePosition(account: AccountState, symbol: string, reason: string, realizedPnlUsd: number) {
        const index = account.openPositions.findIndex((pos) => pos.symbol === symbol);
        if (index === -1) return;
        const [position] = account.openPositions.splice(index, 1);
        account.totalCapital += realizedPnlUsd;
        account.availableCapital += realizedPnlUsd;
        auditService.logInfo(`Position ${symbol} 已平仓，原因: ${reason}，实现盈亏 $${realizedPnlUsd.toFixed(2)}。`);
        account.closedTrades.push({
            symbol,
            side: position.side,
            pnlUsd: realizedPnlUsd,
            pnlPct: realizedPnlUsd / Math.max(1, position.notionalUsd),
            openTs: Date.now(),
            closeTs: Date.now(),
            durationMinutes: 0,
            maxLeverage: position.leverage,
            entryReason: reason,
            closeReason: reason,
            attributedModel: 'model_A',
        });
    }
}

export const positionRiskManager = new PositionRiskManager();

