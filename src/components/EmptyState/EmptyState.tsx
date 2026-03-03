import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  message?: string;
}

export function EmptyState({
  message = 'Nenhuma notícia encontrada para os filtros selecionados.',
}: EmptyStateProps): JSX.Element {
  return (
    <div className={styles.wrapper} role="status">
      <p className={styles.message}>{message}</p>
    </div>
  );
}
