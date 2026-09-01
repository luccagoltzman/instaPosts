import { useEffect, useId, useRef, useState } from 'react';
import type { FormHTMLAttributes, KeyboardEvent } from 'react';
import type { InstagramUserSuggestion } from '@/types/instagram.types';
import { Button } from '@/components/Button/Button';
import { getProxiedMediaUrl } from '@/utils/proxyMedia';
import styles from './UsernameInput.module.css';

export interface UsernameInputProps extends FormHTMLAttributes<HTMLFormElement> {
  value: string;
  onUsernameChange: (value: string) => void;
  onSubmit: (username?: string) => void;
  onPickUser?: (user: InstagramUserSuggestion) => void;
  suggestions?: InstagramUserSuggestion[];
  suggestionsLoading?: boolean;
  loading?: boolean;
  placeholder?: string;
}

function highlightMatch(text: string, query: string): JSX.Element {
  const q = query.trim().replace(/^@/, '');
  if (!q) return <>{text}</>;
  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className={styles.mark}>{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  );
}

export function UsernameInput({
  value,
  onUsernameChange,
  onSubmit,
  onPickUser,
  suggestions = [],
  suggestionsLoading = false,
  loading = false,
  placeholder = 'Busque um @usuario',
  ...rest
}: UsernameInputProps): JSX.Element {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const query = value.trim().replace(/^@/, '');
  const showList = open && !loading && (suggestionsLoading || suggestions.length > 0 || query.length >= 2);

  useEffect(() => {
    setActiveIndex(0);
  }, [suggestions, value]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const pickUser = (user: InstagramUserSuggestion) => {
    onUsernameChange(user.username);
    onPickUser?.(user);
    setOpen(false);
    onSubmit(user.username);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const active = suggestions[activeIndex];
    if (open && active && query.length >= 2) {
      pickUser(active);
      return;
    }
    setOpen(false);
    onSubmit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <form
        className={styles.form}
        onSubmit={handleSubmit}
        aria-label="Buscar posts por usuário"
        {...rest}
      >
        <div className={styles.field}>
          <span className={styles.searchIcon} aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3-3" />
            </svg>
          </span>
          <input
            id="instagram-username"
            name="username"
            type="text"
            value={value}
            onChange={(e) => {
              onUsernameChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={styles.input}
            aria-label="Nome de usuário do Instagram"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={showList && suggestions[activeIndex] ? `${listId}-${suggestions[activeIndex].id}` : undefined}
            role="combobox"
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Button type="submit" disabled={loading || !value.trim()}>
          {loading ? 'Buscando…' : 'Buscar'}
        </Button>
      </form>

      {showList && (
        <ul id={listId} className={styles.list} role="listbox" aria-label="Perfis sugeridos">
          {suggestionsLoading && suggestions.length === 0 && (
            <li className={styles.status} role="status">
              Procurando perfis parecidos…
            </li>
          )}
          {!suggestionsLoading && suggestions.length === 0 && (
            <li className={styles.status} role="status">
              Nenhum perfil encontrado para “{query}”.
            </li>
          )}
          {suggestions.map((user, index) => {
            const exact = user.username.toLowerCase() === query.toLowerCase();
            return (
              <li key={user.id} role="presentation">
                <button
                  type="button"
                  id={`${listId}-${user.id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`${styles.option} ${index === activeIndex ? styles.optionActive : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pickUser(user)}
                >
                  {user.profilePicUrl ? (
                    <img
                      src={getProxiedMediaUrl(user.profilePicUrl)}
                      alt=""
                      className={styles.avatar}
                    />
                  ) : (
                    <span className={styles.avatarFallback} aria-hidden>
                      {user.username.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className={styles.meta}>
                    <span className={styles.handle}>
                      {highlightMatch(user.username, query)}
                      {user.isVerified && (
                        <svg className={styles.verified} viewBox="0 0 24 24" width="14" height="14" aria-label="Verificado">
                          <circle cx="12" cy="12" r="10" fill="#0095f6" />
                          <path d="M7.5 12.5l3 3 6-6" fill="none" stroke="#fff" strokeWidth="2" />
                        </svg>
                      )}
                      {exact && <span className={styles.exact}>exato</span>}
                    </span>
                    {user.fullName && (
                      <span className={styles.fullName}>{highlightMatch(user.fullName, query)}</span>
                    )}
                  </span>
                  {user.isPrivate && <span className={styles.private}>privado</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
