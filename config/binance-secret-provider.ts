import { BinanceCredentialProvider, BinanceCredentials } from '../exchange/binance/models.js';

const TOKEN_ENV = 'KMS_TOKEN';
const ENDPOINT_ENV = 'BINANCE_SECRET_ENDPOINT';
const SECRET_NAME_ENV = 'BINANCE_SECRET_NAME';
const LOCAL_KEY_ENV = 'BINANCE_API_KEY';
const LOCAL_SECRET_ENV = 'BINANCE_API_SECRET';

interface RemoteSecretPayload {
  apiKey: string;
  apiSecret: string;
  expiresAt?: number | string | null;
  source?: string;
}

interface CredentialCache {
  value: BinanceCredentials;
  fetchedAt: number;
}

export interface BinanceSecretProviderOptions {
  /** milliseconds before expiration to proactively refresh */
  refreshSkewMs?: number;
  /** override token for testing */
  token?: string;
  /** override endpoint for testing */
  endpoint?: string;
  /** override secret identifier for testing */
  secretName?: string;
  /** custom fetch function (dependency injection for tests) */
  fetchFn?: typeof fetch;
}

export class BinanceSecretProvider implements BinanceCredentialProvider {
  private cache: CredentialCache | null = null;
  private readonly refreshSkewMs: number;
  private readonly token?: string;
  private readonly endpoint?: string;
  private readonly secretName?: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: BinanceSecretProviderOptions = {}) {
    this.refreshSkewMs = options.refreshSkewMs ?? 60_000;
    this.token = options.token ?? process.env[TOKEN_ENV];
    this.endpoint = options.endpoint ?? process.env[ENDPOINT_ENV];
    this.secretName = options.secretName ?? process.env[SECRET_NAME_ENV];
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  async getCredentials(): Promise<BinanceCredentials> {
    if (this.cache && !this.shouldRefresh(this.cache.value)) {
      return this.cache.value;
    }

    const credentials = await this.resolveCredentials();
    this.cache = { value: credentials, fetchedAt: Date.now() };
    return credentials;
  }

  invalidate(reason?: string): void {
    if (reason) {
      console.warn(`[BinanceSecretProvider] invalidating cache due to: ${reason}`);
    }
    this.cache = null;
  }

  private shouldRefresh(credentials: BinanceCredentials): boolean {
    if (!credentials.expiresAt) {
      return false;
    }
    const now = Date.now();
    return credentials.expiresAt - now <= this.refreshSkewMs;
  }

  private async resolveCredentials(): Promise<BinanceCredentials> {
    if (this.endpoint && this.token) {
      return this.fetchFromRemote();
    }

    const apiKey = process.env[LOCAL_KEY_ENV];
    const apiSecret = process.env[LOCAL_SECRET_ENV];

    if (!apiKey || !apiSecret) {
      throw new Error(
        'Binance credentials are not configured. Either provide BINANCE_SECRET_ENDPOINT + KMS_TOKEN, or set BINANCE_API_KEY and BINANCE_API_SECRET for local development.'
      );
    }

    return {
      apiKey,
      apiSecret,
      source: 'env',
      expiresAt: null,
    };
  }

  private async fetchFromRemote(): Promise<BinanceCredentials> {
    if (!this.endpoint || !this.token) {
      throw new Error('Remote secret endpoint or token missing');
    }

    const requestInit: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ secret: this.secretName ?? 'BINANCE_API' }),
    };

    const response = await this.fetchFn(this.endpoint, requestInit);
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Failed to fetch Binance credentials from remote: HTTP ${response.status} - ${text}`);
    }

    const payload: RemoteSecretPayload = JSON.parse(text);

    if (!payload.apiKey || !payload.apiSecret) {
      throw new Error('Remote secret response missing apiKey/apiSecret');
    }

    const expiresAt = this.parseExpiration(payload.expiresAt);

    return {
      apiKey: payload.apiKey,
      apiSecret: payload.apiSecret,
      expiresAt,
      source: payload.source ?? 'kms',
    };
  }

  private parseExpiration(value: RemoteSecretPayload['expiresAt']): number | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value === 'number') {
      return value;
    }

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
}


