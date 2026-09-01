/**
 * Serviço de comunicação com a Instagram Scraper Stable API (RapidAPI).
 * POST form-urlencoded em /get_ig_user_posts.php
 */

import { API_BASE_URL, API_ENDPOINTS, getApiHeaders, POSTS_PAGE_SIZE, USE_PROXY } from '@/config/constants';
import type { InstagramPost, InstagramPostParams, InstagramPostsResponse, MediaByShortcodeParams } from '@/types/instagram.types';

function asPostRecord(item: unknown): Record<string, unknown> | null {
  if (!item || typeof item !== 'object') return null;
  const rec = item as Record<string, unknown>;
  if (rec.node && typeof rec.node === 'object') {
    return rec.node as Record<string, unknown>;
  }
  return rec;
}

function getFirstImageUrl(item: Record<string, unknown>): string {
  if (typeof item.display_url === 'string') return item.display_url;
  if (typeof item.display_uri === 'string') return item.display_uri;
  const iv2 = item.image_versions2 as { candidates?: { url?: string }[] } | undefined;
  if (iv2 && Array.isArray(iv2.candidates) && iv2.candidates[0]?.url) return iv2.candidates[0].url;
  if (typeof item.thumbnail_src === 'string') return item.thumbnail_src;
  const dr = item.display_resources as { src?: string }[] | undefined;
  if (Array.isArray(dr) && dr[0]?.src) return dr[0].src;
  const carousel = item.carousel_media as Record<string, unknown>[] | undefined;
  if (Array.isArray(carousel) && carousel[0]) return getFirstImageUrl(carousel[0] as Record<string, unknown>);
  return '';
}

function normalizePost(item: Record<string, unknown>): InstagramPost | null {
  const carousel = item.carousel_media as Record<string, unknown>[] | undefined;
  const firstMedia = Array.isArray(carousel) ? carousel[0] : undefined;
  const id = String(
    item.id ?? item.pk ?? item.code ?? (firstMedia as Record<string, unknown> | undefined)?.id ?? (firstMedia as Record<string, unknown> | undefined)?.pk ?? ''
  );
  const mediaUrl = getFirstImageUrl(item);
  if (!id && !mediaUrl) return null;

  const code = typeof item.code === 'string' ? item.code : (firstMedia as Record<string, unknown> | undefined)?.code;
  const permalink =
    typeof item.permalink === 'string'
      ? item.permalink
      : typeof code === 'string'
        ? `https://www.instagram.com/p/${code}/`
        : id
          ? `https://www.instagram.com/p/${id}/`
          : 'https://www.instagram.com/';

  let videoUrl: string | undefined;
  if (typeof item.video_url === 'string') videoUrl = item.video_url;
  else if (item.video_versions && Array.isArray(item.video_versions)) {
    const v = (item.video_versions as { url?: string }[])[0];
    if (v?.url) videoUrl = v.url;
  }
  if (!videoUrl && firstMedia && ((firstMedia as Record<string, unknown>).media_type === 2 || (firstMedia as Record<string, unknown>).video_versions)) {
    const vv = (firstMedia as Record<string, unknown>).video_versions as { url?: string }[] | undefined;
    if (Array.isArray(vv) && vv[0]?.url) videoUrl = vv[0].url;
  }

  let caption = '';
  if (typeof item.caption === 'string') caption = item.caption;
  else if (item.caption && typeof item.caption === 'object' && typeof (item.caption as { text?: string }).text === 'string') {
    caption = (item.caption as { text: string }).text;
  } else if (item.edge_media_to_caption && typeof item.edge_media_to_caption === 'object') {
    const edges = (item.edge_media_to_caption as { edges?: { node?: { text?: string } }[] }).edges;
    caption = edges?.[0]?.node?.text ?? '';
  }

  return {
    id: id || `post-${mediaUrl.slice(-12)}`,
    mediaUrl: mediaUrl || permalink,
    videoUrl,
    caption: caption || 'Sem legenda',
    permalink,
  };
}

