/**
 * Proxy para mídia do Instagram (imagens/vídeos), em streaming.
 * Só aceita URLs de domínios do Instagram.
 */
import { streamMedia } from './_lib/media.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  await streamMedia(req.query.url, req.headers.range, res);
}
