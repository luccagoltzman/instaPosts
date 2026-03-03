import styles from './Spinner.module.css';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps): JSX.Element {
  return (
    <div
      className={`${styles.spinner} ${styles[size]} ${className}`.trim()}
      role="status"
      aria-label="Carregando"
    />
  );
}
