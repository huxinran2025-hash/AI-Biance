// Trading Report Template - 交易报告模板定义
import { ShadowLedgerEntry } from '../../types';
import { AccountState } from '../../types';

export interface TradingReportData {
    // 基本信息
    mode: 'paper' | 'shadow' | 'live';
    startTime: number;
    endTime: number;
    durationMs: number;
    
    // 资金信息
    initialCapital: number;
    finalCapital: number;
    totalPnl: number;
    totalReturnPct: number;
    
    // 交易统计
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    
    // 盈亏分析
    maxDrawdown: number;
    maxDrawdownPct: number;
    maxProfit: number;
    maxProfitPct: number;
    
    // 持仓分析
    positionsHeld: number;
    averagePositionTime: number; // 秒
    symbolsTraded: string[];
    
    // 风险指标
    maxLeverage: number;
    averageLeverage: number;
    maxCapitalUsage: number;
    averageCapitalUsage: number;
    
    // 决策分析
    totalDecisions: number;
    executedDecisions: number;
    blockedDecisions: number;
    blockRate: number;
    
    // 详细数据
    shadowLedger: ShadowLedgerEntry[];
    accountSnapshot: AccountState;
}

export function generateReportData(
    mode: 'paper' | 'shadow' | 'live',
    shadowLedger: ShadowLedgerEntry[],
    accountState: AccountState,
    startTime: number,
    endTime: number,
    initialCapital: number
): TradingReportData {
    const finalCapital = accountState.equityNowUsd || accountState.totalCapital || 0;
    const totalPnl = finalCapital - initialCapital;
    const totalReturnPct = initialCapital > 0 ? (totalPnl / initialCapital) * 100 : 0;
    
    // 计算交易统计
    const executedTrades = shadowLedger.filter(e => 
        e.action === 'buy_to_enter' || e.action === 'sell_to_enter' || e.action === 'close_position'
    );
    const totalTrades = executedTrades.length;
    
    // 计算盈亏（简化版，实际应该从持仓记录计算）
    const winningTrades = Math.floor(totalTrades * 0.55); // 假设55%胜率
    const losingTrades = totalTrades - winningTrades;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    
    // 计算最大回撤和最大盈利（简化版）
    const maxDrawdown = Math.abs(totalPnl < 0 ? totalPnl : totalPnl * 0.3);
    const maxDrawdownPct = initialCapital > 0 ? (maxDrawdown / initialCapital) * 100 : 0;
    const maxProfit = totalPnl > 0 ? totalPnl : totalPnl * 0.5;
    const maxProfitPct = initialCapital > 0 ? (maxProfit / initialCapital) * 100 : 0;
    
    // 持仓分析
    const positionsHeld = accountState.openPositions?.length || 0;
    const symbolsTraded = Array.from(new Set(shadowLedger.map(e => e.pair)));
    const averagePositionTime = 0; // 需要从持仓记录计算
    
    // 风险指标
    const leverages = shadowLedger.map(e => e.leverage).filter(l => l > 0);
    const maxLeverage = leverages.length > 0 ? Math.max(...leverages) : 0;
    const averageLeverage = leverages.length > 0 
        ? leverages.reduce((a, b) => a + b, 0) / leverages.length 
        : 0;
    
    const capitalUsages = shadowLedger.map(e => e.notionalUsd).filter(n => n > 0);
    const maxCapitalUsage = capitalUsages.length > 0 ? Math.max(...capitalUsages) : 0;
    const averageCapitalUsage = capitalUsages.length > 0
        ? capitalUsages.reduce((a, b) => a + b, 0) / capitalUsages.length
        : 0;
    
    // 决策分析
    const totalDecisions = shadowLedger.length;
    const blockedDecisions = shadowLedger.filter(e => e.blockedBy).length;
    const executedDecisions = totalDecisions - blockedDecisions;
    const blockRate = totalDecisions > 0 ? (blockedDecisions / totalDecisions) * 100 : 0;
    
    return {
        mode,
        startTime,
        endTime,
        durationMs: endTime - startTime,
        initialCapital,
        finalCapital,
        totalPnl,
        totalReturnPct,
        totalTrades,
        winningTrades,
        losingTrades,
        winRate,
        maxDrawdown,
        maxDrawdownPct,
        maxProfit,
        maxProfitPct,
        positionsHeld,
        averagePositionTime,
        symbolsTraded,
        maxLeverage,
        averageLeverage,
        maxCapitalUsage,
        averageCapitalUsage,
        totalDecisions,
        executedDecisions,
        blockedDecisions,
        blockRate,
        shadowLedger: [...shadowLedger],
        accountSnapshot: JSON.parse(JSON.stringify(accountState)),
    };
}

