import express from 'express';
import { rssService } from '../rssService.js';
import { logger } from '../logger.js';

const CATEGORY_TOPIC_MAP: Record<string, 'regulator' | 'exchange' | 'macro' | 'crypto_sentiment'> = {
  regulation: 'regulator',
  exchange: 'exchange',
  macro: 'macro',
  crypto: 'crypto_sentiment',
  stablecoin: 'macro',
};

export function setupRssRoutes(app: express.Application) {
  // RSS 源配置端点
  app.get('/api/rss/sources', (req, res) => {
    try {
      const sources = rssService.getSources();
      res.json({
        ok: true,
        sources: sources.map(s => ({
          id: s.id,
          label: s.label,
          category: s.category,
          critical: s.critical
        })),
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: String(error),
        timestamp: Date.now()
      });
    }
  });

  // RSS 事件端点
  app.get('/api/rss/events', async (req, res) => {
    try {
      const since = Number(req.query.since) || 0;
      const maxAgeMs = req.query.maxAgeMs ? Number(req.query.maxAgeMs) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const articles = await rssService.getArticlesSince(since, { maxAgeMs, limit });
      const toTopic = (category: string): 'regulator' | 'exchange' | 'macro' | 'crypto_sentiment' => {
        return CATEGORY_TOPIC_MAP[category] || 'crypto_sentiment';
      };

      res.json({
        ok: true,
        fetchedAt: Date.now(),
        cacheTimestamp: rssService.getCacheTimestamp(),
        articles: articles.map(article => ({
          idHash: article.idHash,
          feedId: article.feedId,
          feedLabel: article.feedLabel,
          title: article.title,
          link: article.link,
          snippet: article.snippet,
          publishedAt: article.publishedAt,
          severity: article.critical ? 'critical' : 'non_critical',
          topic: toTopic(article.category),
        })),
      });
    } catch (error) {
      logger.error('Failed to provide RSS events', error as Error);
      res.status(500).json({
        ok: false,
        error: String(error),
        timestamp: Date.now(),
      });
    }
  });
}







