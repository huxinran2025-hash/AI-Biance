import express from 'express';
import { Firestore } from '@google-cloud/firestore';
import { auditService } from '../auditService.js';
import { logger } from '../logger.js';

const firestore = new Firestore({
  projectId: 'biance-476510',
});

// 频控：记录每个会话的最后一次切换时间（30s 限制）
const lastToggleTime = new Map<string, number>();
const TOGGLE_COOLDOWN_MS = 30000; // 30秒

export function setupSessionRoutes(app: express.Application) {
  // 会话管理API
  app.post('/api/session/start', async (req, res) => {
    try {
      const { config } = req.body;
      const sessionId = `session_${Date.now()}`;
      
      // 保存会话配置到 Firestore
      await firestore.collection('sessions').doc(sessionId).collection('config').doc('main').set({
        ...config,
        createdAt: Date.now(),
      });
      
      // 初始化运行状态
      await firestore.collection('sessions').doc(sessionId).collection('runtimeState').doc('main').set({
        accountEquity: 10000,
        effectiveLeverage: 0,
        todaysLossPct: 0,
        maxDrawdownPct: 0,
        positions: [],
        tradeEnabled: false, // 默认关闭交易
        tradeToggleAt: null,
        dataFreshness: {
          priceAgeMs: 0,
          accountAgeMs: 0,
          rssOk: true,
          nof1Ok: true,
        },
        lastUpdated: Date.now(),
      });
      
      // 初始化安全状态
      await firestore.collection('sessions').doc(sessionId).collection('safetyState').doc('main').set({
        systemMode: 'NORMAL',
        autoBrakeTriggered: false,
        brakeReason: null,
        cooldownUntilTs: null,
        lastEvidenceId: null,
        lastUpdated: Date.now(),
      });
      
      res.json({ ok: true, sessionId });
    } catch (error) {
      logger.error('Error starting session', error as Error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  // 获取会话状态
  app.get('/api/session/:sessionId/state', async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      const [config, runtimeState, safetyState] = await Promise.all([
        firestore.collection('sessions').doc(sessionId).collection('config').doc('main').get(),
        firestore.collection('sessions').doc(sessionId).collection('runtimeState').doc('main').get(),
        firestore.collection('sessions').doc(sessionId).collection('safetyState').doc('main').get(),
      ]);
      
      res.json({
        ok: true,
        config: config.data(),
        runtimeState: runtimeState.data(),
        safetyState: safetyState.data(),
      });
    } catch (error) {
      logger.error('Error getting session state', error as Error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  // Halt 操作
  app.post('/api/session/:sessionId/halt', async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      await firestore.collection('sessions').doc(sessionId).collection('safetyState').doc('main').update({
        systemMode: 'PAUSED',
        autoBrakeTriggered: true,
        brakeReason: 'MANUAL',
        lastUpdated: Date.now(),
      });
      
      // 记录到 BigQuery
      await auditService.logModeTransition({
        ts_utc_ms: Date.now(),
        sid: sessionId,
        old_mode: 'unknown',
        new_mode: 'PAUSED',
        trigger_reason: 'MANUAL',
      });
      
      res.json({ ok: true, message: 'Session halted' });
    } catch (error) {
      logger.error('Error halting session', error as Error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  // Resume 操作
  app.post('/api/session/:sessionId/resume', async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      await firestore.collection('sessions').doc(sessionId).collection('safetyState').doc('main').update({
        systemMode: 'NORMAL',
        autoBrakeTriggered: false,
        brakeReason: null,
        lastUpdated: Date.now(),
      });
      
      // 记录到 BigQuery
      await auditService.logModeTransition({
        ts_utc_ms: Date.now(),
        sid: sessionId,
        old_mode: 'PAUSED',
        new_mode: 'NORMAL',
        trigger_reason: 'RECOVERY',
      });
      
      res.json({ ok: true, message: 'Session resumed' });
    } catch (error) {
      logger.error('Error resuming session', error as Error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  // 获取审计日志
  app.get('/api/session/:sessionId/logs', async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      // 从 BigQuery 查询最近的日志
      const logs = await auditService.getAuditLogs(sessionId, 'mode_transitions', 100);
      
      res.json({ ok: true, logs });
    } catch (error) {
      logger.error('Error getting logs', error as Error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  // 资金上限调整
  app.post('/api/session/:sessionId/capital_limit', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { capitalUsageLimitPct } = req.body;
      
      if (capitalUsageLimitPct < 0 || capitalUsageLimitPct > 100) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Capital limit must be between 0 and 100' 
        });
      }
      
      // 更新配置
      await firestore.collection('sessions').doc(sessionId).collection('config').doc('main').update({
        capitalUsageLimitPct,
        lastUpdated: Date.now()
      });
      
      // 记录到 BigQuery
      await auditService.logModeTransition({
        ts_utc_ms: Date.now(),
        sid: sessionId,
        old_mode: 'unknown',
        new_mode: 'CONFIG_UPDATED',
        trigger_reason: 'CAPITAL_LIMIT_CHANGE',
        evidence_id: `capital-limit-${capitalUsageLimitPct}`,
        external_ctx: {
          capitalUsageLimitPct,
          configChange: true
        }
      });
      
      res.json({ 
        ok: true, 
        message: `Capital limit updated to ${capitalUsageLimitPct}%`,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('Error updating capital limit', error as Error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  });

  // 切换交易开关
  app.patch('/api/session/:sessionId/trade-enabled', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { enabled } = req.body as { enabled?: boolean };

      // 参数校验
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ 
          ok: false, 
          error: 'invalid_body',
          message: 'enabled must be a boolean' 
        });
      }

      // 频控检查
      const now = Date.now();
      const lastToggle = lastToggleTime.get(sessionId);
      if (lastToggle && (now - lastToggle) < TOGGLE_COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((TOGGLE_COOLDOWN_MS - (now - lastToggle)) / 1000);
        return res.status(429).json({ 
          ok: false, 
          error: 'rate_limit_exceeded',
          message: `Please wait ${remainingSeconds} seconds before toggling again` 
        });
      }

      // 检查会话是否存在
      const runtimeStateRef = firestore.collection('sessions').doc(sessionId).collection('runtimeState').doc('main');
      const runtimeStateDoc = await runtimeStateRef.get();
      
      if (!runtimeStateDoc.exists) {
        return res.status(404).json({ 
          ok: false, 
          error: 'not_found',
          message: 'Session not found' 
        });
      }

      const currentState = runtimeStateDoc.data();
      const currentTradeEnabled = currentState?.tradeEnabled ?? false;

      // 幂等性处理：相同状态直接返回
      if (currentTradeEnabled === enabled) {
        return res.json({ 
          ok: true, 
          enabled, 
          ts: now,
          message: 'No change needed (idempotent)' 
        });
      }

      try {
        // 更新状态
        await runtimeStateRef.update({
          tradeEnabled: enabled,
          tradeToggleAt: now,
          lastUpdated: now,
        });

        // 更新频控记录
        lastToggleTime.set(sessionId, now);

        // 记录审计日志
        await auditService.logTradeToggle({
          ts_utc_ms: now,
          sid: sessionId,
          old_enabled: currentTradeEnabled,
          new_enabled: enabled,
          actor: req.headers['x-user-id'] || 'unknown',
          ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
          user_agent: req.headers['user-agent'] || 'unknown',
        });

        logger.info(`[Session] Trade enabled toggled`, { 
          sessionId, 
          enabled, 
          from: currentTradeEnabled 
        });

        return res.json({ 
          ok: true, 
          enabled, 
          ts: now 
        });
      } catch (error) {
        logger.error('[Session] Toggle failed', error as Error);
        return res.status(503).json({ 
          ok: false, 
          error: 'toggle_failed',
          message: 'Failed to toggle trade enabled state' 
        });
      }
    } catch (error) {
      logger.error('Error in trade-enabled toggle', error as Error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  });
}






