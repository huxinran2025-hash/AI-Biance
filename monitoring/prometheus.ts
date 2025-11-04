import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { MetricsRegistry } from '../exchange/binance/monitor/metrics.js';

export interface MetricsServerOptions {
  port?: number;
  host?: string;
  endpoint?: string;
  registry: MetricsRegistry;
}

export function startMetricsServer({
  port = 9464,
  host = '0.0.0.0',
  endpoint = '/metrics',
  registry,
}: MetricsServerOptions) {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.statusCode = 404;
      res.end();
      return;
    }

    if (req.method === 'GET' && stripQuery(req.url) === endpoint) {
      try {
        const body = await registry.metrics();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; version=0.0.4');
        res.end(body);
      } catch (error) {
        res.statusCode = 500;
        res.end('failed to collect metrics');
        console.error('[MetricsServer] collect error', error);
      }
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  server.listen(port, host, () => {
    console.log(`[MetricsServer] listening on http://${host}:${port}${endpoint}`);
  });

  server.on('error', (err) => {
    console.error('[MetricsServer] error', err);
  });

  return server;
}

function stripQuery(url: string): string {
  const idx = url.indexOf('?');
  return idx === -1 ? url : url.slice(0, idx);
}