/** Encontra o primeiro array de edges { node } em qualquer nível do objeto (GraphQL-style). */
function findEdgesArray(value: unknown): { node: Record<string, unknown> }[] | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === 'object' && 'node' in first && first.node) {
      return value as { node: Record<string, unknown> }[];
    }
    return null;
  }
  const o = value as Record<string, unknown>;
  if (Array.isArray(o.edges)) {
    const first = o.edges[0];
    if (first && typeof first === 'object' && 'node' in first) {
      return o.edges as { node: Record<string, unknown> }[];
    }
  }
  for (const key of Object.keys(o)) {
    const found = findEdgesArray(o[key]);
    if (found?.length) return found;
  }
  return null;
}

/** Encontra o primeiro array de posts (objetos com pk/code/image_versions2/carousel_media) em qualquer nível. */
function findPostsArray(value: unknown): unknown[] | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === 'object') {
      const f = first as Record<string, unknown>;
      if ('pk' in f || 'code' in f || 'image_versions2' in f || 'carousel_media' in f) {
        return value;
      }
    }
    return null;
  }
  const o = value as Record<string, unknown>;
  for (const key of Object.keys(o)) {
    const found = findPostsArray(o[key]);
    if (found?.length) return found;
  }
  return null;
}

const PAGINATION_KEYS = [
  'pagination_token',
  'next_max_id',
  'nextMaxId',
  'max_id',
  'end_cursor',
  'cursor',
  'next_cursor',
  'nextCursor',
  'next_page_id',
  'nextPageId',
] as const;

