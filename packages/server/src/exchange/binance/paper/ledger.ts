import { MarketQuote, PaperAccountState, PaperFill, PaperPosition } from '../models.js';
import { PaperEngineOptions, PaperExecutionEvent } from './types.js';

interface PortfolioInternalState {
  account: PaperAccountState;
  marks: Map<string, number>;
  positions: Map<string, PaperPosition>;
  events: PaperExecutionEvent[];
}

export class PaperLedger {
  private readonly options: PaperEngineOptions;
  private readonly portfolios = new Map<string, PortfolioInternalState>();

  constructor(options: PaperEngineOptions) {
    this.options = options;
  }

  ensurePortfolio(portfolioId: string): PortfolioInternalState {
    let portfolio = this.portfolios.get(portfolioId);
    if (!portfolio) {
      const initialEquity = this.options.portfolioEquities?.[portfolioId] ?? this.options.defaultEquity;
      const now = Date.now();
      const account: PaperAccountState = {
        portfolioId,
        baseCurrency: this.options.baseCurrency,
        cash: initialEquity,
        equity: initialEquity,
        exposure: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        feesPaid: 0,
        positions: {},
        updatedAt: now,
      };
      portfolio = {
        account,
        marks: new Map<string, number>(),
        positions: new Map<string, PaperPosition>(),
        events: [],
      };
      this.portfolios.set(portfolioId, portfolio);
    }
    return portfolio;
  }

  snapshot(portfolioId: string): PaperAccountState {
    const portfolio = this.ensurePortfolio(portfolioId);
    return structuredClone(portfolio.account);
  }

  appendEvent(portfolioId: string, event: PaperExecutionEvent): void {
    const portfolio = this.ensurePortfolio(portfolioId);
    portfolio.events.push(event);
  }

  getEvents(portfolioId: string): PaperExecutionEvent[] {
    const portfolio = this.ensurePortfolio(portfolioId);
    return portfolio.events.slice();
  }

  applyFill(portfolioId: string, fill: PaperFill, quote?: MarketQuote): PaperAccountState {
    const portfolio = this.ensurePortfolio(portfolioId);
    const { account, positions, marks } = portfolio;

    const isBuy = fill.side === 'BUY';
    const quantity = fill.quantity;
    if (quantity <= 0) {
      return structuredClone(account);
    }

    const position = positions.get(fill.symbol) ?? {
      symbol: fill.symbol,
      quantity: 0,
      averagePrice: 0,
      updatedAt: fill.timestamp,
    };

    if (isBuy) {
      const cost = fill.price * quantity;
      const totalQuantity = position.quantity + quantity;
      const weightedCost = position.quantity * position.averagePrice + cost;
      position.quantity = totalQuantity;
      position.averagePrice = totalQuantity > 0 ? weightedCost / totalQuantity : 0;
      account.cash -= cost + fill.fee;
    } else {
      const sellQty = Math.min(quantity, position.quantity);
      if (sellQty <= 0) {
        // 空仓卖出，视为拒绝收益（不影响账户）
      } else {
        const revenue = fill.price * sellQty;
        const pnl = (fill.price - position.averagePrice) * sellQty;
        account.cash += revenue - fill.fee;
        account.realizedPnl += pnl;
        position.quantity = Math.max(0, position.quantity - sellQty);
      }
    }

    account.feesPaid += fill.fee;
    position.updatedAt = fill.timestamp;

    const markPrice = this.resolveMark(fill, quote, marks);
    if (markPrice !== undefined) {
      position.markPrice = markPrice;
      marks.set(fill.symbol, markPrice);
    }

    if (position.quantity <= 1e-12) {
      positions.delete(fill.symbol);
      delete account.positions[fill.symbol];
    } else {
      positions.set(fill.symbol, position);
      account.positions[fill.symbol] = {
        symbol: position.symbol,
        quantity: position.quantity,
        averagePrice: position.averagePrice,
        markPrice: position.markPrice,
        updatedAt: position.updatedAt,
      };
    }

    this.recalculateAccount(account, positions, marks);
    account.updatedAt = fill.timestamp;
    return structuredClone(account);
  }

  updateMark(portfolioId: string, symbol: string, price: number): PaperAccountState {
    const portfolio = this.ensurePortfolio(portfolioId);
    portfolio.marks.set(symbol, price);
    this.recalculateAccount(portfolio.account, portfolio.positions, portfolio.marks);
    return structuredClone(portfolio.account);
  }

  private resolveMark(fill: PaperFill, quote: MarketQuote | undefined, marks: Map<string, number>): number | undefined {
    if (quote) {
      if (Number.isFinite(quote.lastPrice)) {
        return quote.lastPrice as number;
      }
      if (Number.isFinite(quote.bestBid) && Number.isFinite(quote.bestAsk)) {
        return (quote.bestBid + quote.bestAsk) / 2;
      }
    }
    if (fill.price > 0) {
      return fill.price;
    }
    return marks.get(fill.symbol);
  }

  private recalculateAccount(account: PaperAccountState, positions: Map<string, PaperPosition>, marks: Map<string, number>): void {
    let exposure = 0;
    let unrealized = 0;

    for (const [symbol, position] of positions.entries()) {
      const mark = position.markPrice ?? marks.get(symbol) ?? position.averagePrice;
      const positionExposure = position.quantity * mark;
      exposure += positionExposure;
      unrealized += (mark - position.averagePrice) * position.quantity;
    }

    account.exposure = exposure;
    account.unrealizedPnl = unrealized;
    account.equity = account.cash + unrealized;
  }
}

