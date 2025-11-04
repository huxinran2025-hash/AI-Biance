import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { randomUUID } from 'node:crypto';
import { OrderEvent, OrderRow, reduceOrder } from './orderReducer.js';

export interface OrderStoreOptions {
  dbPath?: string;
}

export interface NewOrderInput {
  id?: string;
  clientOrderId?: string | null;
  symbol: string;
  side: string;
  type: string;
  price?: number | null;
  qty: number;
  source: 'paper' | 'live' | 'shadow';
  portfolioId?: string | null;
  strategyId?: string | null;
}

export interface FillRecord {
  id?: string;
  orderId: string;
  mode: 'paper' | 'live' | 'shadow';
  price: number;
  qty: number;
  fee?: number;
  ts: number;
}

export interface AuditRecord {
  id?: string;
  realOrderId?: string | null;
  paperOrderId?: string | null;
  symbol: string;
  strategyId?: string | null;
  priceSlipBps?: number | null;
  fillRatioDiff?: number | null;
  latencyMs?: number | null;
  ts: number;
}

export interface SnapshotRecord {
  ts: number;
  portfolioId: string;
  equity: number;
  exposurePct: number;
  pnlRealized: number;
}

export class OrderStore {
  private readonly dbPath: string;
  private readonly sql: SqlJsStatic;
  private readonly db: Database;
  private persistScheduled = false;

  private constructor(sql: SqlJsStatic, db: Database, dbPath: string) {
    this.sql = sql;
    this.db = db;
    this.dbPath = dbPath;
    this.ensureSchema();
  }

  static async create(options: OrderStoreOptions = {}): Promise<OrderStore> {
    const dbPath = options.dbPath ?? path.resolve(process.cwd(), 'data/trading.sqlite');

    const wasmLoc = (filename: string) => path.resolve(process.cwd(), 'node_modules/sql.js/dist', filename);
    const SQL = await initSqlJs({ locateFile: wasmLoc });

    await mkdir(path.dirname(dbPath), { recursive: true });

    let db: Database;
    if (existsSync(dbPath)) {
      const fileBuffer = await readFile(dbPath);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }

    return new OrderStore(SQL, db, dbPath);
  }

  async recordNewOrder(input: NewOrderInput): Promise<string> {
    const id = input.id ?? randomUUID();
    const now = Date.now();

    const event: OrderEvent = {
      type: 'NEW',
      id,
      clientOrderId: input.clientOrderId ?? null,
      qty: input.qty,
      price: input.price ?? null,
      ts: now,
      source: input.source,
    };

    const row: OrderRow = reduceOrder(null, event);
    row.symbol = input.symbol;
    row.side = input.side;
    row.type = input.type;
    row.portfolioId = input.portfolioId ?? null;
    row.strategyId = input.strategyId ?? null;

    this.exec(
      `INSERT INTO orders (id, client_order_id, symbol, side, type, price, qty, filled, status, source, portfolio_id, strategy_id, created_at, updated_at, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         client_order_id=excluded.client_order_id,
         symbol=excluded.symbol,
         side=excluded.side,
         type=excluded.type,
         price=excluded.price,
         qty=excluded.qty,
         status=excluded.status,
         source=excluded.source,
         portfolio_id=excluded.portfolio_id,
         strategy_id=excluded.strategy_id,
         created_at=excluded.created_at,
         updated_at=excluded.updated_at,
         reason=excluded.reason;
      `,
      [
        row.id,
        row.clientOrderId ?? null,
        row.symbol,
        row.side,
        row.type,
        row.price ?? null,
        row.qty,
        row.filled,
        row.status,
        row.source,
        row.portfolioId ?? null,
        row.strategyId ?? null,
        row.createdAt,
        row.updatedAt,
        row.reason ?? null,
      ],
    );

    await this.persistSoon();
    return id;
  }

  async recordEvent(event: OrderEvent): Promise<void> {
    const existing = this.getOrder(event.id);
    const updated = reduceOrder(existing, event);

    this.exec(
      `INSERT INTO orders (id, client_order_id, symbol, side, type, price, qty, filled, status, source, portfolio_id, strategy_id, created_at, updated_at, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         filled=excluded.filled,
         status=excluded.status,
         updated_at=excluded.updated_at,
         reason=excluded.reason;
      `,
      [
        updated.id,
        updated.clientOrderId ?? null,
        updated.symbol,
        updated.side,
        updated.type,
        updated.price ?? null,
        updated.qty,
        updated.filled,
        updated.status,
        updated.source,
        updated.portfolioId ?? null,
        updated.strategyId ?? null,
        updated.createdAt,
        updated.updatedAt,
        updated.reason ?? null,
      ],
    );

    await this.persistSoon();
  }

