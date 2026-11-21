import { useEffect, useRef, useState } from 'react';
import type { InstagramPost } from '@/types/instagram.types';
import { getProxiedMediaUrl } from '@/utils/proxyMedia';
import styles from './MediaViewer.module.css';

export interface MediaViewerProps {
  /** Posts navegáveis (na ordem exibida no grid). */
  posts: InstagramPost[];
  /** Índice do post aberto; null fecha o visualizador. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** mediaIndex undefined = todas as mídias do post. */
  onDownload: (post: InstagramPost, mediaIndex?: number) => void;
  downloading?: boolean;
}

export function MediaViewer({
  posts,
  index,
  onIndexChange,
  onClose,
  onDownload,
  downloading = false,
}: MediaViewerProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const post = index !== null ? posts[index] ?? null : null;
  const media = post?.media.length ? post.media : post ? [{ imageUrl: post.mediaUrl, videoUrl: post.videoUrl }] : [];
  const current = media[Math.min(mediaIndex, media.length - 1)];
  const hasPrevPost = index !== null && index > 0;
  const hasNextPost = index !== null && index < posts.length - 1;

  // Volta para a 1ª mídia ao trocar de post.
  useEffect(() => setMediaIndex(0), [post?.id]);

  const goPost = (delta: number) => {
    if (index === null) return;
    const next = index + delta;
    if (next >= 0 && next < posts.length) onIndexChange(next);
  };

  // ← → percorrem o carrossel e, no fim dele, passam para o post vizinho.
  const step = (delta: number) => {
    const nextMedia = mediaIndex + delta;
    if (nextMedia >= 0 && nextMedia < media.length) setMediaIndex(nextMedia);
    else goPost(delta);
  };

  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    if (!post) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') stepRef.current(1);
      else if (e.key === 'ArrowLeft') stepRef.current(-1);
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [Boolean(post), onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (post) dialogRef.current?.focus();
  }, [Boolean(post)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!post || !current) return null;

  const isVideo = Boolean(current.videoUrl);
  const isCarousel = media.length > 1;
  const caption = post.caption && post.caption !== 'Sem legenda' ? post.caption : '';

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`Publicação ${index! + 1} de ${posts.length}`}
      ref={dialogRef}
      tabIndex={-1}
    >
      <button
        type="button"
        className={`${styles.postNav} ${styles.postPrev}`}
        onClick={() => goPost(-1)}
        disabled={!hasPrevPost}
        aria-label="Publicação anterior"
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>

      <div className={styles.modal}>
        <div className={styles.header}>
          <p className={styles.position}>
            {index! + 1} / {posts.length}
            {isCarousel && <span className={styles.positionSub}> · mídia {mediaIndex + 1} de {media.length}</span>}
          </p>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar" title="Fechar (Esc)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.stage}>
          {isVideo ? (
            <video
              key={current.videoUrl}
              className={styles.media}
              src={getProxiedMediaUrl(current.videoUrl!)}
              poster={getProxiedMediaUrl(current.imageUrl)}
              controls
              autoPlay
              playsInline
              preload="auto"
              aria-label="Vídeo da publicação"
            />
          ) : (
            <img key={current.imageUrl} src={getProxiedMediaUrl(current.imageUrl)} alt="" className={styles.media} />
          )}

          {isCarousel && (
            <>
              <button
                type="button"
                className={`${styles.mediaNav} ${styles.mediaPrev}`}
                onClick={() => setMediaIndex((i) => i - 1)}
                disabled={mediaIndex === 0}
                aria-label="Mídia anterior do carrossel"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6">
                  <path d="M15 5l-7 7 7 7" />
                </svg>
              </button>
              <button
                type="button"
                className={`${styles.mediaNav} ${styles.mediaNext}`}
                onClick={() => setMediaIndex((i) => i + 1)}
                disabled={mediaIndex === media.length - 1}
                aria-label="Próxima mídia do carrossel"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <div className={styles.dots} role="tablist" aria-label="Mídias do carrossel">
                {media.map((item, i) => (
                  <button
                    key={`${item.imageUrl}-${i}`}
                    type="button"
                    role="tab"
                    aria-selected={i === mediaIndex}
                    aria-label={`Mídia ${i + 1}${item.videoUrl ? ' (vídeo)' : ''}`}
                    className={`${styles.dot} ${i === mediaIndex ? styles.dotActive : ''}`}
                    onClick={() => setMediaIndex(i)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className={styles.footer}>
          {caption && <p className={styles.caption}>{caption}</p>}
          <div className={styles.actions}>
            <a href={post.permalink} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
              Abrir no Instagram
            </a>
            <span className={styles.spacer} />
            {isCarousel && (
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => onDownload(post)}
                disabled={downloading}
              >
                Baixar todas ({media.length})
              </button>
            )}
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => onDownload(post, isCarousel ? mediaIndex : undefined)}
              disabled={downloading}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
              </svg>
              {isCarousel ? `Baixar ${isVideo ? 'este vídeo' : 'esta foto'}` : `Baixar ${isVideo ? 'vídeo' : 'foto'}`}
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        className={`${styles.postNav} ${styles.postNext}`}
        onClick={() => goPost(1)}
        disabled={!hasNextPost}
        aria-label="Próxima publicação"
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
