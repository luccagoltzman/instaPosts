/**
 * Lógica compartilhada entre as funções da Vercel (/api/instagram/*) e o proxy do Vite (dev).
 *
 * Perfis (sempre grátis, do mais simples para o oficial):
 *  1. Endpoints públicos que o próprio site do Instagram usa (sem login).
 *  2. API oficial da Meta (Instagram Graph API / Business Discovery): só perfis profissionais.
 *
 * Link de post/reel/story: "Download All in One!" na RapidAPI (GET /fetch?url=), que consome cota.
 *
 * Respostas bem-sucedidas ficam num cache em memória (vale enquanto a instância estiver viva).
 *
 * A pasta começa com "_" para a Vercel não expor este arquivo como rota.
 */

/** API de download por link: https://rapidapi.com/coder2077/api/instagram-downloader-download-instagram-videos-stories1 */
export const RAPIDAPI_HOST = 'instagram-downloader-download-instagram-videos-stories1.p.rapidapi.com';

const IG_APP_ID = '936619743392459';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/**
 * Token de paginação emitido quando a 1ª página veio direto do Instagram.
 * O "Ver mais" com esse token vai para a Graph API pedindo (já carregados + página),
 * e o frontend descarta os repetidos.
 */
const DIRECT_PAGE_PREFIX = 'ig-direct:';
/** Token de paginação da Graph API: "ig-graph:<posts já carregados>:<cursor>". */
const GRAPH_PAGE_PREFIX = 'ig-graph:';
const GRAPH_DEFAULT_VERSION = 'v26.0';
const GRAPH_MAX_LIMIT = 50;
/** Perfis que a Graph API não atende (pessoais, inexistentes) ficam marcados por 1 h para não gastar chamadas. */
const GRAPH_MISS_TTL_MS = 60 * 60 * 1000;

const DIRECT_TIMEOUT_MS = 8000;
/** Depois de um 429 do Instagram, para de tentar o acesso direto por um tempo (insistir prolonga o bloqueio). */
const DIRECT_COOLDOWN_MS = 10 * 60 * 1000;
const DIRECT_COOLDOWN_KEY = 'direct-cooldown';
const RAPID_TIMEOUT_MS = 25000;
/** Os links de download do Instagram expiram em algumas horas. */
const LINK_CACHE_TTL_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Cache em memória
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 300;
const cache = new Map();

