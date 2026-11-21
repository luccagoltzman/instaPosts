import { useCallback, useState } from 'react';
import type { InstagramUserSuggestion } from '@/types/instagram.types';

const STORAGE_KEY = 'ig-recent-profiles-v1';
const MAX_RECENT = 8;

function read(): InstagramUserSuggestion[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as InstagramUserSuggestion[]) : [];
    return Array.isArray(parsed) ? parsed.filter((p) => p && typeof p.username === 'string') : [];
  } catch {
    return [];
  }
}

function write(list: InstagramUserSuggestion[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // armazenamento indisponível: os recentes valem só nesta sessão
  }
}

/** Perfis abertos recentemente, guardados neste navegador. */
export function useRecentProfiles() {
  const [recent, setRecent] = useState<InstagramUserSuggestion[]>(read);

  const remember = useCallback((profile: InstagramUserSuggestion) => {
    setRecent((prev) => {
      const key = profile.username.toLowerCase();
      const next = [profile, ...prev.filter((p) => p.username.toLowerCase() !== key)].slice(0, MAX_RECENT);
      write(next);
      return next;
    });
  }, []);

  const forget = useCallback((username: string) => {
    setRecent((prev) => {
      const next = prev.filter((p) => p.username.toLowerCase() !== username.toLowerCase());
      write(next);
      return next;
    });
  }, []);

  return { recent, remember, forget };
}
