import type { HTMLAttributes } from 'react';
import type { InstagramPost } from '@/types/instagram.types';
import { downloadMedia } from '@/utils/download';
import styles from './PostCard.module.css';

export interface PostCardProps extends HTMLAttributes<HTMLDivElement> {
  post: InstagramPost;
}

export function PostCard({ post, className = '', ...rest }: PostCardProps): JSX.Element {
  const thumbUrl = post.mediaUrl;
  const isVideo = Boolean(post.videoUrl);
  const downloadUrl = post.videoUrl ?? post.mediaUrl;
  const downloadFilename = `instagram-${post.id}`;

  const handleDownload = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (downloadUrl) downloadMedia(downloadUrl, downloadFilename);
  };

  return (
    <article className={`${styles.card} ${className}`.trim()} {...rest}>
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
            <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        )}
        <div className={styles.overlay}>
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
