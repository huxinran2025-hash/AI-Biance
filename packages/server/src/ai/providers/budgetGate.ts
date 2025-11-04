import { Provider, QuotaPolicy } from './types.js';

export class BudgetGate {
  private readonly policies: Record<Provider, QuotaPolicy>;
  private readonly inFlight: Record<Provider, number> = {
    GPT5: 0,
    Gemini: 0,
    DeepSeek: 0,
  };

  constructor(policies: Record<Provider, QuotaPolicy>) {
    this.policies = policies;
  }

  allow(provider: Provider): boolean {
    const policy = this.policies[provider];
    if (!policy) return false;
    return this.inFlight[provider] < policy.maxConcurrent;
  }

  start(provider: Provider): void {
    this.inFlight[provider] += 1;
  }

  end(provider: Provider): void {
    this.inFlight[provider] = Math.max(0, this.inFlight[provider] - 1);
  }
}

