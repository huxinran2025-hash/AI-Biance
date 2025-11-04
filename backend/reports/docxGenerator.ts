// DOCX Generator - DOCX文档生成器
// 注意：这个文件需要安装 docx 包
// npm install docx file-saver

import { TradingReportData } from './tradingReportTemplate';
import { TradingReportGenerator } from './tradingReportGenerator';

// 动态导入docx库（如果可用）
let docxLib: any = null;
try {
    // 这里需要在实际使用时安装 docx 包
    // docxLib = require('docx');
} catch (error) {
    console.warn('[DOCXGenerator] docx library not available, will use text fallback');
}

export class DOCXGenerator {
    /**
     * 生成DOCX文档
     */
    static async generate(data: TradingReportData): Promise<Blob> {
        // 如果docx库不可用，返回文本格式的Blob作为fallback
        if (!docxLib) {
            const text = TradingReportGenerator.formatAsText(data);
            return new Blob([text], { type: 'text/plain;charset=utf-8' });
        }

        // TODO: 实现真正的DOCX生成
        // 这里需要根据docx库的API实现
        // 暂时返回文本格式
        const text = TradingReportGenerator.formatAsText(data);
        return new Blob([text], { type: 'text/plain;charset=utf-8' });
    }

    /**
     * 生成文件名
     */
    static generateFilename(mode: string, timestamp: number): string {
        const date = new Date(timestamp);
        const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = date.toTimeString().slice(0, 8).replace(/:/g, '');
        return `trading_report_${mode}_${dateStr}_${timeStr}.txt`; // 暂时使用.txt，有docx后改为.docx
    }
}

// 简化版DOCX生成（使用docx库）
// 注意：需要先安装: npm install docx
export async function generateDOCXReport(data: TradingReportData): Promise<Blob> {
    try {
        // 尝试动态导入docx
        // @ts-ignore - docx module may not be installed
        const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = await import('docx');
        
        const doc = new Document({
            sections: [{
                properties: {},
                children: [
                    new Paragraph({
                        text: `交易报告 - ${data.mode.toUpperCase()}模式`,
                        heading: HeadingLevel.HEADING_1,
                    }),
                    new Paragraph({ text: '' }),
                    
                    // 期间概览
                    new Paragraph({
                        text: '期间概览',
                        heading: HeadingLevel.HEADING_2,
                    }),
                    new Paragraph({
                        children: [
                            new TextRun(`开始时间: ${new Date(data.startTime).toLocaleString('zh-CN')}`),
                        ],
                    }),
                    new Paragraph({
                        children: [
                            new TextRun(`结束时间: ${new Date(data.endTime).toLocaleString('zh-CN')}`),
                        ],
                    }),
                    new Paragraph({
                        children: [
                            new TextRun(`持续时间: ${Math.floor(data.durationMs / 1000 / 60)} 分钟`),
                        ],
                    }),
                    new Paragraph({ text: '' }),
                    
                    // 资金信息表格
                    new Paragraph({
                        text: '资金信息',
                        heading: HeadingLevel.HEADING_2,
                    }),
                    new Table({
                        columnWidths: [3000, 3000],
                        rows: [
                            new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph('项目')] }),
                                    new TableCell({ children: [new Paragraph('金额')] }),
                                ],
                            }),
                            new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph('初始资金')] }),
                                    new TableCell({ children: [new Paragraph(`$${data.initialCapital.toFixed(2)}`)] }),
                                ],
                            }),
                            new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph('最终资金')] }),
                                    new TableCell({ children: [new Paragraph(`$${data.finalCapital.toFixed(2)}`)] }),
                                ],
                            }),
                            new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph('总盈亏')] }),
                                    new TableCell({ children: [new Paragraph(`$${data.totalPnl.toFixed(2)}`)] }),
                                ],
                            }),
                            new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph('总收益率')] }),
                                    new TableCell({ children: [new Paragraph(`${data.totalReturnPct.toFixed(2)}%`)] }),
                                ],
                            }),
                        ],
                    }),
                    new Paragraph({ text: '' }),
                    
                    // 交易统计
                    new Paragraph({
                        text: '交易统计',
                        heading: HeadingLevel.HEADING_2,
                    }),
                    new Table({
                        columnWidths: [3000, 3000],
                        rows: [
                            new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph('指标')] }),
                                    new TableCell({ children: [new Paragraph('数值')] }),
                                ],
                            }),
                            new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph('总交易数')] }),
                                    new TableCell({ children: [new Paragraph(String(data.totalTrades))] }),
                                ],
                            }),
                            new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph('胜率')] }),
                                    new TableCell({ children: [new Paragraph(`${data.winRate.toFixed(2)}%`)] }),
                                ],
                            }),
                        ],
                    }),
                ],
            }],
        });

        const blob = await Packer.toBlob(doc);
        return blob;
    } catch (error) {
        // 如果docx不可用，返回文本格式
        console.warn('[generateDOCXReport] docx library not available, using text fallback', error);
        const text = TradingReportGenerator.formatAsText(data);
        return new Blob([text], { type: 'text/plain;charset=utf-8' });
    }
}

