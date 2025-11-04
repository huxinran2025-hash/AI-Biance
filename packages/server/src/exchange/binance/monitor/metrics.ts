import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export type MetricLabel = Record<string, string | number | boolean>;

interface CounterEntry {
  metric: Counter<string>;
  labelNames: string[];
}

interface GaugeEntry {
  metric: Gauge<string>;
  labelNames: string[];
}

interface HistogramEntry {
  metric: Histogram<string>;
  labelNames: string[];
  bucketsKey: string;
}

export class MetricsRegistry {
  private readonly registry: Registry;
  private readonly counters = new Map<string, CounterEntry>();
  private readonly gauges = new Map<string, GaugeEntry>();
  private readonly histograms = new Map<string, HistogramEntry>();

  constructor(registry?: Registry) {
    this.registry = registry ?? new Registry();
  }

  incrementCounter(name: string, value = 1, labels?: MetricLabel): void {
    const labelNames = this.labelNames(labels);
    const metric = this.getOrCreateCounter(name, labelNames);
    metric.metric.inc(this.normalizeLabels(labelNames, labels), value);
  }

  setGauge(name: string, value: number, labels?: MetricLabel): void {
    const labelNames = this.labelNames(labels);
    const entry = this.getOrCreateGauge(name, labelNames);
    entry.metric.set(this.normalizeLabels(labelNames, labels), value);
  }

  observeHistogram(name: string, value: number, buckets: number[], labels?: MetricLabel): void {
    const labelNames = this.labelNames(labels);
    const entry = this.getOrCreateHistogram(name, labelNames, buckets);
    entry.metric.observe(this.normalizeLabels(labelNames, labels), value);
  }

  async metrics(): Promise<string> {
    return this.registry.metrics();
  }

  getRegistry(): Registry {
    return this.registry;
  }

  private getOrCreateCounter(name: string, labelNames: string[]): CounterEntry {
    const key = this.metricKey(name, labelNames);
    let entry = this.counters.get(key);
    if (!entry) {
      entry = {
        metric: new Counter({
          name: this.sanitizeName(name, labelNames),
          help: `${name}_total`,
          labelNames,
          registers: [this.registry],
        }),
        labelNames,
      };
      this.counters.set(key, entry);
    }
    return entry;
  }

  private getOrCreateGauge(name: string, labelNames: string[]): GaugeEntry {
    const key = this.metricKey(name, labelNames);
    let entry = this.gauges.get(key);
    if (!entry) {
      entry = {
        metric: new Gauge({
          name: this.sanitizeName(name, labelNames),
          help: `${name}_gauge`,
          labelNames,
          registers: [this.registry],
        }),
        labelNames,
      };
      this.gauges.set(key, entry);
    }
    return entry;
  }

  private getOrCreateHistogram(name: string, labelNames: string[], buckets: number[]): HistogramEntry {
    const key = this.metricKey(name, labelNames);
    let entry = this.histograms.get(key);
    const bucketsKey = buckets.slice().sort((a, b) => a - b).join(',');

    if (!entry) {
      entry = {
        metric: new Histogram({
          name: this.sanitizeName(name, labelNames),
          help: `${name}_histogram`,
          labelNames,
          buckets: buckets.slice().sort((a, b) => a - b),
          registers: [this.registry],
        }),
        labelNames,
        bucketsKey,
      };
      this.histograms.set(key, entry);
    } else if (entry.bucketsKey !== bucketsKey) {
      throw new Error(`Histogram ${name} already registered with different buckets`);
    }

    return entry;
  }

  private metricKey(name: string, labelNames: string[]): string {
    return `${name}|${labelNames.join(',')}`;
  }

  private labelNames(labels?: MetricLabel): string[] {
    return labels ? Object.keys(labels).sort() : [];
  }

  private normalizeLabels(labelNames: string[], labels?: MetricLabel): Record<string, string> {
    if (!labels || labelNames.length === 0) {
      return {};
    }
    const result: Record<string, string> = {};
    for (const name of labelNames) {
      const value = labels[name];
      result[name] = value === undefined ? '' : String(value);
    }
    return result;
  }

  private sanitizeName(name: string, labelNames: string[]): string {
    const suffix = labelNames.length ? `_${labelNames.join('_')}` : '';
    const full = `${name}${suffix}`
      .replace(/[^a-zA-Z0-9:_]/g, '_')
      .replace(/__+/g, '_');
    return /^[a-zA-Z_]/.test(full) ? full : `_${full}`;
  }
}

