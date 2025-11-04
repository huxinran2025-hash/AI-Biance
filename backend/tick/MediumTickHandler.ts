// MediumTickHandler - 中频Tick处理器（10秒）
// 负责：账户同步、市场数据更新、持仓状态同步
import { auditService } from '../audit';
import { accountSync } from '../accountSync';
import { eventBus } from './EventBus';
import type { DashboardState } from '../../types';

export class MediumTickHandler {
    private lastBalance: number = 0;
    private isEnabled = true;

    /**
     * 执行中频Tick
     */
    async handle(state: DashboardState): Promise<void> {
        if (!this.isEnabled) return;

        const startTime = Date.now();

        try {
            // 1. 账户同步（从币安API获取余额和持仓）
            await this.syncAccount(state);

            // 2. 检查余额变化并触发事件
            this.checkBalanceChange(state);

            const duration = Date.now() - startTime;
            if (duration > 1000) {
                auditService.logWarn('[MediumTick] Slow execution', { duration });
            }
        } catch (error) {
            auditService.logError('[MediumTick] Error:', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * 同步账户数据
     */
    private async syncAccount(state: DashboardState): Promise<void> {
        try {
            // 主动触发账户同步（调用reconcileOnce）
            const reconcileResult = await accountSync.reconcileOnce();

            // 更新账户余额
            const cashBalance = reconcileResult.balances.find(b => b.asset === 'USDT');
            if (cashBalance) {
                const prevBalance = state.account.availableCapital || 0;
                state.account.availableCapital = cashBalance.free;
                
                // 如果余额变化，记录
                if (Math.abs(cashBalance.free - prevBalance) > 0.01) {
                    auditService.logInfo('[MediumTick] Balance updated', {
                        prev: prevBalance,
                        current: cashBalance.free,
                        change: cashBalance.free - prevBalance
                    });
                }
            }

            // 更新持仓（如果有外部持仓）
            reconcileResult.positions.forEach(externalPos => {
                const existingIndex = state.account.openPositions.findIndex(pos => 
                    pos.symbol === externalPos.symbol && pos.side === externalPos.side
                );
                
                if (existingIndex >= 0) {
                    // 更新现有持仓
                    state.account.openPositions[existingIndex] = {
                        ...state.account.openPositions[existingIndex],
                        size: externalPos.size,
                        entryPrice: externalPos.entryPrice,
                        leverage: externalPos.leverage,
                        notionalUsd: externalPos.notionalUsd,
                        unrealizedPnl: externalPos.unrealizedPnl,
                    };
                } else {
                    // 添加新持仓（外部手动开仓）
                    state.account.openPositions.push({
                        symbol: externalPos.symbol,
                        side: externalPos.side,
                        entryPrice: externalPos.entryPrice,
                        size: externalPos.size,
                        leverage: externalPos.leverage,
                        unrealizedPnl: externalPos.unrealizedPnl,
                        notionalUsd: externalPos.notionalUsd,
                    });
                }
            });

        } catch (error) {
            auditService.logWarn('[MediumTick] Account sync failed:', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * 检查余额变化并触发事件
     */
    private checkBalanceChange(state: DashboardState): void {
        const currentBalance = state.account.availableCapital || state.account.totalCapital || 0;
        
        if (this.lastBalance > 0) {
            const changePct = Math.abs((currentBalance - this.lastBalance) / this.lastBalance);
            
            // 如果变化超过0.1%，触发事件
            if (changePct >= 0.001) {
                auditService.logInfo('[MediumTick] Balance change detected', {
                    prev: this.lastBalance,
                    current: currentBalance,
                    changePct: (changePct * 100).toFixed(2) + '%'
                });
                
                eventBus.emit('balance_change', {
                    prevBalance: this.lastBalance,
                    currentBalance: currentBalance,
                    changePct: changePct,
                });
            }
        }
        
        this.lastBalance = currentBalance;
    }

    /**
     * 启用/禁用
     */
    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
    }
}

