/**
 * Serviço do frontend: fala só com as rotas do nosso servidor (/api/instagram/*).
 *  - posts:  perfil e publicações (Instagram direto ou API da Meta, grátis)
 *  - search: sugestões de perfil
 *  - link:   post/reel/story pelo link (RapidAPI "Download All in One!")
 */

import { API_BASE_URL, API_ENDPOINTS, getApiHeaders, POSTS_PAGE_SIZE, SEARCH_MIN_CHARS, USE_PROXY } from '@/config/constants';
import type { InstagramPost, InstagramPostParams, MediaItem, InstagramPostsResponse, InstagramUserSuggestion, MediaByLinkParams } from '@/types/instagram.types';

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

function getVideoUrl(item: Record<string, unknown>): string | undefined {
  if (typeof item.video_url === 'string' && item.video_url) return item.video_url;
  const versions = item.video_versions as { url?: string }[] | undefined;
  if (Array.isArray(versions) && versions[0]?.url) return versions[0].url;
  return undefined;
}

function toMediaItem(item: Record<string, unknown>): MediaItem | null {
  const imageUrl = getFirstImageUrl(item);
  const videoUrl = getVideoUrl(item);
  if (!imageUrl && !videoUrl) return null;
  return { imageUrl, ...(videoUrl ? { videoUrl } : {}) };
}

/** Lista todas as mídias do post: carrossel (formato v1 ou GraphQL) ou a mídia única. */
function getMediaItems(item: Record<string, unknown>): MediaItem[] {
  const carousel = item.carousel_media as Record<string, unknown>[] | undefined;
  const sidecar = (item.edge_sidecar_to_children as { edges?: { node?: Record<string, unknown> }[] } | undefined)?.edges
    ?.map((edge) => edge?.node)
    .filter((node): node is Record<string, unknown> => Boolean(node));
  const children = Array.isArray(carousel) && carousel.length ? carousel : sidecar?.length ? sidecar : null;
  const items = children ? children.map(toMediaItem) : [toMediaItem(item)];
  return items.filter((media): media is MediaItem => media !== null);
}

function normalizePost(item: Record<string, unknown>): InstagramPost | null {
  const carousel = item.carousel_media as Record<string, unknown>[] | undefined;
  const firstMedia = Array.isArray(carousel) ? carousel[0] : undefined;
  const id = String(
    item.id ?? item.pk ?? item.code ?? (firstMedia as Record<string, unknown> | undefined)?.id ?? (firstMedia as Record<string, unknown> | undefined)?.pk ?? ''
  );
  const mediaUrl = getFirstImageUrl(item);
  if (!id && !mediaUrl) return null;

  const code =
    typeof item.code === 'string'
      ? item.code
      : typeof item.shortcode === 'string'
        ? item.shortcode
        : (firstMedia as Record<string, unknown> | undefined)?.code;
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

  const media = getMediaItems(item);
  if (!media.length && mediaUrl) media.push({ imageUrl: mediaUrl, ...(videoUrl ? { videoUrl } : {}) });

  return {
    id: id || `post-${mediaUrl.slice(-12)}`,
    code: typeof code === 'string' ? code : undefined,
    mediaUrl: mediaUrl || permalink,
    videoUrl: media[0]?.videoUrl ?? videoUrl,
    media,
    caption: caption || 'Sem legenda',
    permalink,
    pinned: isPinnedPost(item),
    isCarousel: isCarouselPost(item, carousel),
  };
}

function isPinnedPost(item: Record<string, unknown>): boolean {
  if (item.is_pinned === true || item.pinned === true) return true;
  const collections = [
    item.timeline_pinned_user_ids,
    item.timeline_pin_user_ids,
    item.clips_tab_pinned_user_ids,
    item.pinned_for_users,
    item.pinned_user_ids,
  ];
  return collections.some((value) => Array.isArray(value) && value.length > 0);
}

function isCarouselPost(item: Record<string, unknown>, carousel?: Record<string, unknown>[]): boolean {
  if (Array.isArray(carousel) && carousel.length > 1) return true;
  if (item.__typename === 'GraphSidecar') return true;
  const count = item.carousel_media_count;
  if (typeof count === 'number' && count > 1) return true;
  return item.product_type === 'carousel_container' || item.media_type === 8;
}

