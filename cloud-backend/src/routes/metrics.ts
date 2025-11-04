import express from 'express';

export function setupMetricsRoutes(app: express.Application) {
  // 监控指标端点
  app.get('/metrics', (req, res) => {
    const metrics = {
      system_mode: 'NORMAL',
      auto_brake_triggered: false,
      risk_reject_ratio: 0.15,
      order_ack_latency_p95: 250,
      ws_lag_ms: 50,
      uptime_seconds: process.uptime(),
      memory_usage_bytes: process.memoryUsage().heapUsed,
      timestamp: Date.now()
    };
    
    // OpenMetrics 格式
    const openMetrics = `# HELP system_mode Current system mode
# TYPE system_mode gauge
system_mode{value="${metrics.system_mode}"} 1

# HELP auto_brake_triggered Whether auto brake is triggered
# TYPE auto_brake_triggered gauge
auto_brake_triggered ${metrics.auto_brake_triggered ? 1 : 0}

# HELP risk_reject_ratio Risk rejection ratio
# TYPE risk_reject_ratio gauge
risk_reject_ratio ${metrics.risk_reject_ratio}

# HELP order_ack_latency_p95 Order acknowledgment latency P95
# TYPE order_ack_latency_p95 gauge
order_ack_latency_p95 ${metrics.order_ack_latency_p95}

# HELP ws_lag_ms WebSocket lag in milliseconds
# TYPE ws_lag_ms gauge
ws_lag_ms ${metrics.ws_lag_ms}

# HELP uptime_seconds Process uptime in seconds
# TYPE uptime_seconds gauge
uptime_seconds ${metrics.uptime_seconds}

# HELP memory_usage_bytes Memory usage in bytes
# TYPE memory_usage_bytes gauge
memory_usage_bytes ${metrics.memory_usage_bytes}
`;
    
    res.set('Content-Type', 'text/plain');
    res.send(openMetrics);
  });
}







