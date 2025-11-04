// Trading Report Generator - 交易报告生成服务
import { generateReportData, TradingReportData } from './tradingReportTemplate';
import { ShadowLedgerEntry } from '../../types';
import { AccountState } from '../../types';

export class TradingReportGenerator {
    /**
     * 生成交易报告数据
     */
    static generate(
        mode: 'paper' | 'shadow' | 'live',
        shadowLedger: ShadowLedgerEntry[],
        accountState: AccountState,
        startTime: number,
        endTime: number,
        initialCapital: number
    ): TradingReportData {
        return generateReportData(
            mode,
            shadowLedger,
            accountState,
            startTime,
            endTime,
            initialCapital
        );
    }
    
    /**
     * 格式化报告为文本（用于预览）
     */
    static formatAsText(data: TradingReportData): string {
        const lines: string[] = [];
        
        lines.push('='.repeat(60));
        lines.push(`交易报告 - ${data.mode.toUpperCase()}模式`);
        lines.push('='.repeat(60));
        lines.push('');
        
        lines.push('【期间概览】');
        lines.push(`开始时间: ${new Date(data.startTime).toLocaleString('zh-CN')}`);
        lines.push(`结束时间: ${new Date(data.endTime).toLocaleString('zh-CN')}`);
        lines.push(`持续时间: ${Math.floor(data.durationMs / 1000 / 60)} 分钟`);
        lines.push('');
        
        lines.push('【资金信息】');
        lines.push(`初始资金: $${data.initialCapital.toFixed(2)}`);
        lines.push(`最终资金: $${data.finalCapital.toFixed(2)}`);
        lines.push(`总盈亏: $${data.totalPnl.toFixed(2)}`);
        lines.push(`总收益率: ${data.totalReturnPct.toFixed(2)}%`);
        lines.push('');
        
        lines.push('【交易统计】');
        lines.push(`总交易数: ${data.totalTrades}`);
        lines.push(`盈利交易: ${data.winningTrades}`);
        lines.push(`亏损交易: ${data.losingTrades}`);
        lines.push(`胜率: ${data.winRate.toFixed(2)}%`);
        lines.push('');
        
        lines.push('【盈亏分析】');
        lines.push(`最大回撤: $${data.maxDrawdown.toFixed(2)} (${data.maxDrawdownPct.toFixed(2)}%)`);
        lines.push(`最大盈利: $${data.maxProfit.toFixed(2)} (${data.maxProfitPct.toFixed(2)}%)`);
        lines.push('');
        
        lines.push('【持仓分析】');
        lines.push(`持仓数量: ${data.positionsHeld}`);
        lines.push(`交易品种: ${data.symbolsTraded.join(', ')}`);
        lines.push('');
        
        lines.push('【风险指标】');
        lines.push(`最大杠杆: ${data.maxLeverage.toFixed(2)}×`);
        lines.push(`平均杠杆: ${data.averageLeverage.toFixed(2)}×`);
        lines.push(`最大资金使用: $${data.maxCapitalUsage.toFixed(2)}`);
        lines.push('');
        
        lines.push('【决策分析】');
        lines.push(`总决策数: ${data.totalDecisions}`);
        lines.push(`执行决策: ${data.executedDecisions}`);
        lines.push(`阻止决策: ${data.blockedDecisions}`);
        lines.push(`阻止率: ${data.blockRate.toFixed(2)}%`);
        lines.push('');
        
        lines.push('='.repeat(60));
        
        return lines.join('\n');
    }
}