  async recordFill(fill: FillRecord): Promise<string> {
    const id = fill.id ?? randomUUID();
    this.exec(
      `INSERT INTO fills (id, order_id, mode, price, qty, fee, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET price=excluded.price, qty=excluded.qty, fee=excluded.fee, ts=excluded.ts;
      `,
      [id, fill.orderId, fill.mode, fill.price, fill.qty, fill.fee ?? 0, fill.ts],
    );
    await this.persistSoon();
    return id;
  }

  async recordAudit(rec: AuditRecord): Promise<string> {
    const id = rec.id ?? randomUUID();
    this.exec(
      `INSERT INTO audits (id, real_order_id, paper_order_id, symbol, strategy_id, price_slip_bps, fill_ratio_diff, latency_ms, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET price_slip_bps=excluded.price_slip_bps, fill_ratio_diff=excluded.fill_ratio_diff, latency_ms=excluded.latency_ms, ts=excluded.ts;
      `,
      [
        id,
        rec.realOrderId ?? null,
        rec.paperOrderId ?? null,
        rec.symbol,
        rec.strategyId ?? null,
        rec.priceSlipBps ?? null,
        rec.fillRatioDiff ?? null,
        rec.latencyMs ?? null,
        rec.ts,
      ],
    );
    await this.persistSoon();
    return id;
  }

  async recordSnapshot(snapshot: SnapshotRecord): Promise<void> {
    this.exec(
      `INSERT INTO snapshots (ts, portfolio_id, equity, exposure_pct, pnl_realized)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(ts, portfolio_id) DO UPDATE SET equity=excluded.equity, exposure_pct=excluded.exposure_pct, pnl_realized=excluded.pnl_realized;
      `,
      [snapshot.ts, snapshot.portfolioId, snapshot.equity, snapshot.exposurePct, snapshot.pnlRealized],
    );
    await this.persistSoon();
  }

  getOrder(id: string): OrderRow | null {
    const stmt = this.db.prepare('SELECT * FROM orders WHERE id = ? LIMIT 1;');
    try {
      stmt.bind([id]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        return {
          id: row.id as string,
          clientOrderId: (row.client_order_id as string) ?? null,
          symbol: row.symbol as string,
          side: row.side as string,
          type: row.type as string,
          price: (row.price as number) ?? null,
          qty: Number(row.qty ?? 0),
          filled: Number(row.filled ?? 0),
          status: row.status as OrderRow['status'],
          source: row.source as OrderRow['source'],
          portfolioId: (row.portfolio_id as string) ?? null,
          strategyId: (row.strategy_id as string) ?? null,
          createdAt: Number(row.created_at ?? 0),
          updatedAt: Number(row.updated_at ?? 0),
          reason: (row.reason as string) ?? null,
        };
      }
      return null;
    } finally {
      stmt.free();
    }
  }

  async persistNow(): Promise<void> {
    const data = this.db.export();
    await writeFile(this.dbPath, Buffer.from(data));
    this.persistScheduled = false;
  }

  private ensureSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        client_order_id TEXT,
        symbol TEXT,
        side TEXT,
        type TEXT,
        price REAL,
        qty REAL,
        filled REAL DEFAULT 0,
        status TEXT,
        source TEXT,
        portfolio_id TEXT,
        strategy_id TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        reason TEXT
      );
      CREATE TABLE IF NOT EXISTS fills (
        id TEXT PRIMARY KEY,
        order_id TEXT,
        mode TEXT,
        price REAL,
        qty REAL,
        fee REAL,
        ts INTEGER
      );
      CREATE TABLE IF NOT EXISTS audits (
        id TEXT PRIMARY KEY,
        real_order_id TEXT,
        paper_order_id TEXT,
        symbol TEXT,
        strategy_id TEXT,
        price_slip_bps REAL,
        fill_ratio_diff REAL,
        latency_ms REAL,
        ts INTEGER
      );
      CREATE TABLE IF NOT EXISTS snapshots (
        ts INTEGER,
        portfolio_id TEXT,
        equity REAL,
        exposure_pct REAL,
        pnl_realized REAL,
        PRIMARY KEY (ts, portfolio_id)
      );
    `);
  }

  private exec(sql: string, params: (string | number | null)[]): void {
    const stmt = this.db.prepare(sql);
    try {
      stmt.run(params);
    } finally {
      stmt.free();
    }
  }

  private async persistSoon(): Promise<void> {
    if (this.persistScheduled) return;
    this.persistScheduled = true;
    setTimeout(() => {
      void this.persistNow();
    }, 100);
  }
}


