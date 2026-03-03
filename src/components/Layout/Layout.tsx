import type { ReactNode } from 'react';
import { Header } from '@/components/Header/Header';
import styles from './Layout.module.css';

export interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps): JSX.Element {
  return (
    <div className={styles.layout}>
      <Header />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
