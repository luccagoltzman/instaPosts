/**
 * Serviço de comunicação com a API de posts do Instagram (RapidAPI - Instagram120).
 */

import { API_BASE_URL, API_ENDPOINTS, RAPIDAPI_HEADERS } from '@/config/constants';
import type { InstagramPost, InstagramPostParams, InstagramPostsResponse, MediaByShortcodeParams } from '@/types/instagram.types';

function getFirstImageUrl(item: Record<string, unknown>): string {
  if (typeof item.display_url === 'string') return item.display_url;
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

/** Extrai cursor da próxima página (page_info.end_cursor ou último edge.cursor). */
function extractNextMaxId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const dataObj = obj.data as Record<string, unknown> | undefined;
  const user = (dataObj?.user ?? obj.user) as Record<string, unknown> | undefined;
  const timeline = user?.edge_owner_to_timeline_media ?? user?.edge_media_collections;
  if (timeline && typeof timeline === 'object') {
    const t = timeline as Record<string, unknown>;
    const pageInfo = t.page_info as { end_cursor?: string; has_next_page?: boolean } | undefined;
    if (pageInfo?.end_cursor) return pageInfo.end_cursor;
    const edges = t.edges as { cursor?: string }[] | undefined;
    if (Array.isArray(edges) && edges.length > 0) {
      const last = edges[edges.length - 1];
      if (last?.cursor) return last.cursor;
    }
  }
  const next = obj.next_max_id ?? obj.nextMaxId ?? obj.cursor;
  if (typeof next === 'string' && next) return next;
  return null;
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
    (obj.items as unknown[] | undefined) ??
    (obj.posts as unknown[] | undefined) ??
    (obj.media as unknown[] | undefined);

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
      .map((it) => normalizePost(it as Record<string, unknown>))
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
      .map((it) => normalizePost(it as Record<string, unknown>))
      .filter((p): p is InstagramPost => p !== null);
  }

  if (obj.id ?? obj.pk ?? obj.carousel_media ?? obj.code) {
    const single = normalizePost(obj);
    return single ? [single] : [];
  }

  return [];
}

export async function fetchInstagramPosts(
  params: InstagramPostParams
): Promise<InstagramPostsResponse> {
  if (!RAPIDAPI_HEADERS['x-rapidapi-key']) {
    throw new Error('Configure VITE_RAPIDAPI_KEY no arquivo .env');
  }

  const username = params.username?.trim();
  if (!username) {
    return { posts: [], nextMaxId: null };
  }

  const url = `${API_BASE_URL}${API_ENDPOINTS.INSTAGRAM_POSTS}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: RAPIDAPI_HEADERS as Record<string, string>,
    body: JSON.stringify({
      username,
      maxId: params.maxId ?? '',
    }),
  });

  if (!response.ok) {
    throw new Error(`Erro ao carregar posts: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('Resposta da API não é JSON. Verifique a URL e a chave.');
  }

  const data = await response.json();
  const posts = extractPosts(data);
  const nextMaxId = extractNextMaxId(data);
  return { posts, nextMaxId };
}

/**
 * Busca um único post/mídia pelo shortcode (ex.: DPRcWdvgI4P).
 * POST /api/instagram/mediaByShortcode — body: { shortcode }
 */
export async function fetchMediaByShortcode(
  params: MediaByShortcodeParams
): Promise<InstagramPost | null> {
  if (!RAPIDAPI_HEADERS['x-rapidapi-key']) {
    throw new Error('Configure VITE_RAPIDAPI_KEY no arquivo .env');
  }

  const shortcode = params.shortcode?.trim();
  if (!shortcode) return null;

  const url = `${API_BASE_URL}${API_ENDPOINTS.MEDIA_BY_SHORTCODE}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: RAPIDAPI_HEADERS as Record<string, string>,
    body: JSON.stringify({ shortcode }),
  });

  if (!response.ok) {
    throw new Error(`Erro ao carregar mídia: ${response.status}`);
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
