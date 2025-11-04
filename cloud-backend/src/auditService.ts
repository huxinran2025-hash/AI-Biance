import { BigQuery } from '@google-cloud/bigquery';

export class AuditService {
  private bigquery: BigQuery;

  constructor() {
    this.bigquery = new BigQuery({
      projectId: 'biance-476510',
    });
  }

  // 记录模式切换
  async logModeTransition(data: {
    ts_utc_ms: number;
    sid: string;
    old_mode: string;
    new_mode: string;
    trigger_reason: string;
    evidence_id?: string;
    external_ctx?: any;
    self_review?: any;
  }) {
    const now = new Date();
    const auditData = {
      ts_utc_ms: data.ts_utc_ms,
      ts_utc: now,
      event_date: now.toISOString().slice(0, 10), // YYYY-MM-DD 格式
      sid: data.sid,
      old_mode: data.old_mode,
      new_mode: data.new_mode,
      trigger_reason: data.trigger_reason,
      evidence_id: data.evidence_id || null,
      external_ctx: data.external_ctx || null,
      self_review: data.self_review || null,
    };

    try {
      await this.bigquery.dataset('audit').table('mode_transitions').insert([auditData]);
      console.log('[Audit] Mode transition logged:', auditData);
    } catch (error) {
      console.error('[Audit] Failed to log mode transition:', error);
    }
  }

  // 记录风控决策
  async logRiskDecision(data: {
    ts_utc_ms: number;
    sid: string;
    symbol: string;
    intent: any;
    decision: string;
    approved_notional: number;
    reason: string;
    clamps?: any;
    decisionAuthority?: string;
  }) {
    const now = new Date();
    const auditData = {
      ts_utc_ms: data.ts_utc_ms,
      ts_utc: now,
      event_date: now.toISOString().slice(0, 10),
      sid: data.sid,
      symbol: data.symbol,
      intent: data.intent,
      decision: data.decision,
      approved_notional: data.approved_notional,
      reason: data.reason,
      clamps: data.clamps || null,
      decisionAuthority: data.decisionAuthority || null,
    };

    try {
      await this.bigquery.dataset('audit').table('risk_decisions').insert([auditData]);
      console.log('[Audit] Risk decision logged:', auditData);
    } catch (error) {
      console.error('[Audit] Failed to log risk decision:', error);
    }
  }

  // 记录交易执行
  async logTrade(data: {
    ts_utc_ms: number;
    sid: string;
    side: string;
    symbol: string;
    notional: number;
    leverage: number;
    order_type: string;
    status: string;
    ack_latency_ms?: number;
  }) {
    const now = new Date();
    const auditData = {
      ts_utc_ms: data.ts_utc_ms,
      ts_utc: now,
      event_date: now.toISOString().slice(0, 10),
      sid: data.sid,
      side: data.side,
      symbol: data.symbol,
      notional: data.notional,
      leverage: data.leverage,
      order_type: data.order_type,
      status: data.status,
      ack_latency_ms: data.ack_latency_ms || 0,
    };

    try {
      await this.bigquery.dataset('audit').table('trades').insert([auditData]);
      console.log('[Audit] Trade logged:', auditData);
    } catch (error) {
      console.error('[Audit] Failed to log trade:', error);
    }
  }

  // 记录影子账本（被阻止的交易）
  async logShadowLedger(data: {
    ts_utc_ms: number;
    sid: string;
    model_id: string;
    pair: string;
    proposed: any;
    blocked_by: string;
    snapshot_mode: string;
    portfolio_exposure_pct: number;
  }) {
    const now = new Date();
    const auditData = {
      ts_utc_ms: data.ts_utc_ms,
      ts_utc: now,
      event_date: now.toISOString().slice(0, 10),
      sid: data.sid,
      model_id: data.model_id,
      pair: data.pair,
      proposed: data.proposed,
      blocked_by: data.blocked_by,
      snapshot_mode: data.snapshot_mode,
      portfolio_exposure_pct: data.portfolio_exposure_pct,
    };

    try {
      await this.bigquery.dataset('audit').table('shadow_ledger').insert([auditData]);
      console.log('[Audit] Shadow ledger logged:', auditData);
    } catch (error) {
      console.error('[Audit] Failed to log shadow ledger:', error);
    }
  }

