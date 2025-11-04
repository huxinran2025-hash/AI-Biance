export const SYMBOL_POPULARITY_ORDER = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'LINKUSDT',
  'DOTUSDT',
  'MATICUSDT',
  'ATOMUSDT',
  'LTCUSDT',
  'OPUSDT',
  'SUIUSDT',
  'ARBUSDT',
  'NEARUSDT',
  'APTUSDT',
  'TRXUSDT',
  'INJUSDT',
];

export const SYMBOL_POPULARITY_MAP: Record<string, number> = SYMBOL_POPULARITY_ORDER.reduce(
  (acc, symbol, index) => {
    acc[symbol] = index + 1;
    return acc;
  },
  {} as Record<string, number>,
);

export const getSymbolPopularity = (symbol: string): number => {
  return SYMBOL_POPULARITY_MAP[symbol.toUpperCase()] ?? Number.MAX_SAFE_INTEGER;
};

