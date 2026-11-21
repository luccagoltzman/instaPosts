import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadJobs, type DownloadJob } from '@/utils/download';

export interface DownloadStatus {
  state: 'running' | 'done' | 'error';
  done: number;
  total: number;
  message: string;
}

const HIDE_AFTER_MS = 4000;

/** Executa downloads (um arquivo ou .zip) e expõe o progresso para a interface. */
export function useDownloader() {
  const [status, setStatus] = useState<DownloadStatus | null>(null);
  const busyRef = useRef(false);
  const hideTimer = useRef<number>();

  const dismiss = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    setStatus((current) => (current?.state === 'running' ? current : null));
  }, []);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  const run = useCallback(async (jobs: DownloadJob[], zipName: string): Promise<boolean> => {
    if (busyRef.current || jobs.length === 0) return false;
    busyRef.current = true;
    window.clearTimeout(hideTimer.current);
    const plural = (n: number) => (n === 1 ? 'arquivo' : 'arquivos');
    setStatus({ state: 'running', done: 0, total: jobs.length, message: 'Preparando download…' });

    try {
      const result = await downloadJobs(jobs, zipName, ({ done, total }) =>
        setStatus({
          state: 'running',
          done,
          total,
          message: total > 1 ? `Baixando ${done} de ${total}…` : 'Baixando…',
        })
      );

      if (result.failed === 0) {
        setStatus({
          state: 'done',
          done: result.ok,
          total: jobs.length,
          message: jobs.length > 1 ? `Pronto! ${result.ok} ${plural(result.ok)} no .zip` : 'Download concluído',
        });
      } else if (result.ok > 0) {
        setStatus({
          state: 'error',
          done: result.ok,
          total: jobs.length,
          message: `${result.ok} ${plural(result.ok)} no .zip · ${result.failed} não puderam ser baixados`,
        });
      } else {
        setStatus({
          state: 'error',
          done: 0,
          total: jobs.length,
          message:
            jobs.length === 1
              ? 'Não deu para baixar direto. Abrimos o arquivo em uma nova aba para você salvar.'
              : 'Não foi possível baixar os arquivos. Tente novamente em instantes.',
        });
      }
      return result.ok > 0;
    } finally {
      busyRef.current = false;
      hideTimer.current = window.setTimeout(() => setStatus(null), HIDE_AFTER_MS);
    }
  }, []);

  return { status, busy: status?.state === 'running', run, dismiss };
}
