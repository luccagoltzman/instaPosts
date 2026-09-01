/**
 * Constantes da aplicação.
 * Sempre usa o proxy (/api/instagram/*) para não expor a chave da RapidAPI.
 * Em dev o Vite encaminha; em produção as funções em /api/instagram/* na Vercel.
 */

export const USE_PROXY = true;

export const API_BASE_URL = '';

export const POSTS_PAGE_SIZE = 12;

export const SEARCH_MIN_CHARS = 2;

export const SEARCH_DEBOUNCE_MS = 500;

export const API_ENDPOINTS = {
  INSTAGRAM_POSTS: '/api/instagram/posts',
  INSTAGRAM_REELS: '/api/instagram/reels',
  INSTAGRAM_SEARCH: '/api/instagram/search',
  MEDIA_BY_SHORTCODE: '/api/instagram/mediaByShortcode',
  NEWS: '/api/news',
} as const;

export const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todas' },
];

/** Mantido para o serviço legado de notícias (não usa a chave no cliente). */
export const RAPIDAPI_HEADERS = {
  'Content-Type': 'application/json',
  'x-rapidapi-host': '',
  'x-rapidapi-key': '',
} as const;

export function getApiHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}
