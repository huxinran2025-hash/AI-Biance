export type OrderStatus = 'NEW' | 'PARTIAL' | 'FILLED' | 'CANCELED' | 'REJECTED' | 'EXPIRED';

export interface OrderRow {
  id: string;
  clientOrderId?: string | null;
  symbol: string;
  side: string;
  type: string;
  price?: number | null;
  qty: number;
  filled: number;
  status: OrderStatus;
  source: 'paper' | 'live' | 'shadow';
  portfolioId?: string | null;
  strategyId?: string | null;
  createdAt: number;
  updatedAt: number;
  reason?: string | null;
}

export type OrderEvent =
  | { type: 'NEW'; id: string; clientOrderId?: string | null; qty: number; ts: number; price?: number | null; source: OrderRow['source']; }
  | { type: 'PARTIAL'; id: string; filled: number; ts: number }
  | { type: 'FILLED'; id: string; ts: number }
  | { type: 'CANCELED'; id: string; reason?: string | null; ts: number }
  | { type: 'REJECTED'; id: string; reason: string; ts: number }
  | { type: 'EXPIRED'; id: string; ts: number };

export function reduceOrder(row: OrderRow | null, event: OrderEvent): OrderRow {
  if (!row) {
    if (event.type !== 'NEW') {
      throw new Error(`Cannot apply ${event.type} to non-existent order`);
    }
    return {
      id: event.id,
      clientOrderId: event.clientOrderId ?? null,
      symbol: '',
      side: '',
      type: '',
      price: event.price ?? null,
      qty: event.qty,
      filled: 0,
      status: 'NEW',
      source: event.source,
      createdAt: event.ts,
      updatedAt: event.ts,
      reason: null,
    };
  }

  switch (event.type) {
    case 'NEW':
      return {
        ...row,
        id: event.id,
        clientOrderId: event.clientOrderId ?? row.clientOrderId,
        qty: event.qty,
        price: event.price ?? row.price,
        status: 'NEW',
        createdAt: event.ts,
        updatedAt: event.ts,
      };
    case 'PARTIAL':
      return {
        ...row,
        filled: Math.min(event.filled, row.qty),
        status: 'PARTIAL',
        updatedAt: event.ts,
      };
    case 'FILLED':
      return {
        ...row,
        filled: row.qty,
        status: 'FILLED',
        updatedAt: event.ts,
      };
    case 'CANCELED':
      return {
        ...row,
        status: 'CANCELED',
        reason: event.reason ?? null,
        updatedAt: event.ts,
      };
    case 'REJECTED':
      return {
        ...row,
        status: 'REJECTED',
        reason: event.reason,
        updatedAt: event.ts,
      };
    case 'EXPIRED':
      return {
        ...row,
        status: 'EXPIRED',
        updatedAt: event.ts,
      };
    default:
      return row;
  }
}


