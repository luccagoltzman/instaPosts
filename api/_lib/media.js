/**
 * Busca mídia do CDN do Instagram pelo servidor e repassa em streaming.
 * - Evita o bloqueio Cross-Origin-Resource-Policy e permite baixar o arquivo (blob) no navegador.
 * - Streaming: a Vercel limita respostas comuns a 4,5 MB, mas não respostas em streaming,
 *   então vídeos grandes passam sem carregar o arquivo inteiro na memória.
 * - Repassa o cabeçalho Range para o player conseguir avançar o vídeo.
 * Usado pela função da Vercel (/api/proxy-media) e pelo proxy do Vite em dev.
 */
import { Readable } from 'node:stream';

const MEDIA_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];

export function isAllowedMediaUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return (
      host === 'instagram.com' ||
      host.endsWith('.instagram.com') ||
      host.endsWith('.cdninstagram.com') ||
      host.endsWith('.fbcdn.net')
    );
  } catch {
    return false;
  }
}

function sendJsonError(res, status, message) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: message }));
}

/**
 * Responde em `res` (http.ServerResponse do Node) com a mídia de `rawUrl`.
 * `range` é o cabeçalho Range da requisição original, se houver.
 */
export async function streamMedia(rawUrl, range, res) {
  if (!rawUrl || typeof rawUrl !== 'string') return sendJsonError(res, 400, 'Parâmetro url obrigatório');
  if (!isAllowedMediaUrl(rawUrl)) return sendJsonError(res, 403, 'URL não permitida');

  let upstream;
  try {
    upstream = await fetch(rawUrl, {
      headers: { 'User-Agent': MEDIA_UA, ...(range ? { Range: String(range) } : {}) },
    });
  } catch {
    return sendJsonError(res, 502, 'Erro ao buscar mídia');
  }
  if (!upstream.ok || !upstream.body) {
    return sendJsonError(res, upstream.status || 502, 'Falha ao buscar mídia');
  }

  res.statusCode = upstream.status; // 200 ou 206 (parcial)
  for (const name of PASS_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  res.setHeader('Cache-Control', 'public, max-age=86400');

  await new Promise((resolve) => {
    const body = Readable.fromWeb(upstream.body);
    body.on('error', () => {
      res.destroy();
      resolve();
    });
    res.on('close', () => {
      body.destroy();
      resolve();
    });
    body.pipe(res);
  });
}
