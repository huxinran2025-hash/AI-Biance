import { Request, Response, NextFunction } from 'express';

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  error?: Error;
  context?: Record<string, any>;
}

class Logger {
  private logLevel: 'info' | 'warn' | 'error' | 'debug' = 'info';

  constructor(level?: 'info' | 'warn' | 'error' | 'debug') {
    if (level) {
      this.logLevel = level;
    }
  }

  private shouldLog(level: LogEntry['level']): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = new Date(entry.timestamp).toISOString();
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
    const errorStr = entry.error ? ` Error: ${entry.error.message}` : '';
    return `[${timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${contextStr}${errorStr}`;
  }

  info(message: string, context?: Record<string, any>) {
    if (this.shouldLog('info')) {
      const entry: LogEntry = {
        timestamp: Date.now(),
        level: 'info',
        message,
        context,
      };
      console.log(this.formatMessage(entry));
    }
  }

  warn(message: string, context?: Record<string, any>) {
    if (this.shouldLog('warn')) {
      const entry: LogEntry = {
        timestamp: Date.now(),
        level: 'warn',
        message,
        context,
      };
      console.warn(this.formatMessage(entry));
    }
  }

  error(message: string, error?: Error, context?: Record<string, any>) {
    if (this.shouldLog('error')) {
      const entry: LogEntry = {
        timestamp: Date.now(),
        level: 'error',
        message,
        error,
        context,
      };
      console.error(this.formatMessage(entry));
    }
  }

  debug(message: string, context?: Record<string, any>) {
    if (this.shouldLog('debug')) {
      const entry: LogEntry = {
        timestamp: Date.now(),
        level: 'debug',
        message,
        context,
      };
      console.debug(this.formatMessage(entry));
    }
  }
}

export const logger = new Logger(process.env.LOG_LEVEL as 'info' | 'warn' | 'error' | 'debug' || 'info');

// Express 错误处理中间件
export function errorHandler(error: Error, req: Request, res: Response, next: NextFunction) {
  logger.error('Unhandled error in request', error, {
    method: req.method,
    path: req.path,
    query: req.query,
    body: req.body,
  });

  res.status(500).json({
    ok: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    timestamp: Date.now(),
  });
}

// 请求日志中间件
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${req.path}`, {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    });
  });
  
  next();
}

