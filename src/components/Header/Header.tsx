import styles from './Header.module.css';

export function Header(): JSX.Element {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <h1 className={styles.logo}>
          <span className={styles.logoIcon} aria-hidden />
          Instagram Posts
        </h1>
        <p className={styles.tagline}>Busque e baixe posts por usuário</p>
      </div>
    </header>
  );
}
