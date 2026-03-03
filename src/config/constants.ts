/**
 * Constantes da aplicação.
 * Em produção usa o proxy (/api/instagram/*) para não expor a chave da RapidAPI.
 * Em desenvolvimento pode usar a API direta com VITE_RAPIDAPI_KEY no .env.
 */

const RAPIDAPI_HOST =
  import.meta.env.VITE_RAPIDAPI_HOST ?? 'instagram120.p.rapidapi.com';

/** Em produção: usa proxy (mesma origem). Em dev: pode usar RapidAPI direto. */
export const USE_PROXY = import.meta.env.PROD;

export const API_BASE_URL = USE_PROXY ? '' : `https://${RAPIDAPI_HOST}`;

export const API_ENDPOINTS = {
  INSTAGRAM_POSTS: '/api/instagram/posts',
  INSTAGRAM_REELS: '/api/instagram/reels',
  MEDIA_BY_SHORTCODE: '/api/instagram/mediaByShortcode',
} as const;

/** Headers para chamada direta à RapidAPI (só em dev quando não usa proxy). */
export const RAPIDAPI_HEADERS = {
  'Content-Type': 'application/json',
  'x-rapidapi-host': RAPIDAPI_HOST,
  'x-rapidapi-key': import.meta.env.VITE_RAPIDAPI_KEY ?? '',
} as const;

/** Headers para a requisição (em proxy não envia a chave; no servidor ela é lida de env). */
export function getApiHeaders(): Record<string, string> {
  if (USE_PROXY) {
    return { 'Content-Type': 'application/json' };
  }
  return { ...RAPIDAPI_HEADERS } as Record<string, string>;
}
