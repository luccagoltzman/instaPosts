import type { HTMLAttributes } from 'react';
import type { InstagramPost } from '@/types/instagram.types';
import { getProxiedMediaUrl } from '@/utils/proxyMedia';
import styles from './PostCard.module.css';

export interface PostCardProps extends HTMLAttributes<HTMLDivElement> {
  post: InstagramPost;
  onPreview?: (post: InstagramPost) => void;
  onDownloadClick?: (post: InstagramPost) => void;
}

export function PostCard({ post, onPreview, onDownloadClick, className = '', ...rest }: PostCardProps): JSX.Element {
  const thumbUrl = getProxiedMediaUrl(post.mediaUrl);
  const isVideo = Boolean(post.videoUrl);

  const handleCardClick = (): void => {
    onPreview?.(post);
  };

  const handleDownload = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    onDownloadClick?.(post);
  };

  return (
    <article
      className={`${styles.card} ${post.pinned ? styles.cardPinned : ''} ${className}`.trim()}
      onClick={onPreview ? handleCardClick : undefined}
      role={onPreview ? 'button' : undefined}
      tabIndex={onPreview ? 0 : undefined}
      onKeyDown={onPreview ? (e) => e.key === 'Enter' && handleCardClick() : undefined}
      {...rest}
    >
      <div className={styles.media}>
        {thumbUrl && (
          <img
            src={thumbUrl}
            alt=""
            className={styles.thumbnail}
            loading="lazy"
          />
        )}
        {isVideo && (
          <span className={styles.videoIcon} aria-hidden>
            <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        )}
        {post.pinned && (
          <span className={styles.pinBadge} title="Publicação fixada" aria-label="Publicação fixada">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
              <path d="M16 9V4h1V2H7v2h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
            </svg>
          </span>
        )}
        {post.isCarousel && (
          <span className={styles.carouselBadge} aria-hidden>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M4 6h12v12H4zM8 4h12v12h-2V6H8z" />
            </svg>
          </span>
        )}
        <div className={styles.overlay} role="presentation">
          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleDownload}
            title="Baixar"
            aria-label="Baixar mídia"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            <span>Baixar</span>
          </button>
          <a
            href={post.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.actionBtn}
            title="Abrir no Instagram"
            onClick={(e) => e.stopPropagation()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
            </svg>
            <span>Abrir</span>
          </a>
        </div>
      </div>
    </article>
  );
}
