import { useEffect } from 'react';
import type { InstagramPost } from '@/types/instagram.types';
import { downloadMedia } from '@/utils/download';
import { getProxiedMediaUrl } from '@/utils/proxyMedia';
import styles from './DownloadOptionsModal.module.css';

export interface DownloadOptionsModalProps {
  post: InstagramPost | null;
  onClose: () => void;
}

export function DownloadOptionsModal({ post, onClose }: DownloadOptionsModalProps): JSX.Element | null {
  useEffect(() => {
    if (!post) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [post, onClose]);

  if (!post) return null;

  const isVideo = Boolean(post.videoUrl);
  const downloadUrl = post.videoUrl ?? post.mediaUrl;
  const proxiedUrl = getProxiedMediaUrl(downloadUrl);
  const baseFilename = `instagram-${post.id}`;
  const filenameNormal = isVideo ? `${baseFilename}.mp4` : `${baseFilename}.jpg`;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleNormal = () => {
    if (downloadUrl) downloadMedia(proxiedUrl, filenameNormal);
    onClose();
  };

  return (
    <div
      className={styles.backdrop}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="download-options-title"
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 id="download-options-title" className={styles.title}>
            Como deseja baixar?
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Fechar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.content}>
          <p className={styles.question}>
            Baixe o arquivo original no formato em que foi publicado.
          </p>
          <div className={styles.options}>
            <button type="button" className={styles.optionBtn} onClick={handleNormal}>
              <span className={styles.optionLabel}>Download normal</span>
              <span className={styles.optionDesc}>
                Baixar o arquivo original, sem alteração.
              </span>
            </button>
          </div>
          <div className={styles.comingSoon} role="status">
            <span className={styles.comingSoonIcon} aria-hidden>🔧</span>
            <p className={styles.comingSoonText}>
              Estamos construindo o download otimizado para <strong>TikTok Shop</strong> e <strong>Shopee Vídeo</strong> (formato 9:16 e limites de duração/tamanho). Em breve!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
