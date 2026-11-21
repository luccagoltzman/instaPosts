import { zipSync } from 'fflate';
import type { InstagramPost, MediaItem } from '@/types/instagram.types';

/**
 * Dispara o download de um Blob com o nome de arquivo informado.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/\s+/g, '-');
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Sempre passa pelo nosso proxy: o CDN do Instagram não libera CORS para o navegador. */
function proxiedForDownload(url: string): string {
  return `/api/proxy-media?url=${encodeURIComponent(url)}`;
}

export interface DownloadJob {
  /** URL original no CDN do Instagram. */
  url: string;
  filename: string;
}

function sanitize(part: string): string {
  return part.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/** Arquivos de um post: todas as mídias do carrossel, ou só a de índice `onlyIndex`. */
export function jobsForPost(post: InstagramPost, username?: string, onlyIndex?: number): DownloadJob[] {
  const media: MediaItem[] = post.media.length ? post.media : [{ imageUrl: post.mediaUrl, videoUrl: post.videoUrl }];
  const base = sanitize(`${username || 'instagram'}_${post.code || post.id}`);
  return media
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => onlyIndex === undefined || index === onlyIndex)
    .map(({ item, index }) => ({
      url: item.videoUrl ?? item.imageUrl,
      filename: `${base}${media.length > 1 ? `_${index + 1}` : ''}.${item.videoUrl ? 'mp4' : 'jpg'}`,
    }))
    .filter((job) => Boolean(job.url));
}

export interface DownloadProgress {
  done: number;
  total: number;
}

export interface DownloadResult {
  ok: number;
  failed: number;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(proxiedForDownload(url));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Baixa os arquivos. Um arquivo sai direto; vários viram um único .zip
 * (evita o navegador bloquear vários downloads seguidos).
 */
export async function downloadJobs(
  jobs: DownloadJob[],
  zipName: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<DownloadResult> {
  const total = jobs.length;
  if (total === 0) return { ok: 0, failed: 0 };
  onProgress?.({ done: 0, total });

  if (total === 1) {
    const [job] = jobs;
    try {
      const bytes = await fetchBytes(job.url);
      downloadBlob(new Blob([bytes]), job.filename);
      onProgress?.({ done: 1, total });
      return { ok: 1, failed: 0 };
    } catch {
      // Último recurso: abre o arquivo para o usuário salvar manualmente.
      window.open(job.url, '_blank', 'noopener,noreferrer');
      return { ok: 0, failed: 1 };
    }
  }

  const files: Record<string, [Uint8Array, { level: 0 }]> = {};
  let done = 0;
  let failed = 0;
  const queue = [...jobs];
  const CONCURRENCY = 3;

  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        // level 0: fotos e vídeos já são comprimidos, só empacotamos.
        files[job.filename] = [await fetchBytes(job.url), { level: 0 }];
      } catch {
        failed += 1;
      }
      done += 1;
      onProgress?.({ done, total });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));

  const ok = total - failed;
  if (ok > 0) {
    const zipped = zipSync(files);
    downloadBlob(new Blob([zipped], { type: 'application/zip' }), `${sanitize(zipName)}.zip`);
  }
  return { ok, failed };
}