function cacheGet(key, ttl = CACHE_TTL_MS) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttl) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function fetchWithTimeout(url, init, ms) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Aceita "nike", "@nike" ou "https://www.instagram.com/nike/". */
export function toHandle(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/instagram\.com\/([^/?#]+)/i);
  return (match ? match[1] : raw).replace(/^@/, '').replace(/\/+$/, '').trim();
}

function directHeaders(referer) {
  return {
    'User-Agent': BROWSER_UA,
    'x-ig-app-id': IG_APP_ID,
    'X-Requested-With': 'XMLHttpRequest',
    Accept: '*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    Referer: referer,
  };
}

// ---------------------------------------------------------------------------
// Instagram direto
// ---------------------------------------------------------------------------

function nodeHasMissingVideo(node) {
  if (node.is_video && !node.video_url) return true;
  const children = node.edge_sidecar_to_children?.edges ?? [];
  return children.some((edge) => edge?.node?.is_video && !edge.node.video_url);
}

function childToMedia(node) {
  return {
    id: node.id,
    display_url: node.display_url,
    media_type: node.is_video ? 2 : 1,
    ...(node.is_video && node.video_url ? { video_versions: [{ url: node.video_url }] } : {}),
  };
}

/** Converte um nó GraphQL no formato "item" que o frontend já entende (o mesmo da RapidAPI). */
function nodeToItem(node, ownerId) {
  const children = (node.edge_sidecar_to_children?.edges ?? []).map((edge) => edge?.node).filter(Boolean);
  return {
    id: `${node.id}_${node.owner?.id ?? ownerId}`,
    pk: node.id,
    code: node.shortcode,
    media_type: children.length ? 8 : node.is_video ? 2 : 1,
    display_url: node.display_url,
    ...(node.is_video && node.video_url ? { video_url: node.video_url } : {}),
    caption: { text: node.edge_media_to_caption?.edges?.[0]?.node?.text ?? '' },
    pinned_for_users: Array.isArray(node.pinned_for_users) ? node.pinned_for_users : [],
    taken_at: node.taken_at_timestamp,
    ...(children.length
      ? { carousel_media_count: children.length, carousel_media: children.map(childToMedia) }
      : {}),
  };
}

/**
 * Perfil + primeiros posts, via endpoint público do site.
 * Retorna os dados ou, se não der certo, uma string com o motivo.
 */
async function fetchProfileDirect(handle, canPaginate) {
  if (cacheGet(DIRECT_COOLDOWN_KEY, DIRECT_COOLDOWN_MS)) {
    return 'bloqueado há pouco pelo Instagram (HTTP 429); nova tentativa em alguns minutos';
  }
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`;
  try {
    const response = await fetchWithTimeout(
      url,
      { headers: directHeaders(`https://www.instagram.com/${encodeURIComponent(handle)}/`) },
      DIRECT_TIMEOUT_MS
    );
    if (!response.ok) {
      if (response.status === 429) cacheSet(DIRECT_COOLDOWN_KEY, true);
      const reason =
        response.status === 429
          ? 'bloqueado temporariamente pelo Instagram (HTTP 429)'
          : response.status === 404
            ? 'perfil não encontrado (HTTP 404)'
            : `HTTP ${response.status}`;
      log('instagram', `@${handle}`, `falhou (${reason})`);
      return reason;
    }
    const data = await readJson(response);
    const user = data?.data?.user;
    const timeline = user?.edge_owner_to_timeline_media;
    if (!user || !timeline || !Array.isArray(timeline.edges)) {
      const hint = data === null ? 'pediu login' : 'perfil não encontrado ou formato inesperado';
      log('instagram', `@${handle}`, `falhou (${hint})`);
      return hint;
    }

    const nodes = timeline.edges.map((edge) => edge?.node).filter(Boolean);
    // Sem a URL do vídeo não dá para baixar: melhor deixar a próxima fonte responder.
    if (nodes.some(nodeHasMissingVideo)) {
      log('instagram', `@${handle}`, 'há vídeos sem link de download; tentando a próxima fonte');
      return 'vídeos sem link de download';
    }

    const items = nodes.map((node) => nodeToItem(node, user.id));
    // Sem a Graph API configurada não há como buscar as páginas seguintes de graça.
    const hasNext = canPaginate && Boolean(timeline.page_info?.has_next_page) && !user.is_private && items.length > 0;

    return {
      source: 'instagram',
      user: {
        pk: user.id,
        username: user.username,
        full_name: user.full_name ?? '',
        profile_pic_url: user.profile_pic_url_hd || user.profile_pic_url || '',
        is_verified: Boolean(user.is_verified),
        is_private: Boolean(user.is_private),
        media_count: timeline.count,
      },
      items,
      more_available: hasNext,
      pagination_token: hasNext ? `${DIRECT_PAGE_PREFIX}${items.length}` : null,
    };
  } catch (error) {
    const reason = error?.name === 'TimeoutError' ? 'tempo esgotado' : 'erro de rede';
    log('instagram', `@${handle}`, `falhou (${reason})`);
    return reason;
  }
}

