import type { AnchorHTMLAttributes } from 'react';
import styles from './Card.module.css';

export interface CardProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  title: string;
  source: string;
  url: string;
}

export function Card({ title, source, url, className = '', ...rest }: CardProps): JSX.Element {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${styles.card} ${className}`.trim()}
      {...rest}
    >
      <span className={styles.source}>{source}</span>
      <h3 className={styles.title}>{title}</h3>
    </a>
  );
}
