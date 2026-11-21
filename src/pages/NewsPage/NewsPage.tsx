import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchInstagramPosts,
  fetchMediaByLink,
  isInstagramMediaLink,
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
import { DownloadToast } from '@/components/DownloadToast/DownloadToast';
import { Button } from '@/components/Button/Button';
import { Spinner } from '@/components/Spinner/Spinner';
import { EmptyState } from '@/components/EmptyState/EmptyState';
import { ErrorMessage } from '@/components/ErrorMessage/ErrorMessage';
import { useDownloader } from '@/hooks/useDownloader';
import { useRecentProfiles } from '@/hooks/useRecentProfiles';
import { getProxiedMediaUrl } from '@/utils/proxyMedia';
import { jobsForPost } from '@/utils/download';
import { matchesFilter, postHasVideo, type MediaFilter } from '@/utils/postMedia';
import styles from './NewsPage.module.css';

const FILTERS: { value: MediaFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'video', label: 'Vídeos' },
  { value: 'photo', label: 'Fotos' },
];

const numberFormat = new Intl.NumberFormat('pt-BR');

function Avatar({ profile, size }: { profile: InstagramUserSuggestion; size: 'sm' | 'lg' }): JSX.Element {
  const className = size === 'lg' ? styles.profileAvatar : styles.chipAvatar;
  return profile.profilePicUrl ? (
    <img src={getProxiedMediaUrl(profile.profilePicUrl)} alt="" className={className} />
  ) : (
    <span className={`${className} ${styles.avatarFallback}`} aria-hidden>
      {profile.username.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function NewsPage(): JSX.Element {
  const [username, setUsername] = useState('');
  const [activeHandle, setActiveHandle] = useState('');
  const [posts, setPosts] = useState<InstagramPost[]>([]);
  const [profile, setProfile] = useState<InstagramUserSuggestion | null>(null);
  const [nextMaxId, setNextMaxId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [suggestions, setSuggestions] = useState<InstagramUserSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [filter, setFilter] = useState<MediaFilter>('all');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  /** 'profile' = grid de um perfil; 'link' = um post aberto pelo link. */
  const [mode, setMode] = useState<'profile' | 'link'>('profile');
  const [lastLink, setLastLink] = useState('');
  const suggestionQuery = useRef('');
  /** Sugestão escolhida na lista (traz foto e nome antes da resposta da API). */
  const pickedUser = useRef<InstagramUserSuggestion | null>(null);
  const downloader = useDownloader();
  const { recent, remember, forget } = useRecentProfiles();

  // ---------------------------------------------------------------- sugestões
  useEffect(() => {
    const query = username.trim().replace(/^@/, '');
    suggestionQuery.current = query;
    const looksLikeLink = /[/:]/.test(query);
    if (looksLikeLink || query.length < SEARCH_MIN_CHARS || query.toLowerCase() === activeHandle.toLowerCase()) {
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
        if (!cancelled && suggestionQuery.current === query) setSuggestions([]);
      } finally {
        if (!cancelled && suggestionQuery.current === query) setSuggestionsLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [username, activeHandle]);

  // ---------------------------------------------------------------- abrir por link
  const loadLink = async (link: string) => {
    setMode('link');
    setLastLink(link);
    setActiveHandle('');
    setProfile(null);
    setLoading(true);
    setError(null);
    setHasSearched(true);
    setNextMaxId(null);
    setSelectionMode(false);
    setSelectedIds(new Set());
    setFilter('all');
    setViewerIndex(null);
    try {
      const post = await fetchMediaByLink({ url: link });
      setPosts([post]);
      setViewerIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao abrir o link.');
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  /** O campo aceita @perfil, link de perfil ou link de post/reel/story. */
  const submit = (value?: string, picked?: InstagramUserSuggestion) => {
    const text = (value ?? username).trim();
    if (isInstagramMediaLink(text)) void loadLink(text);
    else void loadPosts(text, picked);
  };

  // ---------------------------------------------------------------- carregar posts
  const loadPosts = async (overrideUsername?: string, picked?: InstagramUserSuggestion) => {
    const handle = (overrideUsername ?? username)
      .trim()
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
      .replace(/[/?#].*$/, '')
      .replace(/^@/, '');
    if (!handle) return;
    setMode('profile');
    setUsername(handle);
    setActiveHandle(handle);
    setLoading(true);
    setError(null);
    setHasSearched(true);
    setNextMaxId(null);
    setSelectionMode(false);
    setSelectedIds(new Set());
    setFilter('all');
    setViewerIndex(null);
    try {
      const { posts: newPosts, nextMaxId: next, profile: nextProfile } = await fetchInstagramPosts({
        username: handle,
      });
      setPosts(newPosts);
      setNextMaxId(next);
      const resolved: InstagramUserSuggestion = {
        id: handle,
        username: handle,
        fullName: '',
        profilePicUrl: '',
        isVerified: false,
        isPrivate: false,
        ...(picked?.username.toLowerCase() === handle.toLowerCase() ? picked : {}),
        ...(nextProfile ?? {}),
      };
      setProfile(resolved);
      remember(resolved);
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
    if (!activeHandle || !nextMaxId || loadingMore || quotaBlocked) return;
    setLoadingMore(true);
    setError(null);
    try {
      // A 1ª página pode ter vindo direto do Instagram e a seguinte da RapidAPI, que repete
      // os posts já exibidos: compara por id e por link para descartar os repetidos.
      const seen = new Set(posts.flatMap((p) => [p.id, p.permalink]));
      const isNew = (p: InstagramPost) => !seen.has(p.id) && !seen.has(p.permalink);

      let cursor: string | null = nextMaxId;
      let onlyNew: InstagramPost[] = [];
      // No máximo 2 requisições: a segunda só se a primeira vier inteira repetida.
      for (let attempt = 0; attempt < 2 && cursor && onlyNew.length === 0; attempt++) {
        const page = await fetchInstagramPosts({ username: activeHandle, maxId: cursor });
        onlyNew = page.posts.filter(isNew);
        cursor = page.nextMaxId && page.nextMaxId !== cursor ? page.nextMaxId : null;
      }

      if (onlyNew.length > 0) setPosts((prev) => [...prev, ...onlyNew]);
      setNextMaxId(cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar mais.');
    } finally {
      setLoadingMore(false);
    }
  };

  // ---------------------------------------------------------------- filtro e listas
  const counts = useMemo(() => {
    const videos = posts.filter(postHasVideo).length;
    return { all: posts.length, video: videos, photo: posts.length - videos };
  }, [posts]);

  const visiblePosts = useMemo(() => posts.filter((post) => matchesFilter(post, filter)), [posts, filter]);
  const pinnedPosts = useMemo(() => visiblePosts.filter((post) => post.pinned), [visiblePosts]);
  const feedPosts = useMemo(() => visiblePosts.filter((post) => !post.pinned), [visiblePosts]);
  // Ordem em que aparecem na tela (fixadas primeiro): usada pelo visualizador.
  const orderedPosts = useMemo(() => [...pinnedPosts, ...feedPosts], [pinnedPosts, feedPosts]);

  // ---------------------------------------------------------------- seleção
  const toggleSelect = useCallback((post: InstagramPost) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(post.id)) next.delete(post.id);
      else next.add(post.id);
      return next;
    });
  }, []);

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const selectedPosts = useMemo(() => posts.filter((p) => selectedIds.has(p.id)), [posts, selectedIds]);
  const selectedFileCount = useMemo(
    () => selectedPosts.reduce((sum, p) => sum + Math.max(p.media.length, 1), 0),
    [selectedPosts]
  );
  const allVisibleSelected = visiblePosts.length > 0 && visiblePosts.every((p) => selectedIds.has(p.id));

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visiblePosts.forEach((p) => next.delete(p.id));
      else visiblePosts.forEach((p) => next.add(p.id));
      return next;
    });
  };

  // ---------------------------------------------------------------- downloads
  const handle = profile?.username ?? activeHandle;

  const downloadPost = (post: InstagramPost, mediaIndex?: number) => {
    void downloader.run(jobsForPost(post, handle, mediaIndex), `${handle}_${post.code || post.id}`);
  };

  const downloadSelected = async () => {
    const jobs = selectedPosts.flatMap((post) => jobsForPost(post, handle));
    const ok = await downloader.run(jobs, `${handle}_${selectedPosts.length}-posts`);
    if (ok) exitSelection();
  };

  const closeViewer = useCallback(() => setViewerIndex(null), []);

  const openPost = (post: InstagramPost) => {
    const index = orderedPosts.findIndex((p) => p.id === post.id);
    if (index >= 0) setViewerIndex(index);
  };

  // ---------------------------------------------------------------- render
  const renderGrid = (items: InstagramPost[], label: string) => (
    <ul className={styles.list} aria-label={label}>
      {items.map((post) => (
        <li key={post.id}>
          <PostCard
            post={post}
            selectionMode={selectionMode}
            selected={selectedIds.has(post.id)}
            onOpen={openPost}
            onToggleSelect={toggleSelect}
            onDownload={downloadPost}
            downloadDisabled={downloader.busy}
          />
        </li>
      ))}
    </ul>
  );

  const showResults = !loading && posts.length > 0;
  const filterLabel = filter === 'video' ? 'vídeo' : 'foto';

  return (
    <Layout>
      <section className={styles.section}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarCopy}>
            <h2 className={styles.toolbarTitle}>Encontre um perfil ou cole um link</h2>
            <p className={styles.toolbarHint}>
              Digite o @ de um perfil público, ou cole o link de um post, reel ou story.
            </p>
          </div>
          <UsernameInput
            value={username}
            onUsernameChange={setUsername}
            onSubmit={(name) => {
              const picked = pickedUser.current;
              pickedUser.current = null;
              submit(name, picked ?? undefined);
            }}
            onPickUser={(user) => {
              pickedUser.current = user;
            }}
            suggestions={suggestions}
            suggestionsLoading={suggestionsLoading}
            loading={loading}
            placeholder="@nike ou instagram.com/reel/…"
          />
          {recent.length > 0 && (
            <div className={styles.recent}>
              <span className={styles.recentLabel}>Recentes</span>
              <ul className={styles.chips}>
                {recent.map((item) => (
                  <li key={item.username} className={styles.chip}>
                    <button
                      type="button"
                      className={styles.chipMain}
                      onClick={() => loadPosts(item.username, item)}
                      disabled={loading}
                    >
                      <Avatar profile={item} size="sm" />@{item.username}
                    </button>
                    <button
                      type="button"
                      className={styles.chipRemove}
                      onClick={() => forget(item.username)}
                      aria-label={`Remover @${item.username} dos recentes`}
                    >
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {loading && (
          <div className={styles.skeleton} role="status" aria-label="Carregando publicações">
            <div className={styles.skeletonProfile}>
              <span className={styles.skeletonCircle} />
              <span className={styles.skeletonLines}>
                <span />
                <span />
              </span>
            </div>
            <div className={styles.list}>
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className={styles.skeletonTile} />
              ))}
            </div>
          </div>
        )}

        {!loading && error && (
          <div className={styles.errorBanner}>
            <ErrorMessage
              message={error}
              onRetry={
                quotaBlocked
                  ? undefined
                  : mode === 'link'
                    ? () => loadLink(lastLink)
                    : () => (nextMaxId && posts.length > 0 ? loadMore() : loadPosts(activeHandle))
              }
            />
          </div>
        )}

        {!loading && !error && !hasSearched && (
          <EmptyState
            title="Comece por um perfil ou um link"
            message="Veja fotos, vídeos e carrosséis de perfis públicos e baixe com um clique, um por um ou vários de uma vez. Também dá para colar o link de um post, reel ou story."
          />
        )}

        {!loading && !error && hasSearched && posts.length === 0 && (
          <EmptyState
            title={profile?.isPrivate ? 'Perfil privado' : 'Nada por aqui'}
            message={
              profile?.isPrivate
                ? 'Só é possível ver publicações de perfis públicos.'
                : 'Nenhuma publicação encontrada para este usuário.'
            }
          />
        )}

        {showResults && mode === 'link' && (
          <section className={styles.gridSection} aria-labelledby="link-heading">
            <h3 id="link-heading" className={styles.sectionTitle}>
              Do link
            </h3>
            {renderGrid(posts, 'Publicação do link')}
          </section>
        )}

        {showResults && mode === 'profile' && (
          <>
            {profile && (
              <div className={styles.profileBar}>
                <Avatar profile={profile} size="lg" />
                <div className={styles.profileMeta}>
                  <p className={styles.profileHandle}>
                    @{profile.username}
                    {profile.isVerified && (
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-label="Verificado">
                        <circle cx="12" cy="12" r="10" fill="#0095f6" />
                        <path d="M7.5 12.5l3 3 6-6" fill="none" stroke="#fff" strokeWidth="2" />
                      </svg>
                    )}
                  </p>
                  {profile.fullName && <p className={styles.profileName}>{profile.fullName}</p>}
                </div>
                <div className={styles.profileStats}>
                  <p className={styles.profileCount}>
                    {profile.postCount !== undefined
                      ? `${numberFormat.format(profile.postCount)} publicações`
                      : `${posts.length} carregadas`}
                  </p>
                  <a
                    className={styles.profileLink}
                    href={`https://www.instagram.com/${profile.username}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir no Instagram
                  </a>
                </div>
              </div>
            )}

            <div className={styles.controls}>
              <div className={styles.segmented} role="group" aria-label="Filtrar por tipo">
                {FILTERS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`${styles.segment} ${filter === option.value ? styles.segmentActive : ''}`}
                    aria-pressed={filter === option.value}
                    onClick={() => setFilter(option.value)}
                  >
                    {option.label}
                    <span className={styles.segmentCount}>{counts[option.value]}</span>
                  </button>
                ))}
              </div>
              <div className={styles.controlsRight}>
                {selectionMode ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={toggleSelectAllVisible} disabled={!visiblePosts.length}>
                      {allVisibleSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={exitSelection}>
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setSelectionMode(true)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                      <rect x="4" y="4" width="16" height="16" rx="4" />
                      <path d="M8.5 12.2l2.5 2.5 4.5-5" />
                    </svg>
                    Selecionar
                  </Button>
                )}
              </div>
            </div>

            {visiblePosts.length === 0 && (
              <p className={styles.filterEmpty}>
                Nenhum{filter === 'photo' ? 'a' : ''} {filterLabel} entre as {posts.length} publicações carregadas.
                {nextMaxId && ' Use “Ver mais” para buscar outras.'}
              </p>
            )}

            {pinnedPosts.length > 0 && (
              <section className={styles.gridSection} aria-labelledby="pinned-heading">
                <h3 id="pinned-heading" className={styles.sectionTitle}>
                  Fixadas
                  <span className={styles.sectionCount}>{pinnedPosts.length}</span>
                </h3>
                {renderGrid(pinnedPosts, 'Publicações fixadas')}
              </section>
            )}

            {feedPosts.length > 0 && (
              <section className={styles.gridSection} aria-labelledby="feed-heading">
                {pinnedPosts.length > 0 && (
                  <h3 id="feed-heading" className={styles.sectionTitle}>
                    Publicações
                  </h3>
                )}
                {renderGrid(feedPosts, 'Publicações')}
              </section>
            )}

            <div className={styles.loadMoreWrap}>
              <p className={styles.postsCount} aria-live="polite">
                {posts.length} {posts.length === 1 ? 'publicação carregada' : 'publicações carregadas'}
              </p>
              {nextMaxId ? (
                <Button variant="secondary" size="lg" onClick={loadMore} disabled={loadingMore || quotaBlocked}>
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
                <p className={styles.allLoaded}>Todas as publicações disponíveis foram carregadas.</p>
              )}
            </div>
          </>
        )}
      </section>

      {selectionMode && showResults && mode === 'profile' && (
        <div className={styles.selectionBar} role="region" aria-label="Seleção">
          <p className={styles.selectionText}>
            {selectedPosts.length === 0 ? (
              'Toque nas publicações para selecionar'
            ) : (
              <>
                <strong>{selectedPosts.length}</strong> {selectedPosts.length === 1 ? 'selecionada' : 'selecionadas'}
                <span className={styles.selectionSub}>
                  {' '}
                  · {selectedFileCount} {selectedFileCount === 1 ? 'arquivo' : 'arquivos'}
                </span>
              </>
            )}
          </p>
          <Button onClick={downloadSelected} disabled={selectedPosts.length === 0 || downloader.busy}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
              <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
            </svg>
            {selectedFileCount > 1 ? 'Baixar .zip' : 'Baixar'}
          </Button>
        </div>
      )}

      <MediaViewer
        posts={orderedPosts}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={closeViewer}
        onDownload={downloadPost}
        downloading={downloader.busy}
      />

      <DownloadToast
        status={downloader.status}
        onDismiss={downloader.dismiss}
        raised={selectionMode && showResults}
      />
    </Layout>
  );
}
