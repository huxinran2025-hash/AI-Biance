import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// RSS 文章接口
interface RSSArticle {
  idHash: string;
  feedId: string;
  feedLabel: string;
  title: string;
  link: string;
  publishedAt: number;
  snippet: string;
  critical: boolean;
  category: string;
}

// RSS 源配置
const RSS_SOURCES = [
  // Critical: Exchange Status
  {
    id: 'crypto-news-general',
    label: '加密货币综合新闻',
    rssUrl: 'https://cointelegraph.com/rss',
    critical: true,
    category: 'exchange'
  },
  {
    id: 'crypto-market-news',
    label: '加密货币市场新闻',
    rssUrl: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    critical: true,
    category: 'exchange'
  },
  
  // Critical: Official Regulatory Sources
  {
    id: 'us-sec-news',
    label: '美国SEC新闻稿',
    rssUrl: 'https://www.sec.gov/news/pressreleases.rss',
    critical: true,
    category: 'regulation'
  },
  {
    id: 'us-cftc-news',
    label: '美国CFTC新闻',
    rssUrl: 'https://www.cftc.gov/rss/news',
    critical: true,
    category: 'regulation'
  },
  {
    id: 'uk-fca-news',
    label: '英国FCA新闻',
    rssUrl: 'https://www.fca.org.uk/news/rss',
    critical: true,
    category: 'regulation'
  },
  {
    id: 'eu-esma-news',
    label: '欧盟ESMA新闻',
    rssUrl: 'https://www.esma.europa.eu/rss',
    critical: true,
    category: 'regulation'
  },
  
  // Specialized Crypto News Sources (removed duplicates)
  {
    id: 'coindesk-main',
    label: 'CoinDesk',
    rssUrl: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    critical: false,
    category: 'crypto'
  },
  {
    id: 'cointelegraph-main',
    label: 'Cointelegraph',
    rssUrl: 'https://cointelegraph.com/rss',
    critical: false,
    category: 'crypto'
  },
  {
    id: 'bitcoin-magazine',
    label: 'Bitcoin Magazine',
    rssUrl: 'https://bitcoinmagazine.com/rss',
    critical: false,
    category: 'crypto'
  },
  {
    id: 'decrypt-news',
    label: 'Decrypt',
    rssUrl: 'https://decrypt.co/feed',
    critical: false,
    category: 'crypto'
  },
  {
    id: 'the-block-news',
    label: 'The Block',
    rssUrl: 'https://www.theblock.co/rss.xml',
    critical: false,
    category: 'crypto'
  },
  
  // Macro-Economic News
  {
    id: 'ft-world',
    label: 'Financial Times - World',
    rssUrl: 'https://www.ft.com/rss/world',
    critical: false,
    category: 'macro'
  },
  {
    id: 'nyt-business',
    label: 'NYT Business',
    rssUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
    critical: false,
    category: 'macro'
  },
  {
    id: 'reuters-business',
    label: 'Reuters Business',
    rssUrl: 'https://feeds.reuters.com/reuters/businessNews',
    critical: false,
    category: 'macro'
  }
];

class RSSService {
  private secretClient: SecretManagerServiceClient;
  private corsProxy: string = '';
  private cache: RSSArticle[] = [];
  private cacheFetchedAt: number = 0;
  private readonly CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes default TTL

  constructor() {
    this.secretClient = new SecretManagerServiceClient();
  }

  // 简单哈希函数用于去重
  private simpleHash(s: string): string {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      const char = s.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return hash.toString();
  }

  // 初始化 CORS 代理
  async initializeProxy() {
    try {
      const [version] = await this.secretClient.accessSecretVersion({
        name: 'projects/biance-476510/secrets/RSS_PROXY_URL/versions/latest',
      });
      this.corsProxy = version.payload?.data?.toString() || '';
      console.log('[RSS] CORS proxy initialized');
    } catch (error) {
      console.error('[RSS] Failed to load CORS proxy:', error);
      // 使用默认代理
      this.corsProxy = 'https://api.allorigins.win/raw?url=';
    }
  }