/** Procura recursivamente por um valor de cursor em qualquer nível do objeto (até 10 níveis). */
function findCursorInObject(obj: Record<string, unknown>, depth: number): string | null {
  if (depth <= 0) return null;
  for (const key of PAGINATION_KEYS) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim().length > 0) return val;
  }
  const pagination = obj.pagination as Record<string, unknown> | undefined;
  if (pagination && typeof pagination === 'object') {
    for (const key of PAGINATION_KEYS) {
      const val = (pagination as Record<string, unknown>)[key];
      if (typeof val === 'string' && val.trim().length > 0) return val;
    }
    const nextUrl = (pagination as Record<string, unknown>).next_url as string | undefined;
    if (typeof nextUrl === 'string') {
      const match = nextUrl.match(/[?&]max_id=([^&]+)/);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
  }
  for (const key of Object.keys(obj)) {
    const child = obj[key];
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      const found = findCursorInObject(child as Record<string, unknown>, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

/** Extrai cursor da próxima página (pagination_token da Instagram Scraper Stable API). */
function extractNextMaxId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  const moreAvailable = obj.more_available ?? obj.has_more ?? obj.has_next_page;
  if (moreAvailable === false) return null;

  const token = obj.pagination_token ?? obj.next_max_id ?? obj.nextMaxId ?? obj.cursor;
  if (typeof token === 'string' && token.trim()) return token;

  const dataObj = obj.data as Record<string, unknown> | undefined;
  const user = (dataObj?.user ?? obj.user) as Record<string, unknown> | undefined;
  const timeline = user?.edge_owner_to_timeline_media ?? user?.edge_media_collections;
  if (timeline && typeof timeline === 'object') {
    const t = timeline as Record<string, unknown>;
    const pageInfo = t.page_info as { end_cursor?: string; has_next_page?: boolean } | undefined;
    if (pageInfo?.has_next_page === false) return null;
    if (pageInfo?.end_cursor) return pageInfo.end_cursor;
  }

  return findCursorInObject(obj, 10);
}

function extractPosts(data: unknown): InstagramPost[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    return (data as Record<string, unknown>[])
      .map(normalizePost)
      .filter((p): p is InstagramPost => p !== null);
  }
  if (typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;

  let items: unknown[] | undefined =
    (Array.isArray(obj.items) ? obj.items : undefined) ??
    (Array.isArray(obj.posts) ? obj.posts : undefined) ??
    (Array.isArray(obj.medias) ? obj.medias : undefined) ??
    (Array.isArray(obj.media) ? obj.media : undefined);

  if (!items?.length && obj.posts && typeof obj.posts === 'object' && !Array.isArray(obj.posts)) {
    const nested = (obj.posts as Record<string, unknown>).items;
    if (Array.isArray(nested)) items = nested;
  }

  if (!items?.length && obj.data !== undefined) {
    const dataVal = obj.data;
    if (Array.isArray(dataVal)) items = dataVal;
    else if (dataVal && typeof dataVal === 'object') {
      const d = dataVal as Record<string, unknown>;
      items = (d.items as unknown[] | undefined) ?? (Array.isArray(d.user) ? d.user : undefined);
    }
  }
  if (!items?.length && obj.body !== undefined) {
    const body = obj.body;
    if (Array.isArray(body)) items = body;
    else if (body && typeof body === 'object' && 'items' in body) {
      items = (body as Record<string, unknown>).items as unknown[] | undefined;
    }
  }

  if (Array.isArray(items) && items.length > 0) {
    const posts = items
      .map((it) => {
        const rec = asPostRecord(it);
        return rec ? normalizePost(rec) : null;
      })
      .filter((p): p is InstagramPost => p !== null);
    if (posts.length) return posts;
  }

  // Formato GraphQL: data.user.edge_owner_to_timeline_media.edges[].node (ou em qualquer nível)
  const dataObj = obj.data as Record<string, unknown> | undefined;
  const user = (dataObj?.user ?? obj.user) as Record<string, unknown> | undefined;
  const timeline = user?.edge_owner_to_timeline_media ?? user?.edge_media_collections;
  let edges = (timeline as { edges?: unknown[] } | undefined)?.edges;
  if (!Array.isArray(edges) || !edges.length) {
    const found = findEdgesArray(obj);
    edges = found ?? undefined;
  }
  if (Array.isArray(edges) && edges.length > 0) {
    const posts = edges
      .map((e) => (e as { node?: Record<string, unknown> })?.node && normalizePost((e as { node: Record<string, unknown> }).node))
      .filter((p): p is InstagramPost => p !== null);
    if (posts.length) return posts;
  }

  // Busca recursiva por array de posts (pk/code/image_versions2)
  const postsArray = findPostsArray(obj);
  if (postsArray?.length) {
    return postsArray
      .map((it) => {
        const rec = asPostRecord(it);
        return rec ? normalizePost(rec) : null;
      })
      .filter((p): p is InstagramPost => p !== null);
  }

  if (obj.id ?? obj.pk ?? obj.carousel_media ?? obj.code) {
    const single = normalizePost(obj);
    return single ? [single] : [];
  }

  return [];
}

const POSTS_CACHE_PREFIX = 'ig-posts-cache-v2:';
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_STALE_MS = 24 * 60 * 60 * 1000;

type CachedPosts = {
  savedAt: number;
  data: InstagramPostsResponse;
};

const inflightPosts = new Map<string, Promise<InstagramPostsResponse>>();

function postsCacheKey(username: string, maxId?: string): string {
  return `${POSTS_CACHE_PREFIX}${username.toLowerCase()}:${maxId ?? ''}`;
}

function readPostsCache(key: string, allowStale = false): InstagramPostsResponse | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPosts;
    if (!parsed?.data) return null;
    const age = Date.now() - parsed.savedAt;
    if (age > CACHE_MAX_STALE_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    if (age < CACHE_TTL_MS || allowStale) return parsed.data;
    return null;
  } catch {
    return null;
  }
}

function writePostsCache(key: string, data: InstagramPostsResponse): void {
  try {
    const payload: CachedPosts = { savedAt: Date.now(), data };
    sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // sessionStorage indisponível (modo privado / cota)
  }
}

function payloadMessage(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  const obj = payload as Record<string, unknown>;
  if (typeof obj.message === 'string') return obj.message;
  if (typeof obj.error === 'string') return obj.error;
  return '';
}

function isRateLimitPayload(status: number, payload: unknown): boolean {
  const msg = payloadMessage(payload);
  return status === 429 || /too many requests/i.test(msg);
}

export function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return /limite de requisições|too many requests|HTTP 429/i.test(msg);
}

function buildApiError(status: number, payload: unknown, action: string): Error {
  const raw = payloadMessage(payload);
  if (isRateLimitPayload(status, payload)) {
    return new Error(
      'A API do Instagram atingiu o limite de requisições da RapidAPI (HTTP 429). Espere alguns minutos e confira a cota no dashboard da RapidAPI. Tentar de novo agora consome mais cota e pode prolongar o bloqueio.'
    );
  }
  if (status === 404) {
    return new Error(
      'A RapidAPI não encontrou o endpoint da Instagram Scraper Stable API (HTTP 404). Verifique o host e a inscrição da API.'
    );
  }
  return new Error(raw || `Erro ao ${action}: ${status}`);
}