/** Busca de perfis pelo endpoint público do site. Costuma exigir login; null se falhar. */
async function searchUsersDirect(query) {
  const url = `https://www.instagram.com/web/search/topsearch/?context=blended&include_reel=false&query=${encodeURIComponent(query)}`;
  try {
    const response = await fetchWithTimeout(
      url,
      { headers: directHeaders('https://www.instagram.com/') },
      DIRECT_TIMEOUT_MS
    );
    if (!response.ok) return null;
    const data = await readJson(response);
    if (!Array.isArray(data?.users) || data.users.length === 0) return null;
    return { source: 'instagram', users: data.users };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Instagram Graph API — Business Discovery (oficial, gratuita)
// ---------------------------------------------------------------------------

/**
 * Configuração vinda do ambiente.
 *  RAPIDAPI_KEY           chave da RapidAPI (download por link)
 *  IG_GRAPH_TOKEN         token de acesso de longa duração da Meta
 *  IG_GRAPH_USER_ID       ID da SUA conta profissional do Instagram (quem faz a consulta)
 *  IG_GRAPH_API_VERSION   opcional, padrão v26.0
 */
export function configFromEnv(env) {
  // RAPIDAPI_KEY: chave da sua conta RapidAPI (vale para qualquer API assinada nela).
  return {
    rapidApiKey: env.RAPIDAPI_KEY || env.VITE_RAPIDAPI_KEY || '',
    graphToken: env.IG_GRAPH_TOKEN || '',
    graphUserId: env.IG_GRAPH_USER_ID || '',
    graphVersion: env.IG_GRAPH_API_VERSION || GRAPH_DEFAULT_VERSION,
  };
}

function graphEnabled(config) {
  return Boolean(config.graphToken && config.graphUserId);
}

const GRAPH_MEDIA_FIELDS =
  'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_type,media_url,thumbnail_url}';

function codeFromPermalink(permalink) {
  const match = String(permalink || '').match(/instagram\.com\/(?:p|reel|tv)\/([^/?#]+)/i);
  return match ? match[1] : undefined;
}

function graphChildToMedia(child) {
  const isVideo = child.media_type === 'VIDEO';
  return {
    id: child.id,
    display_url: isVideo ? child.thumbnail_url || '' : child.media_url || '',
    media_type: isVideo ? 2 : 1,
    ...(isVideo && child.media_url ? { video_versions: [{ url: child.media_url }] } : {}),
  };
}

function graphHasMissingVideo(media) {
  const items = media.media_type === 'CAROUSEL_ALBUM' ? media.children?.data ?? [] : [media];
  return items.some((item) => item.media_type === 'VIDEO' && !item.media_url);
}

/** Converte uma mídia da Graph API no formato "item" que o frontend entende. */
function graphMediaToItem(media, ownerId) {
  const code = codeFromPermalink(media.permalink);
  const caption = { text: media.caption ?? '' };
  if (media.media_type === 'CAROUSEL_ALBUM') {
    const children = (media.children?.data ?? []).map(graphChildToMedia);
    return {
      id: `${media.id}_${ownerId}`,
      code,
      media_type: 8,
      display_url: children[0]?.display_url ?? '',
      caption,
      carousel_media_count: children.length,
      carousel_media: children,
    };
  }
  const isVideo = media.media_type === 'VIDEO';
  return {
    id: `${media.id}_${ownerId}`,
    code,
    media_type: isVideo ? 2 : 1,
    display_url: isVideo ? media.thumbnail_url || '' : media.media_url || '',
    ...(isVideo && media.media_url ? { video_url: media.media_url } : {}),
    caption,
  };
}

/**
 * Perfil + publicações pela Graph API. `after` é o cursor da página; `loaded` quantos posts
 * o usuário já tem na tela antes desta página. Retorna null se não der.
 */
async function fetchProfileGraph(config, handle, { limit, after, loaded }) {
  if (!graphEnabled(config)) return 'não configurada (IG_GRAPH_TOKEN e IG_GRAPH_USER_ID)';
  const missKey = `graph-miss:${handle.toLowerCase()}`;
  if (cacheGet(missKey, GRAPH_MISS_TTL_MS)) return 'perfil não é profissional ou não existe';

  const mediaEdge = `media${after ? `.after(${after})` : ''}.limit(${limit}){${GRAPH_MEDIA_FIELDS}}`;
  const fields = `business_discovery.username(${handle}){id,username,name,profile_picture_url,media_count,${mediaEdge}}`;
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/${config.graphUserId}`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('access_token', config.graphToken);

  try {
    const response = await fetchWithTimeout(url, {}, DIRECT_TIMEOUT_MS + 4000);
    const data = await readJson(response);
    const user = data?.business_discovery;
    if (!response.ok || !user) {
      const code = data?.error?.code;
      // 4/17/32/613 = limite de chamadas; 190 = token inválido ou expirado: não marcam o perfil.
      if (![4, 17, 32, 190, 613].includes(code)) cacheSet(missKey, true);
      const reason =
        code === 190
          ? 'token inválido ou expirado'
          : [4, 17, 32, 613].includes(code)
            ? 'limite de chamadas da Meta atingido'
            : code === 110 || code === 100
              ? 'perfil não é profissional ou não existe'
              : code
                ? `erro da Meta (código ${code})`
                : `HTTP ${response.status}`;
      log('graph', `@${handle}`, `falhou (${reason})`);
      return reason;
    }

    const mediaList = Array.isArray(user.media?.data) ? user.media.data : [];
    if (mediaList.some(graphHasMissingVideo)) {
      log('graph', `@${handle}`, 'há vídeos sem link de download; usando a reserva');
      return 'vídeos sem link de download';
    }

    const items = mediaList.map((media) => graphMediaToItem(media, user.id));
    const nextCursor = user.media?.paging?.next ? user.media?.paging?.cursors?.after : null;
    return {
      source: 'graph',
      user: {
        pk: user.id,
        username: user.username,
        full_name: user.name ?? '',
        profile_pic_url: user.profile_picture_url ?? '',
        is_verified: false,
        is_private: false,
        media_count: user.media_count,
      },
      items,
      more_available: Boolean(nextCursor),
      pagination_token: nextCursor ? `${GRAPH_PAGE_PREFIX}${loaded + items.length}:${nextCursor}` : null,
    };
  } catch {
    log('graph', `@${handle}`, 'erro de rede ou tempo esgotado');
    return 'erro de rede ou tempo esgotado';
  }
}

// ---------------------------------------------------------------------------
// Download por link (RapidAPI "Download All in One!")
// ---------------------------------------------------------------------------

/** Aceita links de post, reel, tv e story do Instagram. */
export function isInstagramMediaLink(value) {
  try {
    const u = new URL(String(value || '').trim());
    const host = u.hostname.toLowerCase();
    const isInstagram = host === 'instagram.com' || host.endsWith('.instagram.com') || host === 'instagr.am';
    return isInstagram && /\/(p|reel|reels|tv|stories)\//i.test(u.pathname);
  } catch {
    return false;
  }
}

function linkFileToMedia(file) {
  const isVideo = file.type === 'video' || file.type === 'gif';
  return {
    display_url: (isVideo ? file.thumbnail_url : file.download_url || file.thumbnail_url) || '',
    media_type: isVideo ? 2 : 1,
    ...(isVideo && file.download_url ? { video_versions: [{ url: file.download_url }] } : {}),
  };
}

/** Converte a resposta de /fetch no formato "item" que o frontend entende. */
function linkResponseToItem(data, link) {
  const code = data.id || codeFromPermalink(link);
  // A API devolve quebras de linha escapadas (barra + "n" literal): converte para quebras reais.
  const caption = { text: String(data.caption ?? '').replace(/(?:\\r)?\\n/g, '\n') };
  const permalink = link.split('?')[0];
  if (data.type === 'album' && Array.isArray(data.items)) {
    const children = data.items.map(linkFileToMedia);
    return {
      id: `link_${code}`,
      code,
      permalink,
      media_type: 8,
      display_url: children[0]?.display_url ?? '',
      caption,
      carousel_media_count: children.length,
      carousel_media: children,
    };
  }
  const media = linkFileToMedia(data);
  return {
    id: `link_${code}`,
    code,
    permalink,
    media_type: media.media_type,
    display_url: media.display_url,
    ...(media.video_versions ? { video_url: media.video_versions[0].url } : {}),
    caption,
  };
}

function describeLinkFailure(status, data) {
  const raw = String(data?.message || data?.error || '');
  if (status === 400 || data?.ok === false) return 'Link privado, apagado ou não suportado.';
  if (status === 401) return 'Chave da RapidAPI inválida (HTTP 401). Confira RAPIDAPI_KEY.';
  if (status === 403 && /not subscribed/i.test(raw)) {
    return 'Sua chave não está inscrita na API "Download All in One!" da RapidAPI (HTTP 403). Assine o plano Basic (grátis) na página da API.';
  }
  if (status === 429) {
    return 'Limite de requisições da RapidAPI (HTTP 429): cota mensal da "Download All in One!" esgotada ou muitas chamadas seguidas.';
  }
  if (status >= 500) return 'A API de download está instável no momento. Tente de novo em alguns segundos.';
  return raw || `Erro ao buscar o link (HTTP ${status}).`;
}

export async function getMediaByLink(config, body) {
  const link = String(body.url || body.link || '').trim();
  if (!isInstagramMediaLink(link)) {
    return { status: 400, body: { error: 'Cole o link de um post, reel ou story do Instagram.' } };
  }
  const subject = `link ${link}`;
  const cacheKey = `link:${link.split('?')[0]}`;
  const cached = cacheGet(cacheKey, LINK_CACHE_TTL_MS);
  if (cached) {
    log('cache', subject);
    return cached;
  }
  if (!config.rapidApiKey) {
    return { status: 500, body: { error: 'RAPIDAPI_KEY não configurada no servidor.' } };
  }

  const url = new URL(`https://${RAPIDAPI_HOST}/fetch`);
  url.searchParams.set('url', link);
  try {
    const response = await fetchWithTimeout(
      url,
      { headers: { 'x-rapidapi-host': RAPIDAPI_HOST, 'x-rapidapi-key': config.rapidApiKey } },
      RAPID_TIMEOUT_MS
    );
    const data = (await readJson(response)) ?? {};
    if (!response.ok || data.ok !== true) {
      const status = response.ok ? 400 : response.status;
      log('rapidapi', subject, `falhou (HTTP ${status})`);
      return { status, body: { error: describeLinkFailure(status, data), source: 'rapidapi' } };
    }
    const result = { status: 200, body: { source: 'rapidapi', items: [linkResponseToItem(data, link)] } };
    log('rapidapi', subject);
    cache.set(cacheKey, { at: Date.now(), value: result });
    return result;
  } catch (error) {
    log('rapidapi', subject, 'erro de rede ou tempo esgotado');
    return { status: 502, body: { error: 'Não foi possível falar com a API de download. Tente novamente.' } };
  }
}

// ---------------------------------------------------------------------------
// Log de origem (aparece no terminal do `npm run dev` e nos logs da Vercel)
// ---------------------------------------------------------------------------

function log(source, subject, detail) {
  console.info(`[instagram] ${subject} → ${source}${detail ? ` (${detail})` : ''}`);
}

// ---------------------------------------------------------------------------
// Operações expostas (cada uma retorna { status, body })
// ---------------------------------------------------------------------------

export async function getUserPosts(config, body) {
  const handle = toHandle(body.username);
  if (!handle) return { status: 400, body: { error: 'Informe um usuário.' } };

  const token = String(body.maxId || body.pagination_token || '');
  const pageSize = Number(body.amount) || 12;
  const subject = `posts @${handle}${token ? ' (ver mais)' : ''}`;
  const cacheKey = `posts:${handle.toLowerCase()}:${token}:${pageSize}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    log(`cache de ${cached.body?.source ?? '?'}`, subject);
    return cached;
  }

  // Tipos de token: vazio (1ª página), ig-direct:N ou ig-graph:N:cursor.
  let loaded = 0;
  let graphCursor = '';
  if (token.startsWith(DIRECT_PAGE_PREFIX)) {
    loaded = Number.parseInt(token.slice(DIRECT_PAGE_PREFIX.length), 10) || 0;
  } else if (token.startsWith(GRAPH_PAGE_PREFIX)) {
    const rest = token.slice(GRAPH_PAGE_PREFIX.length);
    const sep = rest.indexOf(':');
    loaded = Number.parseInt(rest.slice(0, sep), 10) || 0;
    graphCursor = rest.slice(sep + 1);
  } else if (token) {
    return { status: 400, body: { error: 'Paginação expirada. Busque o perfil novamente.' } };
  }

  const attempts = [];

  // 1. Instagram direto (só a 1ª página)
  if (!token) {
    const direct = await fetchProfileDirect(handle, graphEnabled(config));
    if (typeof direct !== 'string') {
      log('instagram', subject);
      return cacheSet(cacheKey, { status: 200, body: direct });
    }
    attempts.push(`Instagram: ${direct}`);
  }

  // 2. Graph API. Vindo do Instagram direto não há cursor: pede (já carregados + página)
  //    e o frontend descarta os repetidos.
  const graph = await fetchProfileGraph(config, handle, {
    limit: Math.min(graphCursor ? pageSize : loaded + pageSize, GRAPH_MAX_LIMIT),
    after: graphCursor,
    loaded: graphCursor ? loaded : 0,
  });
  if (typeof graph !== 'string') {
    log('graph', subject);
    return cacheSet(cacheKey, { status: 200, body: graph });
  }
  attempts.push(`API da Meta: ${graph}`);

  log('nenhuma fonte', subject);
  const blocked = attempts.some((line) => line.includes('HTTP 429'));
  const lines = [...attempts, 'Dica: cole o link de um post ou reel no mesmo campo para baixar direto.'];
  return {
    status: blocked ? 429 : 502,
    body: {
      sourcesFailed: true,
      error: `Não foi possível carregar @${handle}.\n${lines.map((line) => `• ${line}`).join('\n')}`,
    },
  };
}

/** Sugestões de perfil. Sem login o Instagram costuma recusar: nesse caso devolve lista vazia. */
export async function searchUsers(config, body) {
  const query = String(body.search || body.query || '').trim().replace(/^@/, '');
  if (!query) return { status: 200, body: { users: [] } };

  const cacheKey = `search:${query.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const direct = await searchUsersDirect(query);
  if (direct) {
    log('instagram', `busca "${query}"`);
    return cacheSet(cacheKey, { status: 200, body: direct });
  }
  log('indisponível', `busca "${query}"`);
  return { status: 200, body: { source: 'none', users: [] } };
}

export const OPERATIONS = {
  posts: getUserPosts,
  search: searchUsers,
  link: getMediaByLink,
};

/** Cria o handler de uma função serverless da Vercel para a operação informada. */
export function createHandler(operation) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const { status, body: payload } = await operation(configFromEnv(process.env), body);
      res.setHeader('X-Data-Source', payload?.source || 'unknown');
      return res.status(status).json(payload);
    } catch {
      return res.status(502).json({ error: 'Erro ao comunicar com a API.' });
    }
  };
}
