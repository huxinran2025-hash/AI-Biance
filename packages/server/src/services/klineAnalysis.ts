/**
 * K线数据采集与预处理服务
 * 负责获取K线数据，计算技术指标，生成K线快照
 */

import { fetchKlines } from './binance';
import { KlineData, KlineSnapshot } from '../types';
import {
  calculateMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  identifySupportResistance,
  identifyTrend,
  identifyVolatility,
} from './technicalIndicators';

/**
 * 获取并分析K线数据，生成快照
 * @param symbol 交易对符号，如'BTCUSDT'
 * @param interval K线间隔：1m, 5m, 15m, 1h, 4h, 1d, 1M
 * @param limit 数据条数，默认200
 */
export async function fetchKlineSnapshot(
  symbol: string,
  interval: string,
  limit: number = 200
): Promise<KlineSnapshot> {
  // 获取K线数据
  const klines = await fetchKlines(symbol, interval, limit);

  if (klines.length === 0) {
    throw new Error(`Failed to fetch klines for ${symbol}`);
  }

  // 计算技术指标
  const ma20Array = calculateMA(klines, 20);
  const ma50Array = calculateMA(klines, 50);
  const rsiArray = calculateRSI(klines, 14);
  const macdResult = calculateMACD(klines, 12, 26, 9);
  const bollingerResult = calculateBollingerBands(klines, 20, 2);

  // 获取最新值
  const lastIndex = klines.length - 1;
  const ma20 = ma20Array[lastIndex] || 0;
  const ma50 = ma50Array[lastIndex] || 0;
  const rsi = rsiArray[lastIndex] || 50;
  const macd = {
    macd: macdResult.macd[lastIndex] || 0,
    signal: macdResult.signal[lastIndex] || 0,
    histogram: macdResult.histogram[lastIndex] || 0,
  };
  const bollingerBands = {
    upper: bollingerResult.upper[lastIndex] || 0,
    middle: bollingerResult.middle[lastIndex] || 0,
    lower: bollingerResult.lower[lastIndex] || 0,
  };

  // 分析市场状态
  const trend = identifyTrend(klines);
  const volatility = identifyVolatility(klines);
  const { support, resistance } = identifySupportResistance(klines, 20);

  return {
    symbol,
    interval,
    timestamp: Date.now(),
    klines,
    indicators: {
      ma20,
      ma50,
      rsi,
      macd,
      bollingerBands,
    },
    marketState: {
      trend,
      volatility,
      support,
      resistance,
    },
  };
}
