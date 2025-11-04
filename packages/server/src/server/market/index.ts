import { MarketFeed } from '../../exchange/binance/md/index.js';

export interface MarketServiceOptions {
  symbols: string[];
}

export interface MarketService {
  start(): Promise<void>;
  stop(): Promise<void>;
  getSnapshot(): ReturnType<MarketFeed['getSnapshot']>;
}

export function createMarketService(options: MarketServiceOptions): MarketService {
  const feed = new MarketFeed({ symbols: options.symbols });

  return {
    async start() {
      await feed.start();
    },
    async stop() {
      await feed.stop();
    },
    getSnapshot() {
      return feed.getSnapshot();
    },
  };
}

// RSS 代理端点：解决浏览器 CORS 问题
export async function handleRssRelay(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url');
    
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch(decodeURIComponent(targetUrl), {
      headers: {
        'User-Agent': 'BIANCE-RSS-Relay/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Failed to fetch: HTTP ${response.status}` }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const text = await response.text();
    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/xml',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}


