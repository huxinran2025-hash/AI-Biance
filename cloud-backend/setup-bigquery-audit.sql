-- BIANCE BigQuery 审计表设置脚本
-- 创建分区表和必要的索引

-- 1. 模式切换表
CREATE TABLE IF NOT EXISTS `biance-476510.audit.mode_transitions` (
  ts_utc_ms INT64 NOT NULL,
  ts_utc TIMESTAMP NOT NULL,
  event_date DATE NOT NULL,
  sid STRING NOT NULL,
  old_mode STRING NOT NULL,
  new_mode STRING NOT NULL,
  trigger_reason STRING NOT NULL,
  evidence_id STRING,
  external_ctx JSON,
  self_review JSON
)
PARTITION BY DATE(TIMESTAMP_MILLIS(ts_utc_ms))
CLUSTER BY sid, new_mode
OPTIONS (
  description = "系统模式切换审计日志",
  partition_expiration_days = 365
);

-- 2. 风控决策表
CREATE TABLE IF NOT EXISTS `biance-476510.audit.risk_decisions` (
  ts_utc_ms INT64 NOT NULL,
  ts_utc TIMESTAMP NOT NULL,
  event_date DATE NOT NULL,
  sid STRING NOT NULL,
  symbol STRING NOT NULL,
  intent JSON NOT NULL,
  decision STRING NOT NULL,
  approved_notional FLOAT64 NOT NULL,
  reason STRING NOT NULL,
  clamps JSON,
  decisionAuthority STRING
)
PARTITION BY DATE(TIMESTAMP_MILLIS(ts_utc_ms))
CLUSTER BY sid, symbol, decision
OPTIONS (
  description = "风控决策审计日志",
  partition_expiration_days = 365
);

-- 3. 交易执行表
CREATE TABLE IF NOT EXISTS `biance-476510.audit.trades` (
  ts_utc_ms INT64 NOT NULL,
  ts_utc TIMESTAMP NOT NULL,
  event_date DATE NOT NULL,
  sid STRING NOT NULL,
  side STRING NOT NULL,
  symbol STRING NOT NULL,
  notional FLOAT64 NOT NULL,
  leverage FLOAT64 NOT NULL,
  order_type STRING NOT NULL,
  status STRING NOT NULL,
  ack_latency_ms INT64
)
PARTITION BY DATE(TIMESTAMP_MILLIS(ts_utc_ms))
CLUSTER BY sid, symbol, status
OPTIONS (
  description = "交易执行审计日志",
  partition_expiration_days = 365
);

-- 4. 影子账本表（被阻止的交易）
CREATE TABLE IF NOT EXISTS `biance-476510.audit.shadow_ledger` (
  ts_utc_ms INT64 NOT NULL,
  ts_utc TIMESTAMP NOT NULL,
  event_date DATE NOT NULL,
  sid STRING NOT NULL,
  model_id STRING NOT NULL,
  pair STRING NOT NULL,
  proposed JSON NOT NULL,
  blocked_by STRING NOT NULL,
  snapshot_mode STRING NOT NULL,
  portfolio_exposure_pct FLOAT64 NOT NULL
)
PARTITION BY DATE(TIMESTAMP_MILLIS(ts_utc_ms))
CLUSTER BY sid, pair, blocked_by
OPTIONS (
  description = "影子账本 - 被风控阻止的交易记录",
  partition_expiration_days = 365
);

-- 5. 证据包表
CREATE TABLE IF NOT EXISTS `biance-476510.audit.evidence_bundles` (
  ts_utc_ms INT64 NOT NULL,
  ts_utc TIMESTAMP NOT NULL,
  event_date DATE NOT NULL,
  sid STRING NOT NULL,
  evidence_id STRING NOT NULL,
  bundle JSON NOT NULL,
  sha256 STRING NOT NULL
)
PARTITION BY DATE(TIMESTAMP_MILLIS(ts_utc_ms))
CLUSTER BY sid, evidence_id
OPTIONS (
  description = "证据包审计日志",
  partition_expiration_days = 365
);

