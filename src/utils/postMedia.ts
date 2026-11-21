import type { InstagramPost } from '@/types/instagram.types';

export type MediaFilter = 'all' | 'video' | 'photo';

export function postHasVideo(post: InstagramPost): boolean {
  return Boolean(post.videoUrl) || post.media.some((item) => Boolean(item.videoUrl));
}

export function matchesFilter(post: InstagramPost, filter: MediaFilter): boolean {
  if (filter === 'all') return true;
  return filter === 'video' ? postHasVideo(post) : !postHasVideo(post);
}
