import type { InstagramPost } from '@/types/instagram.types';
import { getProxiedMediaUrl } from '@/utils/proxyMedia';
import { postHasVideo } from '@/utils/postMedia';
import styles from './PostCard.module.css';

export interface PostCardProps {
  post: InstagramPost;
  /** Modo seleção: clicar marca/desmarca em vez de abrir. */
  selectionMode?: boolean;
  selected?: boolean;
  onOpen?: (post: InstagramPost) => void;
  onToggleSelect?: (post: InstagramPost) => void;
  onDownload?: (post: InstagramPost) => void;
  downloadDisabled?: boolean;
}

export function PostCard({
  post,
  selectionMode = false,
  selected = false,
  onOpen,
  onToggleSelect,
  onDownload,
  downloadDisabled = false,
}: PostCardProps): JSX.Element {
  const thumbUrl = getProxiedMediaUrl(post.mediaUrl);
  const isVideo = postHasVideo(post);
  const mediaCount = post.media.length;
  const isCarousel = Boolean(post.isCarousel) || mediaCount > 1;
  const kind = isCarousel ? `carrossel com ${mediaCount} mídias` : isVideo ? 'vídeo' : 'foto';
  const captionPreview = post.caption && post.caption !== 'Sem legenda' ? post.caption.slice(0, 80) : '';

  const handleMain = () => {
    if (selectionMode) onToggleSelect?.(post);
    else onOpen?.(post);
  };

  const classes = [styles.card, post.pinned ? styles.pinned : '', selected ? styles.selected : '']
    .filter(Boolean)
    .join(' ');

  return (
    <article className={classes}>
      <button
        type="button"
        className={styles.hit}
        onClick={handleMain}
        aria-pressed={selectionMode ? selected : undefined}
        aria-label={`${selectionMode ? (selected ? 'Desmarcar' : 'Selecionar') : 'Abrir'} ${kind}${captionPreview ? `: ${captionPreview}` : ''}`}
      >
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className={styles.thumbnail} loading="lazy" decoding="async" />
        ) : (
          <span className={styles.thumbnailFallback} aria-hidden />
        )}
        <span className={styles.shade} aria-hidden />
      </button>

      <span className={styles.badges} aria-hidden>
        {isCarousel && (
          <span className={styles.badge}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M4 7h12v13H4zM8 4h12v13h-2V6H8z" />
            </svg>
            {mediaCount > 1 && mediaCount}
          </span>
        )}
        {isVideo && (
          <span className={styles.badge}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            {!isCarousel && <span className={styles.badgeText}>Vídeo</span>}
          </span>
        )}
      </span>

      {selectionMode ? (
        <span className={`${styles.check} ${selected ? styles.checkOn : ''}`} aria-hidden>
          {selected && (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
        </span>
      ) : (
        post.pinned && (
          <span className={styles.pinBadge} title="Publicação fixada" aria-label="Publicação fixada">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
              <path d="M16 9V4h1V2H7v2h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
            </svg>
          </span>
        )
      )}

      {!selectionMode && onDownload && (
        <button
          type="button"
          className={styles.downloadBtn}
          onClick={() => onDownload(post)}
          disabled={downloadDisabled}
          title={mediaCount > 1 ? `Baixar ${mediaCount} mídias (.zip)` : 'Baixar'}
          aria-label={mediaCount > 1 ? `Baixar ${mediaCount} mídias deste carrossel` : `Baixar ${kind}`}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
          </svg>
        </button>
      )}
    </article>
  );
}
