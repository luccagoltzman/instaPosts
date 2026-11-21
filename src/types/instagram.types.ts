/**
 * Tipos de perfis e publicações do Instagram usados no frontend.
 */

export interface InstagramPostParams {
  username: string;
  maxId?: string;
}

export interface MediaByLinkParams {
  url: string;
}

export interface InstagramUserSuggestion {
  id: string;
  username: string;
  fullName: string;
  profilePicUrl: string;
  isVerified: boolean;
  isPrivate: boolean;
  /** Total de publicações do perfil, quando a API informa. */
  postCount?: number;
}

/** Uma mídia (foto ou vídeo). Posts comuns têm 1; carrosséis têm várias. */
export interface MediaItem {
  imageUrl: string;
  videoUrl?: string;
}

export interface InstagramPost {
  id: string;
  /** Código curto do post (ex.: DPRcWdvgI4P), usado no nome do arquivo. */
  code?: string;
  /** Capa do post (1ª mídia). */
  mediaUrl: string;
  /** Vídeo da 1ª mídia, se for vídeo. */
  videoUrl?: string;
  /** Todas as mídias do post (carrossel completo). */
  media: MediaItem[];
  caption: string;
  permalink: string;
  pinned?: boolean;
  isCarousel?: boolean;
}

/** Resposta paginada da API de posts (fotos + vídeos). */
export interface InstagramPostsResponse {
  posts: InstagramPost[];
  nextMaxId: string | null;
  profile?: InstagramUserSuggestion | null;
}
