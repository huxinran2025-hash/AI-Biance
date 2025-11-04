import express from 'express';
import { loadSecrets } from '../secretManager.js';
import { Firestore } from '@google-cloud/firestore';
import { BigQuery } from '@google-cloud/bigquery';
import { logger } from '../logger.js';

const firestore = new Firestore({
  projectId: 'biance-476510',
});

const bigquery = new BigQuery({
  projectId: 'biance-476510',
});

export function setupHealthRoutes(app: express.Application) {
  // 健康检查
  app.get('/health', (req, res) => {
    res.json({ 
      ok: true, 
      version: '1.0.0',
      boot_ts: Date.now(),
      timestamp: Date.now(), 
      service: 'biance-backend',
      project: 'biance-476510'
    });
  });

  // 依赖检查端点
  app.get('/readyz', async (req, res) => {
    try {
      const checks = {
        secrets: false,
        firestore: false,
        bigquery: false,
        rss_proxy: false
      };
      
      // 检查 Secret Manager
      try {
        await loadSecrets();
        checks.secrets = true;
      } catch (error) {
        logger.error('Secrets check failed', error as Error);
      }
      
      // 检查 Firestore
      try {
        await firestore.collection('_health').doc('readyz').set({ timestamp: Date.now() });
        checks.firestore = true;
      } catch (error) {
        logger.error('Firestore check failed', error as Error);
      }
      
      // 检查 BigQuery
      try {
        await bigquery.dataset('audit').get();
        checks.bigquery = true;
      } catch (error) {
        logger.error('BigQuery check failed', error as Error);
      }
      
      // 检查 RSS Proxy
      try {
        const testResponse = await fetch('https://api.allorigins.win/raw?url=https://example.com');
        checks.rss_proxy = testResponse.ok;
      } catch (error) {
        logger.error('RSS Proxy check failed', error as Error);
      }
      
      const allHealthy = Object.values(checks).every(check => check);
      
      res.status(allHealthy ? 200 : 503).json({
        ok: allHealthy,
        checks,
        timestamp: Date.now()
      });
    } catch (error) {
      res.status(503).json({
        ok: false,
        error: String(error),
        timestamp: Date.now()
      });
    }
  });

  // 进程健康检查
  app.get('/livez', (req, res) => {
    res.json({ 
      ok: true, 
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: Date.now()
    });
  });
}