  // 记录证据包
  async logEvidenceBundle(data: {
    ts_utc_ms: number;
    sid: string;
    evidence_id: string;
    bundle: any;
    sha256: string;
  }) {
    const now = new Date();
    const auditData = {
      ts_utc_ms: data.ts_utc_ms,
      ts_utc: now,
      event_date: now.toISOString().slice(0, 10),
      sid: data.sid,
      evidence_id: data.evidence_id,
      bundle: data.bundle,
      sha256: data.sha256,
    };

    try {
      await this.bigquery.dataset('audit').table('evidence_bundles').insert([auditData]);
      console.log('[Audit] Evidence bundle logged:', auditData);
    } catch (error) {
      console.error('[Audit] Failed to log evidence bundle:', error);
    }
  }

  // 记录交易开关切换
  async logTradeToggle(data: {
    ts_utc_ms: number;
    sid: string;
    old_enabled: boolean;
    new_enabled: boolean;
    actor?: string;
    ip?: string;
    user_agent?: string;
  }) {
    const now = new Date();
    const auditData = {
      ts_utc_ms: data.ts_utc_ms,
      ts_utc: now,
      event_date: now.toISOString().slice(0, 10),
      sid: data.sid,
      old_enabled: data.old_enabled,
      new_enabled: data.new_enabled,
      actor: data.actor || 'unknown',
      ip: data.ip || null,
      user_agent: data.user_agent || null,
    };

    try {
      // 尝试写入 trade_toggles 表，如果表不存在则只记录日志
      await this.bigquery.dataset('audit').table('trade_toggles').insert([auditData]);
      console.log('[Audit] Trade toggle logged:', auditData);
    } catch (error) {
      // 如果表不存在，使用 mode_transitions 表作为降级方案
      console.warn('[Audit] trade_toggles table may not exist, using mode_transitions as fallback');
      try {
        await this.logModeTransition({
          ts_utc_ms: data.ts_utc_ms,
          sid: data.sid,
          old_mode: data.old_enabled ? 'TRADE_ENABLED' : 'TRADE_DISABLED',
          new_mode: data.new_enabled ? 'TRADE_ENABLED' : 'TRADE_DISABLED',
          trigger_reason: 'MANUAL_TOGGLE',
          external_ctx: {
            actor: data.actor,
            ip: data.ip,
            user_agent: data.user_agent,
          },
        });
      } catch (fallbackError) {
        console.error('[Audit] Failed to log trade toggle (both methods failed):', fallbackError);
      }
    }
  }

  // 记录AI提示词审计信息
  async logPrompt(data: {
    ts: number;
    sessionId: string;
    model: string;
    modelLabel: string;
    executionMode?: 'paper' | 'shadow' | 'live';
    systemPrompt: string;
    userPrompt: string;
    context: {
      riskState?: any;
      clamp?: any;
      exposureNowUsd: number;
      capUsd: number;
      allowedPairs: string[];
      klineMeta?: {
        n: number;
        granularity: string;
      } | null;
    };
  }) {
    const now = new Date();
    const auditData = {
      ts_utc_ms: data.ts,
      ts_utc: now,
      event_date: now.toISOString().slice(0, 10),
      sid: data.sessionId,
      model: data.model,
      model_label: data.modelLabel,
      execution_mode: data.executionMode || 'unknown',
      system_prompt: data.systemPrompt,
      user_prompt: data.userPrompt,
      context: JSON.stringify(data.context),
    };

    try {
      // 尝试写入 ai_prompts 表，如果表不存在则只记录日志
      await this.bigquery.dataset('audit').table('ai_prompts').insert([auditData]);
      console.log('[Audit] AI prompt logged:', { sid: data.sessionId, model: data.modelLabel });
    } catch (error: any) {
      // 如果表不存在，记录警告但不阻塞
      if (error?.message?.includes('not found') || error?.message?.includes('does not exist')) {
        console.warn('[Audit] ai_prompts table may not exist, prompt not persisted:', {
          sid: data.sessionId,
          model: data.modelLabel,
          error: error.message,
        });
      } else {
        console.error('[Audit] Failed to log AI prompt:', error);
      }
    }
  }

  // 查询审计日志
  async getAuditLogs(sessionId: string, tableName: string = 'mode_transitions', limit: number = 100) {
    try {
      const query = `
        SELECT * FROM \`biance-476510.audit.${tableName}\`
        WHERE sid = @sessionId
        ORDER BY ts_utc_ms DESC
        LIMIT @limit
      `;
      
      const [rows] = await this.bigquery.query({
        query,
        params: { sessionId, limit },
      });
      
      return rows;
    } catch (error) {
      console.error('[Audit] Failed to get audit logs:', error);
      return [];
    }
  }
}

// 导出单例实例
export const auditService = new AuditService();