function toUsernameOrUrl(username: string): string {
  const trimmed = username.trim().replace(/^@/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://www.instagram.com/${trimmed}/`;
}

function buildPostsRequestBody(username: string, paginationToken?: string): string {
  const profile = toUsernameOrUrl(username);
  const token = paginationToken ?? '';
  if (USE_PROXY) {
    return JSON.stringify({
      username: profile,
      amount: POSTS_PAGE_SIZE,
      maxId: token,
      pagination_token: token,
    });
  }
  const params = new URLSearchParams();
  params.set('username_or_url', profile);
  params.set('amount', String(POSTS_PAGE_SIZE));
  params.set('pagination_token', token);
  return params.toString();
}

async function requestInstagramPosts(
  username: string,
  maxId: string | undefined,
  cacheKey: string
): Promise<InstagramPostsResponse> {
  const url = `${API_BASE_URL}${API_ENDPOINTS.INSTAGRAM_POSTS}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: getApiHeaders(),
    body: buildPostsRequestBody(username, maxId),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const stale = readPostsCache(cacheKey, true);
    if (stale && (isRateLimitPayload(response.status, payload) || response.status === 404)) {
      return stale;
    }
    throw buildApiError(response.status, payload, 'carregar posts');
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('Resposta da API não é JSON. Verifique a URL e a chave.');
  }

  const data = await response.json();
  const posts = extractPosts(data);
  const nextMaxId = extractNextMaxId(data);
  const result = { posts, nextMaxId };
  writePostsCache(cacheKey, result);
  return result;
}

export async function fetchInstagramPosts(
  params: InstagramPostParams
): Promise<InstagramPostsResponse> {
  if (!USE_PROXY && !getApiHeaders()['x-rapidapi-key']) {
    throw new Error('Configure VITE_RAPIDAPI_KEY no arquivo .env');
  }

  const username = params.username?.trim();
  if (!username) {
    return { posts: [], nextMaxId: null };
  }

  const cacheKey = postsCacheKey(username, params.maxId);
  const cached = readPostsCache(cacheKey);
  if (cached) return cached;

  const existing = inflightPosts.get(cacheKey);
  if (existing) return existing;

  const request = requestInstagramPosts(username, params.maxId, cacheKey).finally(() => {
    inflightPosts.delete(cacheKey);
  });
  inflightPosts.set(cacheKey, request);
  return request;
}

/**
 * Busca um único post/mídia pelo shortcode (ex.: DPRcWdvgI4P).
 * Em produção: POST /api/instagram/mediaByShortcode.
 * Em desenvolvimento: GET /get_media_data.php.
 */
export async function fetchMediaByShortcode(
  params: MediaByShortcodeParams
): Promise<InstagramPost | null> {
  if (!USE_PROXY && !getApiHeaders()['x-rapidapi-key']) {
    throw new Error('Configure VITE_RAPIDAPI_KEY no arquivo .env');
  }

  const shortcode = params.shortcode?.trim();
  if (!shortcode) return null;

  const isUrl = /^https?:\/\//i.test(shortcode);
  const isReel = /reel/i.test(shortcode);
  const code = shortcode.replace(/^\/?(p|reel)\//i, '').replace(/\/$/, '');
  const mediaUrl = isUrl
    ? shortcode
    : isReel
      ? `https://www.instagram.com/reel/${code}/`
      : `https://www.instagram.com/p/${code}/`;
  const type = /\/reel\//i.test(mediaUrl) ? 'reel' : 'post';

  let response: Response;
  if (USE_PROXY) {
    response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.MEDIA_BY_SHORTCODE}`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ shortcode: mediaUrl }),
    });
  } else {
    const url = new URL(`${API_BASE_URL}${API_ENDPOINTS.MEDIA_BY_SHORTCODE}`);
    url.searchParams.set('reel_post_code_or_url', mediaUrl);
    url.searchParams.set('type', type);
    const headers = getApiHeaders();
    delete headers['Content-Type'];
    response = await fetch(url.toString(), {
      method: 'GET',
      headers,
    });
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw buildApiError(response.status, payload, 'carregar mídia');
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('Resposta da API não é JSON.');
  }

  const data = await response.json();
  const obj = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const item = (obj.data ?? obj.media ?? obj.item ?? obj) as Record<string, unknown>;
  return normalizePost(item);
}
