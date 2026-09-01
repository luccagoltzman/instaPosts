import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchInstagramPosts,
  isRateLimitError,
  rankUserSuggestions,
  searchInstagramUsers,
} from '@/services/instagram.service';
import type { InstagramPost, InstagramUserSuggestion } from '@/types/instagram.types';
import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_CHARS } from '@/config/constants';
import { Layout } from '@/components/Layout/Layout';
import { UsernameInput } from '@/components/UsernameInput/UsernameInput';
import { PostCard } from '@/components/PostCard/PostCard';
import { MediaViewer } from '@/components/MediaViewer/MediaViewer';
import { DownloadOptionsModal } from '@/components/DownloadOptionsModal/DownloadOptionsModal';
import { Button } from '@/components/Button/Button';
import { Spinner } from '@/components/Spinner/Spinner';
import { EmptyState } from '@/components/EmptyState/EmptyState';
import { ErrorMessage } from '@/components/ErrorMessage/ErrorMessage';
import { getProxiedMediaUrl } from '@/utils/proxyMedia';
import styles from './NewsPage.module.css';

export function NewsPage(): JSX.Element {
  const [username, setUsername] = useState('');
  const [posts, setPosts] = useState<InstagramPost[]>([]);
  const [profile, setProfile] = useState<InstagramUserSuggestion | null>(null);
  const [nextMaxId, setNextMaxId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedPost, setSelectedPost] = useState<InstagramPost | null>(null);
  const [downloadModalPost, setDownloadModalPost] = useState<InstagramPost | null>(null);
  const [suggestions, setSuggestions] = useState<InstagramUserSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const suggestionQuery = useRef('');

  useEffect(() => {
    const query = username.trim().replace(/^@/, '');
    suggestionQuery.current = query;
    if (query.length < SEARCH_MIN_CHARS) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    let cancelled = false;
    setSuggestionsLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const users = await searchInstagramUsers(query);
        if (cancelled || suggestionQuery.current !== query) return;
        setSuggestions(rankUserSuggestions(query, users));
      } catch {
        if (!cancelled && suggestionQuery.current === query) {
          setSuggestions([]);
        }
      } finally {
        if (!cancelled && suggestionQuery.current === query) {
          setSuggestionsLoading(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [username]);

  const loadPosts = async (overrideUsername?: string) => {
    const handle = (overrideUsername ?? username).trim().replace(/^@/, '');
    if (!handle) return;
    setUsername(handle);
    setLoading(true);
    setError(null);
    setHasSearched(true);
    setNextMaxId(null);
    try {
      const { posts: newPosts, nextMaxId: next, profile: nextProfile } = await fetchInstagramPosts({
        username: handle,
      });
      setPosts(newPosts);
      setNextMaxId(next);
      setProfile((prev) => {
        if (nextProfile) return nextProfile;
        if (prev && prev.username.toLowerCase() === handle.toLowerCase()) return prev;
        return { id: handle, username: handle, fullName: '', profilePicUrl: '', isVerified: false, isPrivate: false };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar posts.');
      setPosts([]);
      setNextMaxId(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const quotaBlocked = isRateLimitError(error);

  const loadMore = async () => {
    if (!username.trim() || !nextMaxId || loadingMore || quotaBlocked) return;
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

  const pinnedPosts = useMemo(() => posts.filter((post) => post.pinned), [posts]);
  const feedPosts = useMemo(
    () => (pinnedPosts.length ? posts.filter((post) => !post.pinned) : posts),
    [posts, pinnedPosts.length]
  );

  const renderGrid = (items: InstagramPost[], label: string) => (
    <ul className={styles.list} aria-label={label}>
      {items.map((post) => (
        <li key={post.id}>
          <PostCard
            post={post}
            onPreview={setSelectedPost}
            onDownloadClick={setDownloadModalPost}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <Layout>
      <section className={styles.section}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarCopy}>
            <h2 className={styles.toolbarTitle}>Encontre um perfil</h2>
            <p className={styles.toolbarHint}>
              Digite um @ e veja sugestões parecidas até chegar no nome exato.
            </p>
          </div>
          <UsernameInput
            value={username}
            onUsernameChange={setUsername}
            onSubmit={loadPosts}
            onPickUser={setProfile}
            suggestions={suggestions}
            suggestionsLoading={suggestionsLoading}
            loading={loading}
            placeholder="Ex: instagram, nike, nasa…"
          />
        </div>

        {loading && (
          <div className={styles.loading}>
            <Spinner size="lg" />
            <span>Carregando fotos e vídeos...</span>
          </div>
        )}

        {!loading && error && (
          <div className={styles.errorBanner}>
            <ErrorMessage
              message={error}
              onRetry={
                isRateLimitError(error)
                  ? undefined
                  : () => (nextMaxId && posts.length > 0 ? loadMore() : loadPosts())
              }
            />
          </div>
        )}

        {!loading && !error && !hasSearched && (
          <EmptyState
            title="Comece por um usuário"
            message="Digite um nome de perfil. A busca sugere contas parecidas enquanto você escreve."
          />
        )}

        {!loading && !error && hasSearched && posts.length === 0 && (
          <EmptyState title="Nada por aqui" message="Nenhuma mídia encontrada para este usuário." />
        )}

        {!loading && posts.length > 0 && (
          <>
            {profile && (
              <div className={styles.profileBar}>
                {profile.profilePicUrl ? (
                  <img
                    src={getProxiedMediaUrl(profile.profilePicUrl)}
                    alt=""
                    className={styles.profileAvatar}
                  />
                ) : (
                  <span className={styles.profileAvatarFallback} aria-hidden>
                    {profile.username.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className={styles.profileMeta}>
                  <p className={styles.profileHandle}>@{profile.username}</p>
                  {profile.fullName && <p className={styles.profileName}>{profile.fullName}</p>}
                </div>
                <p className={styles.profileCount}>
                  {posts.length} {posts.length === 1 ? 'post' : 'posts'}
                </p>
              </div>
            )}

            {pinnedPosts.length > 0 && (
              <section className={styles.pinnedSection} aria-labelledby="pinned-heading">
                <h3 id="pinned-heading" className={styles.sectionTitle}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
                    <path d="M16 9V4h1V2H7v2h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
                  </svg>
                  Fixadas
                  <span className={styles.sectionCount}>{pinnedPosts.length}</span>
                </h3>
                {renderGrid(pinnedPosts, 'Publicações fixadas')}
              </section>
            )}

            {feedPosts.length > 0 && (
              <section className={styles.feedSection} aria-labelledby="feed-heading">
                <h3 id="feed-heading" className={styles.sectionTitle}>
                  Publicações
                </h3>
                {renderGrid(feedPosts, 'Lista de posts')}
              </section>
            )}

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
              <p className={styles.postsCount} aria-live="polite">
                {posts.length} {posts.length === 1 ? 'post carregado' : 'posts carregados'}
                {nextMaxId && !quotaBlocked && ' · Clique em “Ver mais” para o restante do perfil'}
              </p>
              {nextMaxId ? (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={loadMore}
                  disabled={loadingMore || quotaBlocked}
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
                <p className={styles.allLoaded}>Todos os posts disponíveis foram carregados.</p>
              )}
            </div>
          </>
        )}
      </section>
    </Layout>
  );
}
