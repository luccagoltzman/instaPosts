import { useState, useEffect, useCallback } from 'react';
import { fetchNews } from '@/services/news.service';
import type { NewsArticle } from '@/types/news.types';
import { Layout } from '@/components/Layout/Layout';
import { Filter } from '@/components/Filter/Filter';
import { Card } from '@/components/Card/Card';
import { Button } from '@/components/Button/Button';
import { Spinner } from '@/components/Spinner/Spinner';
import { EmptyState } from '@/components/EmptyState/EmptyState';
import { ErrorMessage } from '@/components/ErrorMessage/ErrorMessage';
import styles from './NewsPage.module.css';

export function NewsPage(): JSX.Element {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNews(source ? { source } : undefined);
      setArticles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar notícias.');
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    loadNews();
  }, [loadNews]);

  return (
    <Layout>
      <section className={styles.section}>
        <div className={styles.toolbar}>
          <Filter value={source} onSourceChange={setSource} />
          <Button
            variant="secondary"
            size="md"
            onClick={loadNews}
            disabled={loading}
          >
            Atualizar
          </Button>
        </div>

        {loading && (
          <div className={styles.loading}>
            <Spinner size="lg" />
            <span>Carregando notícias...</span>
          </div>
        )}

        {!loading && error && (
          <ErrorMessage message={error} onRetry={loadNews} />
        )}

        {!loading && !error && articles.length === 0 && (
          <EmptyState />
        )}

        {!loading && !error && articles.length > 0 && (
          <ul className={styles.list} aria-label="Lista de notícias">
            {articles.map((article, index) => (
              <li key={`${article.url}-${index}`}>
                <Card
                  title={article.title}
                  source={article.source}
                  url={article.url}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Layout>
  );
}
