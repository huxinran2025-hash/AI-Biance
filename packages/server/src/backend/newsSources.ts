// 2. 统一“信息源清单”，并且分优先级：什么必须盯，什么可以当背景噪音
import { NewsFeed } from '../types';

// 硬性要求：把所有 RSS 源整理成一份统一的配置文件
export const NEWS_SOURCES: NewsFeed[] = [
  // --- Critical: Exchange Status (使用替代源) ---
  {
    id: 'crypto-news-general',
    label: '加密货币综合新闻',
    rssUrl: 'https://cointelegraph.com/rss',
    category: 'exchange',
    critical: true,
    region: 'GLOBAL',
  },
  {
    id: 'crypto-market-news',
    label: '加密货币市场新闻',
    rssUrl: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    category: 'exchange',
    critical: true,
    region: 'GLOBAL',
  },

  // --- Critical: Regulation (只保留可用的SEC) ---
  {
    id: 'us-sec-news',
    label: '美国SEC新闻稿',
    rssUrl: 'https://www.sec.gov/news/pressreleases.rss',
    category: 'regulation',
    critical: true,
    region: 'US',
  },

  // --- Non-Critical: General Crypto News (for market sentiment) ---
  {
    id: 'coindesk-main',
    label: 'CoinDesk',
    rssUrl: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    category: 'crypto',
    critical: false,
    region: 'GLOBAL',
  },
  {
    id: 'cointelegraph-main',
    label: 'Cointelegraph',
    rssUrl: 'https://cointelegraph.com/rss',
    category: 'crypto',
    critical: false,
    region: 'GLOBAL',
  },

  // --- Non-Critical: Macro-Economic News ---
   {
    id: 'ft-world',
    label: 'Financial Times - World',
    rssUrl: 'https://www.ft.com/rss/world',
    category: 'macro',
    critical: false,
    region: 'GLOBAL',
  },
  {
    id: 'nyt-business',
    label: 'NYT Business',
    rssUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
    category: 'macro',
    critical: false,
    region: 'US',
  },
];
