import { RSS_BACKEND_URL } from '../constants';
import { ExternalAlert, RssEvent, ExternalAlertSeverity, ExternalAlertTopic } from '../types';

const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes window for polling
const DEFAULT_LIMIT = 200;

interface RssEventsResponse {
  ok: boolean;
  fetchedAt: number;
  cacheTimestamp?: number;
  articles: Array<{
    idHash: string;
    feedId: string;
    feedLabel?: string;
    title: string;
    link?: string;
    snippet?: string;
    publishedAt: number;
    severity: ExternalAlertSeverity;
    topic: ExternalAlertTopic;
  }>;
}

const RSS_EVENTS_ENDPOINT = `${RSS_BACKEND_URL}/api/rss/events`;

class RssWatcher {
  private lastPollTs = 0;
  private seenIds = new Set<string>();

  private mapToEvent(article: RssEventsResponse['articles'][number]): RssEvent {
    return {
      idHash: article.idHash,
      feedId: article.feedId,
      feedLabel: article.feedLabel,
      source: article.feedLabel || article.feedId,
      title: article.title,
      link: article.link,
      snippet: article.snippet,
      publishedAt: article.publishedAt,
      severity: article.severity,
      topic: article.topic,
      summary: article.title,
    };
  }

  private dedupe(events: RssEvent[]): RssEvent[] {
    const output: RssEvent[] = [];
    for (const event of events) {
      if (this.seenIds.has(event.idHash)) {
        continue;
      }
      this.seenIds.add(event.idHash);
      output.push(event);
    }
    // Keep set bounded
    if (this.seenIds.size > 1000) {
      this.seenIds = new Set(output.slice(-500).map(e => e.idHash));
    }
    return output;
  }

  async pollRssEventsSince(ts: number, options?: { maxAgeMs?: number; limit?: number }): Promise<RssEvent[]> {
    const params = new URLSearchParams();
    const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    const limit = options?.limit ?? DEFAULT_LIMIT;

    if (ts) {
      params.set('since', String(ts));
    }
    params.set('maxAgeMs', String(maxAgeMs));
    params.set('limit', String(limit));

    const url = `${RSS_EVENTS_ENDPOINT}?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BIANCE-RSS-Watcher/1.0',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch RSS events: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as RssEventsResponse;
    if (!payload.ok) {
      throw new Error(`RSS events response not ok`);
    }

    const rawEvents = payload.articles.map(article => this.mapToEvent(article));
    const deduped = this.dedupe(rawEvents);

    if (deduped.length) {
      this.lastPollTs = Math.max(this.lastPollTs, ...deduped.map(e => e.publishedAt));
    }

    // Enforce ordering newest first
    return deduped.sort((a, b) => b.publishedAt - a.publishedAt);
  }
}

export const rssWatcher = new RssWatcher();

