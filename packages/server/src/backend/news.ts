import { StoredArticle, RiskSignalsSnapshot, RiskSummary, NewsCategory } from '../types';
import { NEWS_SOURCES } from './newsSources';
import { CORS_PROXY, SYSTEM_TIMINGS } from '../constants';

// Simple hash function for deduplication
const simpleHash = (s: string): string => {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const char = s.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString();
};

class RSSFetcher {
  // 5. backend/news.ts 必须和 fetchService.ts 行为对齐
  async pollAllFeeds(): Promise<StoredArticle[]> {
    const allNewArticles: StoredArticle[] = [];

    for (const feed of NEWS_SOURCES) {
      try {
        // 优先使用本地代理，避免 CORS 问题
        const proxyUrl = `/rss/relay?url=${encodeURIComponent(feed.rssUrl)}`;
        const fallbackUrl = `${CORS_PROXY}${encodeURIComponent(feed.rssUrl)}`;
        
        let response: Response | null = null;
        try {
          response = await fetch(proxyUrl);
          if (!response.ok) {
            throw new Error(`Proxy returned ${response.status}`);
          }
        } catch (proxyError) {
          // 代理失败，尝试 fallback
          console.warn(`[RSS] Local proxy failed, trying fallback for ${feed.label}`, proxyError);
          response = await fetch(fallbackUrl);
        }
        
        if (!response) {
          throw new Error('Both proxy and fallback failed');
        }

        if (!response.ok) {
          console.error(`[Intel] Failed to fetch RSS feed ${feed.label}: Status ${response.status}`);
          continue;
        }

        const xmlString = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "application/xml");

        const parserError = xmlDoc.querySelector("parsererror");
        if (parserError) {
          console.error(`[Intel] Failed to parse RSS feed ${feed.label}:`, parserError.textContent);
          continue;
        }

        const items = xmlDoc.querySelectorAll("item");
        items.forEach(item => {
          const title = item.querySelector("title")?.textContent || 'No Title';
          const link = item.querySelector("link")?.textContent || '';
          const snippet = item.querySelector("description")?.textContent?.substring(0, 200) + '...' || '';
          const pubDateStr = item.querySelector("pubDate")?.textContent || new Date().toISOString();
          const publishedAt = new Date(pubDateStr).getTime();
          
          if (!isNaN(publishedAt)) {
             allNewArticles.push({
               idHash: simpleHash(title + link),
               feedId: feed.id,
               title,
               link,
               publishedAt,
               snippet,
               critical: feed.critical,
               category: feed.category
             });
          }
        });
      } catch (error) {
        console.error(`[Intel] Error processing RSS feed ${feed.label}:`, error);
      }
    }
    // Sort by most recent first
    return allNewArticles.sort((a, b) => b.publishedAt - a.publishedAt);
  }
}

class SignalExtractor {
    private currentSnapshot: RiskSignalsSnapshot;

    constructor() {
        this.currentSnapshot = this.getInitialSnapshot();
    }

    private getInitialSnapshot(): RiskSignalsSnapshot {
         return {
            summary: {},
            criticalArticles: [],
            blacklist_symbols: [],
            overall_severity: "NORMAL",
            generatedAt: new Date().toISOString(),
        };
    }
    
