import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  title?: string;
  message?: string;
}

export function EmptyState({
  title,
  message = 'Nenhuma notícia encontrada para os filtros selecionados.',
}: EmptyStateProps): JSX.Element {
  return (
    <div className={styles.wrapper} role="status">
      <span className={styles.icon} aria-hidden>
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.4" cy="6.6" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      </span>
      {title && <h2 className={styles.title}>{title}</h2>}
      <p className={styles.message}>{message}</p>
    </div>
  );
}
