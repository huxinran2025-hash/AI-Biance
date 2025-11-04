# BIANCE Backend API 文档

## 概述

BIANCE Backend 是一个运行在 Google Cloud Run 上的量化交易系统后端服务。

**Base URL**: `https://biance-backend-495185885743.asia-east1.run.app`

## 认证

目前所有端点都是公开访问的（`--allow-unauthenticated`）。未来可能会添加基于 API Key 的认证。

## 端点列表

### 健康检查

#### GET /health
检查服务是否运行。

**响应**:
```json
{
  "ok": true,
  "version": "1.0.0",
  "boot_ts": 1234567890000,
  "timestamp": 1234567890000,
  "service": "biance-backend",
  "project": "biance-476510"
}
```

#### GET /readyz
检查所有依赖服务的健康状态。

**响应**:
```json
{
  "ok": true,
  "checks": {
    "secrets": true,
    "firestore": true,
    "bigquery": true,
    "rss_proxy": true
  },
  "timestamp": 1234567890000
}
```

#### GET /livez
检查进程健康状态。

**响应**:
```json
{
  "ok": true,
  "uptime": 12345.67,
  "memory": { ... },
  "timestamp": 1234567890000
}
```

### 会话管理

#### POST /api/session/start
创建新的交易会话。

**请求体**:
```json
{
  "config": {
    "leverageCap": 10,
    "capitalUsageLimitPct": 30,
    "allowedPairs": ["BTCUSDT", "ETHUSDT"],
    "nightSafetyMode": true,
    "autoScaleUpCapital": false
  }
}
```

**响应**:
```json
{
  "ok": true,
  "sessionId": "session_1234567890000"
}
```

#### GET /api/session/:sessionId/state
获取会话状态。

**响应**:
```json
{
  "ok": true,
  "config": { ... },
  "runtimeState": { ... },
  "safetyState": { ... }
}
```

#### POST /api/session/:sessionId/halt
暂停会话。

**响应**:
```json
{
  "ok": true,
  "message": "Session halted"
}
```

#### POST /api/session/:sessionId/resume
恢复会话。

**响应**:
```json
{
  "ok": true,
  "message": "Session resumed"
}
```

#### GET /api/session/:sessionId/logs
获取会话审计日志。

**响应**:
```json
{
  "ok": true,
  "logs": [ ... ]
}
```

### RSS 服务

#### GET /api/rss/sources
获取所有 RSS 源配置。

**响应**:
```json
{
  "ok": true,
  "sources": [
    {
      "id": "crypto-news-general",
      "label": "加密货币综合新闻",
      "category": "exchange",
      "critical": true
    }
  ],
  "timestamp": 1234567890000
}
```

#### GET /api/rss/events
获取 RSS 事件。

**查询参数**:
- `since` (number): 时间戳，仅返回此时间之后的事件
- `maxAgeMs` (number): 最大年龄（毫秒）
- `limit` (number): 返回数量限制

**响应**:
```json
{
  "ok": true,
  "fetchedAt": 1234567890000,
  "cacheTimestamp": 1234567890000,
  "articles": [
    {
      "idHash": "abc123",
      "feedId": "crypto-news-general",
      "feedLabel": "加密货币综合新闻",
      "title": "新闻标题",
      "link": "https://...",
      "snippet": "摘要...",
      "publishedAt": 1234567890000,
      "severity": "critical",
      "topic": "exchange"
    }
  ]
}
```

### AI 服务

#### POST /api/test/rss-to-ai
测试 RSS 到 AI 的完整流程。

**响应**:
```json
{
  "ok": true,
  "flow": "RSS_TO_AI",
  "steps": {
    "rss_fetch": { "success": true, "articlesCount": 10 },
    "ai_analysis": { "success": true, "modelsCalled": 3 },
    "bigquery_logging": { "success": true }
  },
  "data": {
    "rssArticles": [ ... ],
    "aiResults": [ ... ]
  },
  "timestamp": 1234567890000
}
```

#### POST /api/test/ai-council
测试 AI Trading Council。

**请求体** (可选):
```json
{
  "testData": {
    "prompt": "分析当前市场状况..."
  }
}
```

**查询参数**:
- `sessionId` (string): 会话ID

**响应**:
```json
{
  "ok": true,
  "aiCouncil": {
    "modelsTested": 3,
    "modelsSuccessful": 3,
    "totalLatencyMs": 2500,
    "results": [
      {
        "model": "deepseek-reasoner",
        "analysis": "...",
        "riskLevel": "MEDIUM",
        "recommendation": "HOLD",
        "confidence": 0.75,
        "latency_ms": 800,
        "success": true
      }
    ]
  },
  "timestamp": 1234567890000
}
```

### 配置管理

#### POST /api/session/:sessionId/capital_limit
更新资金使用上限。

**请求体**:
```json
{
  "capitalUsageLimitPct": 50
}
```

**响应**:
```json
{
  "ok": true,
  "message": "Capital limit updated to 50%",
  "timestamp": 1234567890000
}
```

### 监控

#### GET /metrics
获取 Prometheus 格式的监控指标。

**响应**: OpenMetrics 格式文本

### 测试端点

#### GET /api/test/secrets
测试 Secret Manager 配置。

**查询参数**:
- `echo` (boolean): 是否显示密钥值（默认 true）

#### GET /api/test/simple-rss
简单 RSS 抓取测试。

#### GET /api/test/rss-source
测试单个 RSS 源。

**查询参数**:
- `source` (string): RSS 源 ID

### 模拟端点

#### POST /api/sim/exchange_event
模拟交易所事件（用于测试）。

**请求体**:
```json
{
  "source": "binance",
  "status": "withdrawal_suspended"
}
```

**查询参数**:
- `sessionId` (string): 会话ID

#### POST /api/sim/account
模拟账户变更（用于测试）。

**请求体**:
```json
{
  "equityDelta": -1000
}
```

**查询参数**:
- `sessionId` (string): 会话ID

## 错误响应

所有错误响应遵循以下格式：

```json
{
  "ok": false,
  "error": "错误描述",
  "timestamp": 1234567890000
}
```

HTTP 状态码：
- `200`: 成功
- `400`: 请求参数错误
- `404`: 资源未找到
- `500`: 服务器内部错误
- `503`: 服务不可用（用于 readyz 端点）

## 速率限制

目前没有速率限制，但建议：
- 健康检查端点：每 30 秒一次
- RSS 端点：每 2 分钟一次
- AI 端点：根据实际需求，避免频繁调用

## 环境变量

- `PORT`: 服务端口（默认 8080）
- `GOOGLE_CLOUD_PROJECT`: GCP 项目ID（默认 biance-476510）
- `LOG_LEVEL`: 日志级别（info/warn/error/debug，默认 info）
- `NODE_ENV`: 环境（production/development）

## 依赖服务

- Google Cloud Secret Manager: 存储 API 密钥
- Google Cloud Firestore: 存储会话状态
- Google Cloud BigQuery: 存储审计日志
- RSS Proxy: 用于 RSS 抓取（可选）

