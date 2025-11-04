/**
 * 鎶€鏈寚鏍囪绠楁湇鍔? * 鎻愪緵MA銆丷SI銆丮ACD銆佸竷鏋楀甫绛夊父鐢ㄦ妧鏈寚鏍囩殑璁＄畻
 */

import { KlineData } from '../types';

/**
 * 璁＄畻绉诲姩骞冲潎绾?(Moving Average)
 */
export function calculateMA(klines: KlineData[], period: number): number[] {
  if (klines.length < period) {
    return new Array(klines.length).fill(0);
  }

  const ma: number[] = [];
  for (let i = 0; i < klines.length; i++) {
    if (i < period - 1) {
      ma.push(0);
    } else {
      const sum = klines.slice(i - period + 1, i + 1).reduce((acc, k) => acc + k.close, 0);
      ma.push(sum / period);
    }
  }
  return ma;
}

/**
 * 璁＄畻RSI (Relative Strength Index)
 */
export function calculateRSI(klines: KlineData[], period: number = 14): number[] {
  if (klines.length < period + 1) {
    return new Array(klines.length).fill(50);
  }

  const rsi: number[] = new Array(period).fill(50);
  const gains: number[] = [];
  const losses: number[] = [];

  // 璁＄畻浠锋牸鍙樺寲
  for (let i = 1; i < klines.length; i++) {
    const change = klines[i].close - klines[i - 1].close;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }

  // 鍒濆骞冲潎鏀剁泭鍜屾崯澶?  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // 璁＄畻RSI
  for (let i = period; i < gains.length; i++) {
    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      const currentRSI = 100 - (100 / (1 + rs));
      rsi.push(currentRSI);
    }

    // 鏇存柊骞冲潎鏀剁泭鍜屾崯澶憋紙浣跨敤鎸囨暟绉诲姩骞冲潎锛?    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  return rsi;
}

/**
 * 璁＄畻MACD鎸囨爣
 */
export function calculateMACD(
  klines: KlineData[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const macd: number[] = [];
  const signal: number[] = [];
  const histogram: number[] = [];

  if (klines.length < slowPeriod) {
    return { macd: new Array(klines.length).fill(0), signal: new Array(klines.length).fill(0), histogram: new Array(klines.length).fill(0) };
  }

  // 璁＄畻EMA
  const calculateEMA = (data: number[], period: number): number[] => {
    const ema: number[] = [];
    const multiplier = 2 / (period + 1);

    // 鍒濆鍊间娇鐢⊿MA
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += data[i];
      ema.push(i === period - 1 ? sum / period : 0);
    }

    // 璁＄畻EMA
    for (let i = period; i < data.length; i++) {
      const currentEMA = (data[i] - ema[i - 1]) * multiplier + ema[i - 1];
      ema.push(currentEMA);
    }

    return ema;
  };

  const closes = klines.map(k => k.close);
  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);

  // 计算MACD线
  for (let i = 0; i < klines.length; i++) {
    if (i < slowPeriod - 1) {
      macd.push(0);
    } else {
      macd.push(emaFast[i] - emaSlow[i]);
    }
  }

  // 计算信号线（MACD的EMA）
  const macdSignal = calculateEMA(macd.slice(slowPeriod - 1), signalPeriod);
  for (let i = 0; i < slowPeriod - 1; i++) {
    signal.push(0);
  }
  for (let i = 0; i < macdSignal.length; i++) {
    signal.push(macdSignal[i]);
  }

  // 计算柱状图
  for (let i = 0; i < klines.length; i++) {
    histogram.push(macd[i] - signal[i]);
  }

  return { macd, signal, histogram };
}

/**
 * 璁＄畻甯冩灄甯? */
