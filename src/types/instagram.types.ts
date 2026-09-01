/**
 * Tipos para a API de posts do Instagram (Instagram Scraper Stable API / RapidAPI).
 */

export interface InstagramPostParams {
  username: string;
  maxId?: string;
}

export interface MediaByShortcodeParams {
  shortcode: string;
}

export interface InstagramUserSuggestion {
  id: string;
  username: string;
  fullName: string;
  profilePicUrl: string;
  isVerified: boolean;
  isPrivate: boolean;
}

export interface InstagramPost {
  id: string;
  mediaUrl: string;
  videoUrl?: string;
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