-- 创建视图：今日审计摘要
CREATE OR REPLACE VIEW `biance-476510.audit.daily_summary` AS
SELECT 
  CURRENT_DATE() as report_date,
  COUNT(DISTINCT sid) as active_sessions,
  COUNT(*) as total_mode_transitions,
  COUNTIF(new_mode = 'EMERGENCY_LANDING') as emergency_landings,
  COUNTIF(new_mode = 'COOL_DOWN_CAPITAL_STRESS') as capital_stress_events,
  COUNTIF(new_mode = 'COOL_DOWN_EXTERNAL_UNSAFE') as external_unsafe_events
FROM `biance-476510.audit.mode_transitions`
WHERE DATE(TIMESTAMP_MILLIS(ts_utc_ms)) = CURRENT_DATE();

-- 创建视图：风控决策统计
CREATE OR REPLACE VIEW `biance-476510.audit.risk_summary` AS
SELECT 
  DATE(TIMESTAMP_MILLIS(ts_utc_ms)) as report_date,
  sid,
  COUNT(*) as total_decisions,
  COUNTIF(decision = 'APPROVE') as approved_trades,
  COUNTIF(decision = 'REJECT') as rejected_trades,
  COUNTIF(decision = 'SHRINK') as shrunk_trades,
  AVG(approved_notional) as avg_approved_notional,
  SUM(approved_notional) as total_approved_notional
FROM `biance-476510.audit.risk_decisions`
WHERE DATE(TIMESTAMP_MILLIS(ts_utc_ms)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY report_date, sid
ORDER BY report_date DESC, sid;

-- 创建视图：交易执行统计
CREATE OR REPLACE VIEW `biance-476510.audit.trade_summary` AS
SELECT 
  DATE(TIMESTAMP_MILLIS(ts_utc_ms)) as report_date,
  sid,
  symbol,
  COUNT(*) as total_trades,
  COUNTIF(status = 'FILLED') as filled_trades,
  COUNTIF(status = 'REJECTED') as rejected_trades,
  SUM(CASE WHEN status = 'FILLED' THEN notional ELSE 0 END) as total_filled_notional,
  AVG(CASE WHEN status = 'FILLED' THEN ack_latency_ms ELSE NULL END) as avg_ack_latency_ms,
  PERCENTILE_CONT(CASE WHEN status = 'FILLED' THEN ack_latency_ms ELSE NULL END, 0.95) OVER (PARTITION BY DATE(TIMESTAMP_MILLIS(ts_utc_ms)), sid, symbol) as p95_ack_latency_ms
FROM `biance-476510.audit.trades`
WHERE DATE(TIMESTAMP_MILLIS(ts_utc_ms)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY report_date, sid, symbol
ORDER BY report_date DESC, sid, symbol;

-- 插入测试数据（可选）
INSERT INTO `biance-476510.audit.mode_transitions` 
(ts_utc_ms, ts_utc, event_date, sid, old_mode, new_mode, trigger_reason, evidence_id, external_ctx)
VALUES 
(
  UNIX_MILLIS(CURRENT_TIMESTAMP()),
  CURRENT_TIMESTAMP(),
  CURRENT_DATE(),
  'test-session-001',
  'IDLE',
  'NORMAL',
  'SYSTEM_STARTUP',
  'startup-evidence-001',
  JSON '{"test": true, "version": "1.0.0"}'
);

-- 验证分区裁剪效果
SELECT 
  'mode_transitions' as table_name,
  COUNT(*) as total_rows,
  SUM(CAST(JSON_EXTRACT_SCALAR(_PARTITIONTIME, '$.value') AS INT64)) as partition_bytes
FROM `biance-476510.audit.mode_transitions`
WHERE DATE(TIMESTAMP_MILLIS(ts_utc_ms)) = CURRENT_DATE();

-- 验证集簇效果
SELECT 
  sid,
  COUNT(*) as events_count
FROM `biance-476510.audit.mode_transitions`
WHERE DATE(TIMESTAMP_MILLIS(ts_utc_ms)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY sid
ORDER BY events_count DESC
LIMIT 10;