function normalizeUser(item: unknown): InstagramUserSuggestion | null {
  if (!item || typeof item !== 'object') return null;
  const rec = item as Record<string, unknown>;
  const user = (rec.user && typeof rec.user === 'object' ? rec.user : rec) as Record<string, unknown>;
  const username = String(user.username ?? user.user_name ?? '').replace(/^@/, '').trim();
  if (!username) return null;
  return {
    id: String(user.pk ?? user.id ?? user.pk_id ?? username),
    username,
    fullName: String(user.full_name ?? user.fullName ?? ''),
    profilePicUrl: String(
      user.profile_pic_url ?? user.profile_pic_url_hd ?? user.profilePicUrl ?? user.profile_pic ?? ''
    ),
    isVerified: Boolean(user.is_verified ?? user.isVerified ?? user.is_verified_user),
    isPrivate: Boolean(user.is_private ?? user.isPrivate),
    postCount: toCount(
      user.media_count ?? (user.edge_owner_to_timeline_media as { count?: unknown } | undefined)?.count
    ),
  };
}

function toCount(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
}

function extractUsers(data: unknown): InstagramUserSuggestion[] {
  if (!data) return [];
  const seen = new Set<string>();
  const collected: InstagramUserSuggestion[] = [];

  const pushFrom = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      const user = normalizeUser(item);
      if (!user) continue;
      const key = user.username.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(user);
    }
  };

  if (Array.isArray(data)) {
    pushFrom(data);
    return collected;
  }
  if (typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  const nested = obj.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : undefined;

  pushFrom(obj.users);
  pushFrom(obj.user);
  pushFrom(obj.accounts);
  pushFrom(nested?.users);
  pushFrom(nested?.user);

  if (!collected.length) {
    const walk = (value: unknown, depth: number) => {
      if (depth <= 0 || collected.length) return;
      if (Array.isArray(value) && value[0] && typeof value[0] === 'object') {
        const first = value[0] as Record<string, unknown>;
        if ('username' in first || (first.user && typeof first.user === 'object')) {
          pushFrom(value);
        }
        return;
      }
      if (value && typeof value === 'object') {
        for (const child of Object.values(value as Record<string, unknown>)) {
          walk(child, depth - 1);
          if (collected.length) return;
        }
      }
    };
    walk(obj, 5);
  }

  return collected;
}

function extractProfile(data: unknown): InstagramUserSuggestion | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const fromRoot = normalizeUser(obj.user ?? obj.profile ?? obj.owner);
  if (fromRoot) return fromRoot;
  const nested = obj.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : undefined;
  const fromData = nested ? normalizeUser(nested.user ?? nested.profile) : null;
  if (fromData) return fromData;

  const feed = Array.isArray(obj.posts) ? obj.posts : Array.isArray(obj.items) ? obj.items : nested && Array.isArray(nested.posts) ? nested.posts : null;
  if (feed?.length) {
    const first = asPostRecord(feed[0]);
    if (first?.user) return normalizeUser(first.user);
  }
  return null;
}

export function rankUserSuggestions(
  query: string,
  users: InstagramUserSuggestion[]
): InstagramUserSuggestion[] {
  const q = query.trim().replace(/^@/, '').toLowerCase();
  if (!q) return users;

  const score = (user: InstagramUserSuggestion): number => {
    const username = user.username.toLowerCase();
    const name = user.fullName.toLowerCase();
    if (username === q) return 0;
    if (username.startsWith(q)) return 1;
    if (name.startsWith(q)) return 2;
    if (username.includes(q)) return 3;
    if (name.includes(q)) return 4;
    return 5;
  };

  return [...users].sort((a, b) => {
    const diff = score(a) - score(b);
    if (diff !== 0) return diff;
    return a.username.localeCompare(b.username);
  });
}

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

/** Extrai o token da próxima página ("Ver mais"). */
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

