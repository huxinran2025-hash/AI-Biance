import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3005,
        host: '0.0.0.0',
        proxy: {
          '/binance': {
            target: process.env.VITE_BINANCE_REST || 'https://data-api.binance.vision',
            changeOrigin: true,
            ws: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/binance/, ''),
            configure: (proxy, _options) => {
              proxy.on('error', (err, _req, _res) => {
                console.warn('[Vite Proxy] Binance API proxy error:', err?.code);
              });
              proxy.on('proxyReq', (proxyReq, req, _res) => {
                console.debug('[Vite Proxy] Request:', req.method, req.url);
              });
            },
          },
        },
      },
      plugins: [
        react(),
        {
          name: 'rss-relay',
          configureServer(server) {
            server.middlewares.use('/rss/relay', async (req, res, next) => {
              try {
                const url = new URL(req.url || '', `http://${req.headers.host}`);
                const targetUrl = url.searchParams.get('url');
                
                if (!targetUrl) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Missing url parameter' }));
                  return;
                }

                const response = await fetch(decodeURIComponent(targetUrl), {
                  headers: {
                    'User-Agent': 'BIANCE-RSS-Relay/1.0',
                    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
                  },
                });

                if (!response.ok) {
                  res.writeHead(response.status, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: `Failed to fetch: HTTP ${response.status}` }));
                  return;
                }

                const text = await response.text();
                res.writeHead(200, {
                  'Content-Type': response.headers.get('Content-Type') || 'application/xml',
                  'Access-Control-Allow-Origin': '*',
                });
                res.end(text);
              } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: String(error) }));
              }
            });
          },
        },
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