export function calculateBollingerBands(
  klines: KlineData[],
  period: number = 20,
  stdDev: number = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const upper: number[] = [];
  const middle: number[] = [];
  const lower: number[] = [];

  if (klines.length < period) {
    return {
      upper: new Array(klines.length).fill(0),
      middle: new Array(klines.length).fill(0),
      lower: new Array(klines.length).fill(0),
    };
  }

  // 计算移动平均线（中轨）
  const ma = calculateMA(klines, period);

  // 计算标准偏差
  for (let i = 0; i < klines.length; i++) {
    if (i < period - 1) {
      upper.push(0);
      middle.push(0);
      lower.push(0);
    } else {
      const slice = klines.slice(i - period + 1, i + 1).map(k => k.close);
      const mean = ma[i];
      const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
      const standardDeviation = Math.sqrt(variance);

      middle.push(mean);
      upper.push(mean + stdDev * standardDeviation);
      lower.push(mean - stdDev * standardDeviation);
    }
  }

  return { upper, middle, lower };
}

/**
 * 璇嗗埆鏀拺浣嶅拰闃诲姏浣嶏紙绠€鍖栫増鏈細鍩轰簬灞€閮ㄦ渶楂?鏈€浣庝环锛? */
export function identifySupportResistance(klines: KlineData[], lookback: number = 20): {
  support: number[];
  resistance: number[];
} {
  const support: number[] = [];
  const resistance: number[] = [];

  if (klines.length < lookback * 2) {
    return { support: [], resistance: [] };
  }

  for (let i = lookback; i < klines.length - lookback; i++) {
    const slice = klines.slice(i - lookback, i + lookback + 1);
    const currentLow = klines[i].low;
    const currentHigh = klines[i].high;

    // 妫€鏌ユ槸鍚︽槸灞€閮ㄦ渶浣庣偣锛堟敮鎾戜綅锛?    const isLocalMin = slice.every(k => k.low >= currentLow);
    if (isLocalMin && !support.includes(currentLow)) {
      support.push(currentLow);
    }

    // 妫€鏌ユ槸鍚︽槸灞€閮ㄦ渶楂樼偣锛堥樆鍔涗綅锛?    const isLocalMax = slice.every(k => k.high <= currentHigh);
    if (isLocalMax && !resistance.includes(currentHigh)) {
      resistance.push(currentHigh);
    }
  }

  // 鎺掑簭骞惰繑鍥炴渶杩戠殑鍑犱釜
  support.sort((a, b) => b - a);
  resistance.sort((a, b) => a - b);

  return {
    support: support.slice(0, 5), // 杩斿洖鏈€杩戠殑5涓敮鎾戜綅
    resistance: resistance.slice(0, 5), // 杩斿洖鏈€杩戠殑5涓樆鍔涗綅
  };
}

/**
 * 鍒ゆ柇甯傚満瓒嬪娍
 */
export function identifyTrend(klines: KlineData[]): 'uptrend' | 'downtrend' | 'sideways' {
  if (klines.length < 50) {
    return 'sideways';
  }

  const ma20 = calculateMA(klines, 20);
  const ma50 = calculateMA(klines, 50);

  const last20 = ma20[ma20.length - 1];
  const last50 = ma50[ma50.length - 1];
  const prev20 = ma20[ma20.length - 10] || last20;
  const prev50 = ma50[ma50.length - 10] || last50;

  // MA20鍦∕A50涓婃柟涓旈兘鍦ㄤ笂鍗?= 涓婂崌瓒嬪娍
  if (last20 > last50 && last20 > prev20 && last50 > prev50) {
    return 'uptrend';
  }

  // MA20鍦∕A50涓嬫柟涓旈兘鍦ㄤ笅闄?= 涓嬮檷瓒嬪娍
  if (last20 < last50 && last20 < prev20 && last50 < prev50) {
    return 'downtrend';
  }

  return 'sideways';
}

/**
 * 鍒ゆ柇娉㈠姩鐜? */
export function identifyVolatility(klines: KlineData[]): 'high' | 'medium' | 'low' {
  if (klines.length < 20) {
    return 'medium';
  }

  const recent20 = klines.slice(-20);
  const prices = recent20.map(k => k.close);
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // 鍙樺紓绯绘暟

  if (cv > 0.03) {
    return 'high';
  } else if (cv < 0.01) {
    return 'low';
  }
  return 'medium';
}