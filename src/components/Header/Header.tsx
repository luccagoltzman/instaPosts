import styles from './Header.module.css';

export function Header(): JSX.Element {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <h1 className={styles.logo}>
          <span className={styles.logoIcon} aria-hidden>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="0.8" fill="#fff" stroke="none" />
            </svg>
          </span>
          Instagram Posts
        </h1>
        <p className={styles.tagline}>Busque, visualize e baixe posts públicos</p>
      </div>
    </header>
  );
}
