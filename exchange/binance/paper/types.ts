import { ExecutionMode, MarketQuote, NominalOrderSignal, PaperAccountState, PaperExecutionResult, PreparedOrder, RiskSnapshot } from '../models.js';

export interface PaperEngineOptions {
  baseCurrency: string;
  defaultEquity: number;
  portfolioEquities?: Record<string, number>;
  makerFeeBps: number;
  takerFeeBps: number;
  buySlippageBps: number;
  sellSlippageBps: number;
  latencyMs?: number;
  fokAsIoc?: boolean;
  netting?: 'fifo' | 'avg';
}

export interface PaperExecutionInput {
  prepared: PreparedOrder;
  signal: NominalOrderSignal;
  quote?: MarketQuote;
  mode: ExecutionMode;
  riskSnapshot: RiskSnapshot;
  portfolioId?: string;
  metadata?: Record<string, unknown>;
}

export interface PaperExecutionEvent {
  id: string;
  timestamp: number;
  mode: ExecutionMode;
  portfolioId: string;
  prepared: PreparedOrder;
  signal: NominalOrderSignal;
  quote?: MarketQuote;
  riskSnapshot: RiskSnapshot;
  result: PaperExecutionResult;
  metadata?: Record<string, unknown>;
}

export interface PaperLedgerState {
  account: PaperAccountState;
  events: PaperExecutionEvent[];
}

