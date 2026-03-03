/**
 * Tipos para a API de posts do Instagram (Instagram120 / RapidAPI).
 */

export interface InstagramPostParams {
  username: string;
  maxId?: string;
}

export interface MediaByShortcodeParams {
  shortcode: string;
}

export interface InstagramPost {
  id: string;
  mediaUrl: string;
  videoUrl?: string;
  caption: string;
  permalink: string;
}

/** Resposta paginada da API de posts (fotos + vídeos). */
export interface InstagramPostsResponse {
  posts: InstagramPost[];
  nextMaxId: string | null;
}
