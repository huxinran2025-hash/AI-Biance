import express from 'express';
import cors from 'cors';
import { logger, errorHandler, requestLogger } from './logger.js';
import { setupHealthRoutes } from './routes/health.js';
import { setupRssRoutes } from './routes/rss.js';
import { setupSessionRoutes } from './routes/session.js';
import { setupTestRoutes } from './routes/test.js';
import { setupMetricsRoutes } from './routes/metrics.js';

const app = express();
const port = process.env.PORT || 8080;

// 中间件
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// 路由设置
setupHealthRoutes(app);
setupRssRoutes(app);
setupSessionRoutes(app);
setupTestRoutes(app);
setupMetricsRoutes(app);

// 错误处理中间件（必须在最后）
app.use(errorHandler);

// 启动服务器
async function startServer() {
  try {
    // 加载密钥（在路由中会用到）
    logger.info('Starting server initialization...');
    
    app.listen(port, () => {
      logger.info(`BIANCE Backend running on port ${port}`);
      logger.info(`Project: biance-476510`);
      logger.info(`AI Models: deepseek-reasoner, gemini-2.5-pro, gpt-5`);
      logger.info(`Health endpoints: /health, /readyz, /livez`);
      logger.info(`Metrics endpoint: /metrics`);
    });
  } catch (error) {
    logger.error('Failed to start server', error as Error);
    process.exit(1);
  }
}

startServer();
