import Big from 'big.js';

Big.DP = 20;

export function alignToStep(value: number, step: number): number {
  if (step <= 0) {
    return value;
  }
  const bigValue = new Big(value);
  const bigStep = new Big(step);
  return Number(bigValue.div(bigStep).round(0, 0).times(bigStep));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function toFixedWithStep(value: number, step: number): string {
  const decimals = stepDecimals(step);
  return value.toFixed(decimals);
}

export function stepDecimals(step: number): number {
  const text = step.toString();
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

export function ensureMinNotional(price: number, quantity: number, minNotional: number): boolean {
  return price * quantity + 1e-12 >= minNotional;
}

export function withinPriceBand(price: number, reference: number, bandPct: number): boolean {
  if (reference <= 0 || bandPct <= 0) return true;
  const upper = reference * (1 + bandPct);
  const lower = reference * (1 - bandPct);
  return price >= lower && price <= upper;
}


