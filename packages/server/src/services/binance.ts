// Binance REST API 数据获取服务（带二次降级）

const REST_BASE = import.meta.env.VITE_BINANCE_REST || '/binance';
const REST_FALLBACK = 'https://data-api.binance.vision';

export interface KlineData {
  time: number; // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 获取K线数据（REST + 二次降级）
 * 
 * @param symbol 交易对符号，如 'BTCUSDT'
 * @param interval K线间隔：1m, 5m, 15m, 1h, 4h, 1d
 * @param limit 数据条数，默认200
 * @param signal Abort信号，用于取消请求
 * @returns 格式化的K线数据数组
 */
export async function fetchKlines(
  symbol: string,
  interval: string,
  limit = 200,
  signal?: AbortSignal
): Promise<KlineData[]> {
  const url = `${REST_BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

  try {
    // 第一次尝试：走 Vite 代理
    const response = await fetch(url, { signal, cache: 'no-store' });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const raw = await response.json();
    
    // Binance API 返回格式：[[openTime, open, high, low, close, volume, ...], ...]
    return raw.map((k: any[]) => ({
      time: Math.floor(k[0] / 1000), // 毫秒转秒
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }));
  } catch (error) {
    // 二次降级：直连 data-api.binance.vision（绕过代理）
    console.warn(`[Binance] Primary fetch failed, trying fallback: ${symbol} ${interval}`, error);
    
    try {
      const fallbackUrl = `${REST_FALLBACK}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const fallbackResponse = await fetch(fallbackUrl, { signal, cache: 'no-store' });
      
      if (!fallbackResponse.ok) {
        throw new Error(`Fallback HTTP ${fallbackResponse.status}`);
      }

      const raw = await fallbackResponse.json();
      
      return raw.map((k: any[]) => ({
        time: Math.floor(k[0] / 1000),
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
      }));
    } catch (fallbackError) {
      console.error(`[Binance] Fallback also failed: ${symbol} ${interval}`, fallbackError);
      throw new Error(`Failed to fetch klines: ${symbol} ${interval}`);
    }
  }
}