  // 抓取单个 RSS 源
  async fetchFeed(feed: any): Promise<RSSArticle[]> {
    const articles: RSSArticle[] = [];
    
    try {
      // 如果代理已配置，使用代理；否则直接访问
      const url = this.corsProxy ? `${this.corsProxy}${encodeURIComponent(feed.rssUrl)}` : feed.rssUrl;
      console.log(`[RSS] Fetching ${feed.label} from: ${feed.rssUrl}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'BIANCE-RSS-Fetcher/1.0',
          'Accept': 'application/rss+xml, application/xml, text/xml'
        }
      });

      if (!response.ok) {
        console.error(`[RSS] Failed to fetch ${feed.label}: Status ${response.status}`);
        return articles;
      }

      const xmlString = await response.text();
      
      // 简单的 XML 解析（Node.js 环境）
      const items = xmlString.match(/<item>[\s\S]*?<\/item>/g) || [];
      
      for (const itemXml of items) {
        try {
          const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
          const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
          const descMatch = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/);
          const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);

          const title = titleMatch ? (titleMatch[1] || titleMatch[2] || 'No Title') : 'No Title';
          const link = linkMatch ? linkMatch[1] : '';
          const snippet = descMatch ? (descMatch[1] || descMatch[2] || '').substring(0, 200) + '...' : '';
          const pubDateStr = pubDateMatch ? pubDateMatch[1] : new Date().toISOString();
          const publishedAt = new Date(pubDateStr).getTime();

          if (!isNaN(publishedAt) && title !== 'No Title') {
            articles.push({
              idHash: this.simpleHash(title + link),
              feedId: feed.id,
              feedLabel: feed.label,
              title: title.trim(),
              link: link.trim(),
              publishedAt,
              snippet: snippet.trim(),
              critical: feed.critical,
              category: feed.category
            });
          }
        } catch (itemError) {
          console.error(`[RSS] Error parsing item from ${feed.label}:`, itemError);
        }
      }

      console.log(`[RSS] Successfully fetched ${articles.length} articles from ${feed.label}`);
    } catch (error) {
      console.error(`[RSS] Error fetching ${feed.label}:`, error);
    }

    return articles;
  }

  private isCacheExpired(maxAgeMs: number) {
    if (!this.cacheFetchedAt) return true;
    return Date.now() - this.cacheFetchedAt > maxAgeMs;
  }

  private async refreshCache() {
    // 确保代理已初始化
    if (!this.corsProxy) {
      await this.initializeProxy();
    }
    const batches = await Promise.all(RSS_SOURCES.map(feed => this.fetchFeed(feed)));
    const combined = batches.flat().sort((a, b) => b.publishedAt - a.publishedAt);
    this.cache = combined;
    this.cacheFetchedAt = Date.now();
  }

  private async ensureCache(options?: { maxAgeMs?: number; force?: boolean }) {
    const maxAgeMs = options?.maxAgeMs ?? this.CACHE_TTL_MS;
    if (options?.force || this.isCacheExpired(maxAgeMs)) {
      await this.refreshCache();
    }
  }

  // 抓取所有 RSS 源（强制刷新缓存）
  async fetchAllFeeds(): Promise<RSSArticle[]> {
    await this.ensureCache({ force: true });
    return [...this.cache];
  }

  async getAllArticles(options?: { maxAgeMs?: number }): Promise<RSSArticle[]> {
    await this.ensureCache({ maxAgeMs: options?.maxAgeMs });
    return [...this.cache];
  }

  async getArticlesSince(timestamp: number, options?: { maxAgeMs?: number; limit?: number }): Promise<RSSArticle[]> {
    const articles = await this.getAllArticles({ maxAgeMs: options?.maxAgeMs });
    const filtered = timestamp ? articles.filter(article => article.publishedAt >= timestamp) : articles;
    if (typeof options?.limit === 'number') {
      return filtered.slice(0, options.limit);
    }
    return filtered;
  }

  getCacheTimestamp() {
    return this.cacheFetchedAt;
  }

  // 获取 RSS 源配置
  getSources() {
    return RSS_SOURCES;
  }
}

export const rssService = new RSSService();
