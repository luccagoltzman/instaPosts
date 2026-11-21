import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { OPERATIONS, configFromEnv, type ServerConfig } from './api/_lib/instagram.js';
import { streamMedia } from './api/_lib/media.js';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function instagramDevProxy(config: ServerConfig): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? '';

    if (url.startsWith('/api/proxy-media') && req.method === 'GET') {
      const target = new URL(url, 'http://localhost').searchParams.get('url');
      await streamMedia(target, req.headers.range, res);
      return;
    }

    if (!url.startsWith('/api/instagram/')) {
      next();
      return;
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const name = url.slice('/api/instagram/'.length).split(/[/?#]/)[0];
    const operation = Object.prototype.hasOwnProperty.call(OPERATIONS, name) ? OPERATIONS[name as keyof typeof OPERATIONS] : null;
    if (!operation) {
      next();
      return;
    }

    try {
      const raw = await readBody(req);
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(raw || '{}') as Record<string, unknown>;
      } catch {
        body = {};
      }

      const result = await operation(config, body);
      res.statusCode = result.status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Data-Source', String(result.body?.source ?? 'unknown'));
      res.end(JSON.stringify(result.body));
    } catch {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Erro ao comunicar com a API.' }));
    }
  };

  // Registra antes dos middlewares internos do Vite: senão o fallback de SPA responde
  // GET /api/proxy-media com o index.html.
  const attach = (server: Pick<ViteDevServer, 'middlewares'>) => {
    server.middlewares.use(handle);
  };

  return {
    name: 'instagram-dev-proxy',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), instagramDevProxy(configFromEnv(env))],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
  };
});
