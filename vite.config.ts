import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

const RAPIDAPI_HOST = 'instagram-scraper-stable-api.p.rapidapi.com';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function instagramDevProxy(apiKey: string): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? '';
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

    if (!apiKey) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Configure VITE_RAPIDAPI_KEY ou RAPIDAPI_KEY no arquivo .env' }));
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

      const headers: Record<string, string> = {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': apiKey,
      };

      let target = '';
      let init: RequestInit;

      if (url.startsWith('/api/instagram/posts')) {
        target = `https://${RAPIDAPI_HOST}/get_ig_user_posts.php`;
        const params = new URLSearchParams();
        params.set('username_or_url', String(body.username || ''));
        params.set('amount', String(body.amount || 12));
        params.set('pagination_token', String(body.maxId || body.pagination_token || ''));
        init = {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        };
      } else if (url.startsWith('/api/instagram/reels')) {
        target = `https://${RAPIDAPI_HOST}/get_ig_user_reels.php`;
        const params = new URLSearchParams();
        params.set('username_or_url', String(body.username || ''));
        params.set('pagination_token', String(body.maxId || body.pagination_token || ''));
        init = {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        };
      } else if (url.startsWith('/api/instagram/mediaByShortcode')) {
        const value = String(body.shortcode || '').trim();
        const mediaUrl = /^https?:\/\//i.test(value)
          ? value
          : /reel/i.test(value)
            ? `https://www.instagram.com/reel/${value.replace(/^\/?(p|reel)\//i, '').replace(/\/$/, '')}/`
            : `https://www.instagram.com/p/${value.replace(/^\/?(p|reel)\//i, '').replace(/\/$/, '')}/`;
        const type = /\/reel\//i.test(mediaUrl) ? 'reel' : 'post';
        const dest = new URL(`https://${RAPIDAPI_HOST}/get_media_data.php`);
        dest.searchParams.set('reel_post_code_or_url', mediaUrl);
        dest.searchParams.set('type', type);
        target = dest.toString();
        init = { method: 'GET', headers };
      } else {
        next();
        return;
      }

      const response = await fetch(target, init);
      const data = await response.text();
      res.statusCode = response.status;
      res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
      res.end(data);
    } catch {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Erro ao comunicar com a API.' }));
    }
  };

  const attach = (server: ViteDevServer) => {
    return () => {
      server.middlewares.use(handle);
    };
  };

  return {
    name: 'instagram-dev-proxy',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.RAPIDAPI_KEY || env.VITE_RAPIDAPI_KEY || '';

  return {
    plugins: [react(), instagramDevProxy(apiKey)],
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
