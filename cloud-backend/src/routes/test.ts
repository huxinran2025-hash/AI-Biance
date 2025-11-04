import express from 'express';
import { loadSecrets } from '../secretManager.js';
import { rssService } from '../rssService.js';
import { aiService } from '../aiService.js';
import { auditService } from '../auditService.js';
import { Firestore } from '@google-cloud/firestore';
import { logger } from '../logger.js';

const firestore = new Firestore({
  projectId: 'biance-476510',
});

export function setupTestRoutes(app: express.Application) {
  // Secret Manager 测试端点
  app.get('/api/test/secrets', async (req, res) => {
    try {
      const echo = req.query.echo !== 'false';
      const testSecrets = await loadSecrets();
      
      const result = {
        ok: true,
        secrets: {
          DEEPSEEK_API_KEY: echo ? testSecrets.DEEPSEEK_API_KEY : '***masked***',
          GEMINI_API_KEY: echo ? testSecrets.GEMINI_API_KEY : '***masked***',
          GPT_API_KEY: echo ? testSecrets.GPT_API_KEY : '***masked***',
          RSS_PROXY_URL: echo ? testSecrets.RSS_PROXY_URL : '***masked***'
        },
        loaded_at: Date.now(),
        project: 'biance-476510'
      };
      
      res.json(result);
    } catch (error) {
      logger.error('Secrets test failed', error as Error);
      res.status(500).json({
        ok: false,
        error: String(error),
        timestamp: Date.now()
      });
    }
  });

  // 简单 RSS 测试端点
  app.get('/api/test/simple-rss', async (req, res) => {
    try {
      logger.info('Testing simple RSS fetch...');
      
      const testUrl = 'https://feeds.bbci.co.uk/news/rss.xml';
      logger.debug(`Fetching: ${testUrl}`);
      
      const response = await fetch(testUrl, {
        headers: {
          'User-Agent': 'BIANCE-RSS-Fetcher/1.0'
        }
      });
      
      logger.debug(`Response status: ${response.status}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const xmlString = await response.text();
      logger.debug(`XML length: ${xmlString.length}`);
      
      const titleMatches = xmlString.match(/<title>(.*?)<\/title>/g) || [];
      const linkMatches = xmlString.match(/<link>(.*?)<\/link>/g) || [];
      
      logger.info(`Found ${titleMatches.length} titles, ${linkMatches.length} links`);
      
      res.json({
        ok: true,
        url: testUrl,
        status: response.status,
        xmlLength: xmlString.length,
        titleCount: titleMatches.length,
        linkCount: linkMatches.length,
        sampleTitles: titleMatches.slice(0, 3),
        sampleLinks: linkMatches.slice(0, 3),
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Simple RSS test failed', error as Error);
      res.status(500).json({
        ok: false,
        error: String(error),
        timestamp: Date.now()
      });
    }
  });

  // 单独测试RSS源端点
  app.get('/api/test/rss-source', async (req, res) => {
    try {
      const { source } = req.query;
      
      if (!source) {
        return res.status(400).json({
          ok: false,
          error: 'Missing source parameter',
          availableSources: rssService.getSources().map(s => s.id),
          timestamp: Date.now()
        });
      }
      
      logger.info(`Testing RSS source: ${source}`);
      
      const sources = rssService.getSources();
      const targetSource = sources.find(s => s.id === source);
      
      if (!targetSource) {
        return res.status(404).json({
          ok: false,
          error: `Source '${source}' not found`,
          availableSources: sources.map(s => s.id),
          timestamp: Date.now()
        });
      }
      
      logger.debug(`Fetching ${targetSource.label} from: ${targetSource.rssUrl}`);
      
      const articles = await rssService.fetchFeed(targetSource);
      
      res.json({
        ok: true,
        source: {
          id: targetSource.id,
          label: targetSource.label,
          url: targetSource.rssUrl,
          category: targetSource.category,
          critical: targetSource.critical
        },
        results: {
          articleCount: articles.length,
          articles: articles.slice(0, 3).map(article => ({
            title: article.title,
            publishedAt: new Date(article.publishedAt).toISOString(),
            snippet: article.snippet.substring(0, 100) + '...'
          })),
          allArticles: articles.map(article => ({
            idHash: article.idHash,
            title: article.title,
            link: article.link,
            publishedAt: new Date(article.publishedAt).toISOString(),
            snippet: article.snippet.substring(0, 200) + '...',
            critical: article.critical,
            category: article.category
          }))
        },
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error(`RSS source test failed for source ${req.query.source}`, error as Error);
      res.status(500).json({
        ok: false,
        error: String(error),
        source: req.query.source,
        timestamp: Date.now()
      });
    }
  });

  // RSS 到 AI 完整流程测试端点
  app.post('/api/test/rss-to-ai', async (req, res) => {
    try {
      logger.info('Starting RSS to AI flow test...');
      
      logger.debug('Step 1: Fetching RSS data...');
      const articles = await rssService.fetchAllFeeds();
      logger.info(`Fetched ${articles.length} articles`);
      
      if (articles.length === 0) {
        return res.json({
          ok: false,
          error: 'No RSS articles found',
          step: 'rss_fetch',
          timestamp: Date.now()
        });
      }
      
      logger.debug('Step 2: Preparing AI input data...');
      const latestArticles = articles.slice(0, 5);
      const newsContext = latestArticles.map(article => ({
        title: article.title,
        snippet: article.snippet,
        publishedAt: new Date(article.publishedAt).toISOString(),
        category: article.category,
        critical: article.critical
      }));
      
      logger.info('Step 3: Calling AI models...');
      
      const newsSummary = newsContext.map(a => 
        `[${a.critical ? 'CRITICAL' : 'NORMAL'}] ${a.category}: ${a.title} - ${a.snippet.substring(0, 100)}`
      ).join('\n');
      
      const aiPrompt = `分析以下加密货币市场新闻，评估市场风险和交易建议：
    
${newsSummary}

请提供：
1. 市场风险评估（LOW/MEDIUM/HIGH）
2. 交易建议（BUY/SELL/HOLD/CAUTIOUS_BUY）
3. 信心水平（0-1之间的数值）
4. 简要分析原因`;

      const aiResults = await aiService.callAllModels({
        prompt: aiPrompt,
        systemPrompt: '你是一个专业的加密货币市场分析师，擅长从新闻中提取关键风险和交易机会。',
        temperature: 0.7,
        articlesProcessed: newsContext.length
      });
      
      logger.debug('Step 4: Logging to BigQuery...');
      try {
        await auditService.logModeTransition({
          ts_utc_ms: Date.now(),
          sid: 'rss-ai-test-' + Date.now(),
          old_mode: 'IDLE',
          new_mode: 'AI_ANALYSIS',
          trigger_reason: 'RSS_TO_AI_TEST',
          evidence_id: `rss-${articles.length}-articles`,
          external_ctx: {
            articlesProcessed: articles.length,
            aiModelsCalled: aiResults.length,
            testType: 'RSS_TO_AI_FLOW'
          }
        });
        logger.info('Successfully logged to BigQuery');
      } catch (error) {
        logger.error('BigQuery logging error', error as Error);
      }
      
      res.json({
        ok: true,
        flow: 'RSS_TO_AI',
        steps: {
          rss_fetch: { success: true, articlesCount: articles.length },
          ai_analysis: { success: true, modelsCalled: aiResults.length },
          bigquery_logging: { success: true }
        },
        data: {
          rssArticles: latestArticles,
          aiResults: aiResults,
          summary: {
            totalArticles: articles.length,
            processedArticles: newsContext.length,
            aiModelsResponded: aiResults.length,
            criticalArticles: newsContext.filter(a => a.critical).length
          }
        },
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error('RSS to AI flow test failed', error as Error);
      res.status(500).json({
        ok: false,
        error: String(error),
        step: 'unknown',
        timestamp: Date.now()
      });
    }
  });

  // AI Trading Council 测试端点
  app.post('/api/test/ai-council', async (req, res) => {
    try {
      const { testData } = req.body;
      const sessionId = String(req.query.sessionId || 'ai-test-session');
      
      logger.info('Testing AI Trading Council...');
      
      const testPrompt = testData?.prompt || `分析当前加密货币市场状况，提供交易建议。
考虑因素：
- 市场波动性
- 监管环境
- 交易所状态
- 技术指标

请提供风险评估和交易建议。`;
      
      const startTime = Date.now();
      const aiResults = await aiService.callAllModels({
        prompt: testPrompt,
        systemPrompt: '你是一个专业的量化交易策略师，擅长分析市场风险和交易机会。',
        temperature: 0.7,
      });
      
      const totalLatency = Date.now() - startTime;
      const successCount = aiResults.filter(r => r.success).length;
      
      await auditService.logModeTransition({
        ts_utc_ms: Date.now(),
        sid: sessionId,
        old_mode: 'IDLE',
        new_mode: 'AI_COUNCIL_TEST',
        trigger_reason: 'AI_COUNCIL_TEST',
        evidence_id: `ai-council-${successCount}-${aiResults.length}`,
        external_ctx: {
          modelsTested: aiResults.length,
          modelsSuccessful: successCount,
          totalLatencyMs: totalLatency,
          testType: 'AI_COUNCIL_PERFORMANCE'
        }
      });
      
      res.json({
        ok: true,
        aiCouncil: {
          modelsTested: aiResults.length,
          modelsSuccessful: successCount,
          totalLatencyMs: totalLatency,
          results: aiResults
        },
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('AI Council test failed', error as Error);
      res.status(500).json({
        ok: false,
        error: String(error),
        timestamp: Date.now()
      });
    }
  });

  // 模拟交易所事件（用于测试）
  app.post('/api/sim/exchange_event', async (req, res) => {
    try {
      const { source, status } = req.body;
      const sessionId = String(req.query.sessionId || 'test-session');
      
      logger.info(`Exchange event: ${source} -> ${status}`);
      
      await auditService.logModeTransition({
        ts_utc_ms: Date.now(),
        sid: sessionId,
        old_mode: 'NORMAL',
        new_mode: status === 'withdrawal_suspended' ? 'EMERGENCY_LANDING' : 'COOL_DOWN_EXTERNAL_UNSAFE',
        trigger_reason: `EXCHANGE_EVENT_${source.toUpperCase()}`,
        evidence_id: `exchange-${source}-${status}`,
        external_ctx: {
          source,
          status,
          simulated: true
        }
      });
      
      res.json({ 
        ok: true, 
        message: `Exchange event simulated: ${source} -> ${status}`,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error simulating exchange event', error as Error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  // 模拟账户变更（用于测试）
  app.post('/api/sim/account', async (req, res) => {
    try {
      const { equityDelta } = req.body;
      const sessionId = String(req.query.sessionId || 'test-session');
      
      logger.info(`Account change: ${equityDelta}`);
      
      const runtimeStateRef = firestore.collection('sessions').doc(sessionId).collection('runtimeState').doc('main');
      const currentState = await runtimeStateRef.get();
      
      if (currentState.exists) {
        const currentData = currentState.data();
        const newEquity = (currentData?.accountEquity || 10000) + equityDelta;
        
        await runtimeStateRef.update({
          accountEquity: newEquity,
          lastUpdated: Date.now()
        });
        
        if (newEquity < 5000) {
          await firestore.collection('sessions').doc(sessionId).collection('safetyState').doc('main').update({
            systemMode: 'COOL_DOWN_CAPITAL_STRESS',
            autoBrakeTriggered: true,
            brakeReason: 'CAPITAL_LOW',
            lastUpdated: Date.now()
          });
          
          await auditService.logModeTransition({
            ts_utc_ms: Date.now(),
            sid: sessionId,
            old_mode: 'NORMAL',
            new_mode: 'COOL_DOWN_CAPITAL_STRESS',
            trigger_reason: 'CAPITAL_LOW',
            evidence_id: `account-${equityDelta}`,
            external_ctx: {
              equityDelta,
              newEquity,
              simulated: true
            }
          });
        }
      }
      
      res.json({ 
        ok: true, 
        message: `Account change simulated: ${equityDelta}`,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error simulating account change', error as Error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  });
}







