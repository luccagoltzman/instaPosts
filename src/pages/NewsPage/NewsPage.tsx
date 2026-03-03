import { useState } from 'react';
import { fetchInstagramPosts } from '@/services/instagram.service';
import type { InstagramPost } from '@/types/instagram.types';
import { Layout } from '@/components/Layout/Layout';
import { UsernameInput } from '@/components/UsernameInput/UsernameInput';
import { PostCard } from '@/components/PostCard/PostCard';
import { MediaViewer } from '@/components/MediaViewer/MediaViewer';
import { DownloadOptionsModal } from '@/components/DownloadOptionsModal/DownloadOptionsModal';
import { Button } from '@/components/Button/Button';
import { Spinner } from '@/components/Spinner/Spinner';
import { EmptyState } from '@/components/EmptyState/EmptyState';
import { ErrorMessage } from '@/components/ErrorMessage/ErrorMessage';
import styles from './NewsPage.module.css';

export function NewsPage(): JSX.Element {
  const [username, setUsername] = useState('');
  const [posts, setPosts] = useState<InstagramPost[]>([]);
  const [nextMaxId, setNextMaxId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedPost, setSelectedPost] = useState<InstagramPost | null>(null);
  const [downloadModalPost, setDownloadModalPost] = useState<InstagramPost | null>(null);

  const loadPosts = async () => {
    if (!username.trim()) return;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    setNextMaxId(null);
    try {
      const { posts: newPosts, nextMaxId: next } = await fetchInstagramPosts({
        username: username.trim(),
      });
      setPosts(newPosts);
      setNextMaxId(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar posts.');
      setPosts([]);
      setNextMaxId(null);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!username.trim() || !nextMaxId || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const { posts: newPosts, nextMaxId: next } = await fetchInstagramPosts({
        username: username.trim(),
        maxId: nextMaxId,
      });
      setPosts((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const onlyNew = newPosts.filter((p) => !existingIds.has(p.id));
        return onlyNew.length > 0 ? [...prev, ...onlyNew] : prev;
      });
      setNextMaxId(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar mais.');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Layout>
      <section className={styles.section}>
        <div className={styles.toolbar}>
          <UsernameInput
            value={username}
            onUsernameChange={setUsername}
            onSubmit={loadPosts}
            loading={loading}
            placeholder="Usuário do Instagram"
          />
        </div>

        {loading && (
          <div className={styles.loading}>
            <Spinner size="lg" />
            <span>Carregando fotos e vídeos...</span>
          </div>
        )}

        {!loading && error && (
          <ErrorMessage
            message={error}
            onRetry={() => (nextMaxId && posts.length > 0 ? loadMore() : loadPosts())}
          />
        )}

        {!loading && !error && !hasSearched && (
          <EmptyState message="Digite um usuário do Instagram e clique em Buscar para ver fotos e vídeos." />
        )}

        {!loading && !error && hasSearched && posts.length === 0 && (
          <EmptyState message="Nenhuma mídia encontrada para este usuário." />
        )}

        {!loading && !error && posts.length > 0 && (
          <>
            <ul className={styles.list} aria-label="Lista de posts">
              {posts.map((post) => (
                <li key={post.id}>
                  <PostCard
                    post={post}
                    onPreview={setSelectedPost}
                    onDownloadClick={setDownloadModalPost}
                  />
                </li>
              ))}
            </ul>
            <MediaViewer
              post={selectedPost}
              onClose={() => setSelectedPost(null)}
              onDownloadClick={setDownloadModalPost}
            />
            <DownloadOptionsModal
              post={downloadModalPost}
              onClose={() => setDownloadModalPost(null)}
            />
            <div className={styles.loadMoreWrap}>
              {posts.length > 0 && (
                <p className={styles.postsCount} aria-live="polite">
                  {posts.length} {posts.length === 1 ? 'post carregado' : 'posts carregados'}
                  {nextMaxId && ' · Clique em "Ver mais" para carregar o restante do perfil'}
                </p>
              )}
              {nextMaxId ? (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <>
                      <Spinner size="sm" />
                      Carregando...
                    </>
                  ) : (
                    'Ver mais'
                  )}
                </Button>
              ) : (
                posts.length > 0 && (
                  <p className={styles.allLoaded}>Todos os posts disponíveis foram carregados.</p>
                )
              )}
            </div>
          </>
        )}
      </section>
    </Layout>
  );
}
