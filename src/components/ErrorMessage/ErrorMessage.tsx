import { Button } from '@/components/Button/Button';
import styles from './ErrorMessage.module.css';

export interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorMessage({ message, onRetry }: ErrorMessageProps): JSX.Element {
  return (
    <div className={styles.wrapper} role="alert">
      <p className={styles.message}>{message}</p>
      {onRetry && (
        <Button variant="primary" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
