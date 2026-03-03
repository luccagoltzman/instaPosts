import styles from './Header.module.css';

export function Header(): JSX.Element {
  return (
    <header className={styles.header}>
      <h1 className={styles.logo}>News Petrol</h1>
      <p className={styles.tagline}>
        Petróleo, gás e energias renováveis
      </p>
    </header>
  );
}