    // 4. 给 3 个大模型喂的不是“原始文章列表”，而是“决策上下文摘要 + 风险标签”
    updateWithArticles(articles: StoredArticle[]) {
        this.currentSnapshot = this.getInitialSnapshot();
        const sixtyMinutesAgo = Date.now() - 60 * 60 * 1000;

        const recentArticles = articles.filter(a => a.publishedAt > sixtyMinutesAgo);
        this.currentSnapshot.criticalArticles = recentArticles.filter(a => a.critical);

        for (const article of this.currentSnapshot.criticalArticles) {
            const t = (article.title + " " + (article.snippet || "")).toLowerCase();
            const summaryCategory = article.category;
            
            if (!this.currentSnapshot.summary[summaryCategory]) {
                this.currentSnapshot.summary[summaryCategory] = [];
            }
            
            let summaryText = "";

            if (summaryCategory === 'exchange') {
                if (t.includes("suspend") || t.includes("halt") || t.includes("delay") || t.includes("withdrawal")) {
                   summaryText = `[高风险] ${article.feedId} 报告服务中断或提现问题: "${article.title}"`;
                   if (t.includes("sol")) this.currentSnapshot.blacklist_symbols.push("SOLUSDT");
                }
            } else if (summaryCategory === 'regulation') {
                 if (t.includes("sec") || t.includes("cftc") || t.includes("lawsuit") || t.includes("enforcement") || t.includes("ban")) {
                   summaryText = `[极高风险] 监管行动: "${article.title}"`;
                }
            } else if (summaryCategory === 'stablecoin') {
                 if (t.includes("depeg") || t.includes("unpegged") || t.includes("stablecoin risk")) {
                   summaryText = `[极高风险] 稳定币脱锚风险: "${article.title}"`;
                }
            }
            
            if (summaryText) {
                this.currentSnapshot.summary[summaryCategory]!.push(summaryText);
            }
        }
        
        this.currentSnapshot.generatedAt = new Date().toISOString();
        this.calculateOverallSeverity();
    }
    
    private calculateOverallSeverity() {
        const summary = this.currentSnapshot.summary;
        if (summary.regulation?.length || summary.exchange?.length || summary.stablecoin?.length) {
            this.currentSnapshot.overall_severity = "CRITICAL";
        } else if (summary.macro?.length) {
            this.currentSnapshot.overall_severity = "ELEVATED";
        } else {
            this.currentSnapshot.overall_severity = "NORMAL";
        }
    }

    getSnapshot(): RiskSignalsSnapshot {
        return this.currentSnapshot;
    }
}

class NewsSignalService {
    private fetcher: RSSFetcher;
    private extractor: SignalExtractor;
    private intervalId: number | null = null;
    
    // 3. 持久化 + 去重 + 时间窗过滤
    private articleStore: Map<string, StoredArticle> = new Map(); // Key: idHash
    private latestArticles: StoredArticle[] = [];

    constructor() {
        this.fetcher = new RSSFetcher();
        this.extractor = new SignalExtractor();
    }

    private updateStore(articles: StoredArticle[]) {
      let newCount = 0;
      for (const article of articles) {
        if (!this.articleStore.has(article.idHash)) {
          this.articleStore.set(article.idHash, article);
          newCount++;
        }
      }
      if (newCount > 0) {
        // Re-sort the list of latest articles if new ones were added
        this.latestArticles = Array.from(this.articleStore.values()).sort((a,b) => b.publishedAt - a.publishedAt);
        // Trim the store to avoid memory leaks over long sessions
        if (this.latestArticles.length > 500) {
          const articlesToDrop = this.latestArticles.slice(500);
          articlesToDrop.forEach(a => this.articleStore.delete(a.idHash));
          this.latestArticles = this.latestArticles.slice(0, 500);
        }
        console.log(`[Intel] Ingested ${newCount} new articles. Store size: ${this.articleStore.size}`);
      }
    }

    async tick() {
        const batch = await this.fetcher.pollAllFeeds();
        this.updateStore(batch);
        this.extractor.updateWithArticles(this.latestArticles);
    }

    start() {
        if (this.intervalId) return;
        console.log('[Intel] Starting Intelligence Service...');
        this.tick(); 
        this.intervalId = window.setInterval(() => this.tick(), SYSTEM_TIMINGS.NEWS_POLL_MS);
    }

    stop() {
        if (this.intervalId) {
            console.log('[Intel] Stopping Intelligence Service...');
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    getCurrentSignals(): RiskSignalsSnapshot {
        return this.extractor.getSnapshot();
    }

    // 暴露最新文章供其他模块使用
    public getLatestArticles(): StoredArticle[] {
        return [...this.latestArticles];
    }
}

export const newsSignalService = new NewsSignalService();
