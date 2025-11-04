import { MarketRegimeHint, AccountState, SelfDisciplineState, BehaviorDiagnostics, SelfReviewWindowStats, ReviewWindow } from '../../types';
import { auditService } from '../audit';
import { sha256 } from '../utils';

// ExternalModelsWatcherService Mock
export class ExternalWatcher {
    private cycle = 0;
    private readonly CYCLE_LENGTH = 120; // ~4 minutes cycle for demo
    private lastGoodTs: number = Date.now();
    private lastMarketRegime: MarketRegimeHint | null = null;

    setLastMarketRegime(regime: MarketRegimeHint) {
        this.lastMarketRegime = regime;
        if (regime.available) {
            this.lastGoodTs = regime.sourceMeta.lastGoodTs;
        }
    }

    async tick(): Promise<MarketRegimeHint> {
        this.cycle = (this.cycle + 1) % this.CYCLE_LENGTH;
        const now = Date.now();

        // Scenario: unavailable for an extended period (triggers EMERGENCY_LANDING)
        // Down from tick 20 to 100. (80 ticks * 2s = 160s, which is > 90s tolerance)
        if (this.cycle >= 20 && this.cycle < 100) {
             return {
                available: false,
                environmentAdvisory: null,
                disagreementLevel: null,
                confidence: 0,
                sourceMeta: {
                    status: 'unreachable',
                    reason: 'Timeout',
                    lastGoodTs: this.lastMarketRegime?.sourceMeta.lastGoodTs || this.lastGoodTs, 
                }
            };
        }

        // Scenario: Normal operation
        this.lastGoodTs = now;
        const checksum = await sha256('stable_dom_structure');
        return {
            available: true,
            environmentAdvisory: 'TRENDING_GO_WITH_IT',
            disagreementLevel: 'LOW',
            confidence: 0.9,
            sourceMeta: {
                status: 'ok',
                lastGoodTs: now,
                checksum: checksum,
            }
        };
    }
}

// SelfReviewCoach Mock
export class SelfReviewCoach {
    tick(account: AccountState): SelfDisciplineState {
        const diagnostics: BehaviorDiagnostics = {
            panicTrading: false, revengeTrading: false, overconcentration: false, overtrading: false,
            profitConcentrationHigh: false, unrealizedProfitHigh: false,
        };
        
        // Dynamic PnL Nuance Guard logic
        const unrealizedPnl = account.openPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
        const totalEquity = account.totalCapital + unrealizedPnl;

        // Unrealized profit is high if it's > 30% of total equity
        if (unrealizedPnl > 0 && totalEquity > 0 && (unrealizedPnl / totalEquity) > 0.3) {
            diagnostics.unrealizedProfitHigh = true;
        }

        // Profit concentration is high if one position accounts for > 80% of unrealized PNL
        if (account.openPositions.length > 1 && unrealizedPnl > 0) {
            const maxPnl = Math.max(...account.openPositions.map(p => p.unrealizedPnl));
            if ((maxPnl / unrealizedPnl) > 0.8) {
                diagnostics.profitConcentrationHigh = true;
            }
        }
        
        // Simulate revenge trading after a big loss
        const drawdownPct = account.equityPeakUsd > 0 ? (account.equityPeakUsd - account.equityNowUsd) / account.equityPeakUsd : 0;
        if (drawdownPct > 0.08) { // If drawdown is severe, simulate revenge trading
            diagnostics.revengeTrading = true;
        }

        const mockWindow = (w: ReviewWindow): SelfReviewWindowStats => ({
            window: w, realizedPnLUsd: (Math.random() - 0.5) * 100, unrealizedPnLUsd: 0,
            maxDrawdownPct: diagnostics.revengeTrading ? 0.18 : 0.05,
            winRatePct: diagnostics.revengeTrading ? 0.3 : 0.6,
            avgHoldingTimeMinutes: 60, longVsShortBias: { longPct: 0.5, shortPct: 0.5 },
            churnRate: 1.5, overexposureFlags: [], tradeCount: 5,
        });

        return {
            lastReviewTs: Date.now(),
            windows: [mockWindow('24h')],
            diagnostics,
            perModelStats: { model_A: [], model_B: [], model_C: [] }
        };
    }
}

