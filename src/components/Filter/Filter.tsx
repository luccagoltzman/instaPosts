import type { SelectHTMLAttributes } from 'react';
import { SOURCE_OPTIONS } from '@/config/constants';
import styles from './Filter.module.css';

export interface FilterProps extends SelectHTMLAttributes<HTMLSelectElement> {
  value: string;
  onSourceChange: (source: string) => void;
  label?: string;
}

export function Filter({
  value,
  onSourceChange,
  label = 'Filtrar por fonte',
  id = 'source-filter',
  ...rest
}: FilterProps): JSX.Element {
  return (
    <div className={styles.wrapper}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onSourceChange(e.target.value)}
        className={styles.select}
        aria-label={label}
        {...rest}
      >
        {SOURCE_OPTIONS.map((opt) => (
          <option key={opt.value || 'all'} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