const POSTS_CACHE_PREFIX = 'ig-posts-cache-v4:';
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
  // O servidor já explica o que houve em cada fonte (Instagram, Meta, RapidAPI).
  if (payload && typeof payload === 'object' && (payload as Record<string, unknown>).sourcesFailed && raw) {
    return new Error(raw);
  }
  if (isRateLimitPayload(status, payload)) {
    return new Error(
      'Limite de requisições atingido (HTTP 429). Espere alguns minutos antes de tentar de novo: insistir pode prolongar o bloqueio.'
    );
  }
  if (status === 404) {
    return new Error(
      'Perfil não encontrado (HTTP 404). Confira o @ digitado.'
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
  const profile = extractProfile(data);
  const result = { posts, nextMaxId, profile };
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

const SEARCH_CACHE_PREFIX = 'ig-search-cache-v1:';
const SEARCH_CACHE_TTL_MS = 30 * 60 * 1000;
/** Mínimo de resultados de um prefixo já buscado para dispensar uma nova requisição. */
const SEARCH_PREFIX_MIN_MATCHES = 3;
const searchInflight = new Map<string, Promise<InstagramUserSuggestion[]>>();

function readSearchCache(cacheKey: string): InstagramUserSuggestion[] | null {
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; users: InstagramUserSuggestion[] };
    if (parsed?.users && Date.now() - parsed.savedAt < SEARCH_CACHE_TTL_MS) {
      return parsed.users;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Reaproveita a busca de um prefixo ("neym" serve para "neymar") quando ainda há resultados suficientes. */
function searchFromCachedPrefix(search: string): InstagramUserSuggestion[] | null {
  const q = search.toLowerCase();
  for (let len = q.length - 1; len >= SEARCH_MIN_CHARS; len--) {
    const users = readSearchCache(`${SEARCH_CACHE_PREFIX}${q.slice(0, len)}`);
    if (!users) continue;
    const matches = users.filter(
      (user) => user.username.toLowerCase().includes(q) || user.fullName.toLowerCase().includes(q)
    );
    return matches.length >= SEARCH_PREFIX_MIN_MATCHES ? matches : null;
  }
  return null;
}

export async function searchInstagramUsers(query: string): Promise<InstagramUserSuggestion[]> {
  const search = query.trim().replace(/^@/, '');
  if (!search) return [];

  const cacheKey = `${SEARCH_CACHE_PREFIX}${search.toLowerCase()}`;
  const cached = readSearchCache(cacheKey) ?? searchFromCachedPrefix(search);
  if (cached) return cached;

  const existing = searchInflight.get(cacheKey);
  if (existing) return existing;

  const request = (async () => {
    const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.INSTAGRAM_SEARCH}`, {
      method: 'POST',
      headers: getApiHeaders(),
      body: JSON.stringify({ search }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw buildApiError(response.status, payload, 'buscar usuários');
    }
    const data = await response.json();
    const users = extractUsers(data);
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), users }));
    } catch {
      // ignore
    }
    return users;
  })().finally(() => {
    searchInflight.delete(cacheKey);
  });

  searchInflight.set(cacheKey, request);
  return request;
}

/** Link de post, reel, tv ou story do Instagram (não de perfil). */
export function isInstagramMediaLink(value: string): boolean {
  try {
    const u = new URL(value.trim());
    const host = u.hostname.toLowerCase();
    const isInstagram = host === 'instagram.com' || host.endsWith('.instagram.com') || host === 'instagr.am';
    return isInstagram && /\/(p|reel|reels|tv|stories)\//i.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * Busca um post, reel ou story pelo link, usando a API "Download All in One!" (RapidAPI).
 * Consome cota (2 créditos por post, 5 por story; falhas não são cobradas).
 */
export async function fetchMediaByLink(params: MediaByLinkParams): Promise<InstagramPost> {
  const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.MEDIA_BY_LINK}`, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify({ url: params.url.trim() }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payloadMessage(data) || `Erro ao buscar o link (HTTP ${response.status}).`);
  }
  const item = Array.isArray((data as { items?: unknown[] }).items) ? (data as { items: unknown[] }).items[0] : null;
  const post = item && typeof item === 'object' ? normalizePost(item as Record<string, unknown>) : null;
  if (!post) throw new Error('A API não retornou mídia para este link.');
  return post;
}
