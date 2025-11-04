import { setTimeout as sleep } from 'node:timers/promises';
import { ServerTimeResponse } from '../models.js';

const DEFAULT_REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_TOLERANCE_MS = 1000; // tolerate small drifts

export interface TimeSyncOptions {
  fetchServerTime: () => Promise<ServerTimeResponse>;
  refreshIntervalMs?: number;
  toleranceMs?: number;
}

export class BinanceTimeSync {
  private readonly fetchServerTime: () => Promise<ServerTimeResponse>;
  private readonly refreshIntervalMs: number;
  private readonly toleranceMs: number;
  private offsetMs = 0;
  private lastSyncAt = 0;
  private syncing = false;

  constructor(options: TimeSyncOptions) {
    this.fetchServerTime = options.fetchServerTime;
    this.refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
    this.toleranceMs = options.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  }

  get timestamp(): number {
    return Date.now() + this.offsetMs;
  }

  get offset(): number {
    return this.offsetMs;
  }

  async ensureFreshOffset(): Promise<number> {
    const now = Date.now();
    if (this.syncing) {
      // Wait for the in-flight sync to finish.
      while (this.syncing) {
        await sleep(25);
      }
      return this.offsetMs;
    }

    const mustRefresh =
      now - this.lastSyncAt >= this.refreshIntervalMs || Math.abs(this.offsetMs) > this.toleranceMs * 10;
    if (!mustRefresh) {
      return this.offsetMs;
    }

    await this.sync();
    return this.offsetMs;
  }

  async sync(): Promise<number> {
    if (this.syncing) {
      return this.offsetMs;
    }

    this.syncing = true;
    try {
      const { serverTime } = await this.fetchServerTime();
      const local = Date.now();
      this.offsetMs = serverTime - local;
      this.lastSyncAt = local;
      return this.offsetMs;
    } finally {
      this.syncing = false;
    }
  }

  invalidateOffset(): void {
    this.lastSyncAt = 0;
  }
}


