import type { DownloadStatus } from '@/hooks/useDownloader';
import styles from './DownloadToast.module.css';

export interface DownloadToastProps {
  status: DownloadStatus | null;
  onDismiss: () => void;
  /** Sobe o aviso quando a barra de seleção está visível. */
  raised?: boolean;
}

export function DownloadToast({ status, onDismiss, raised = false }: DownloadToastProps): JSX.Element | null {
  if (!status) return null;
  const percent = status.total ? Math.round((status.done / status.total) * 100) : 0;
  const running = status.state === 'running';

  return (
    <div
      className={`${styles.toast} ${styles[status.state]} ${raised ? styles.raised : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className={styles.icon} aria-hidden>
        {running ? (
          <span className={styles.spinner} />
        ) : status.state === 'done' ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M12 7v6M12 17h.01" />
          </svg>
        )}
      </span>
      <div className={styles.body}>
        <p className={styles.message}>{status.message}</p>
        {running && status.total > 1 && (
          <div className={styles.track} aria-hidden>
            <div className={styles.bar} style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
      {!running && (
        <button type="button" className={styles.close} onClick={onDismiss} aria-label="Fechar aviso">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
