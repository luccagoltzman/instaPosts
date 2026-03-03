/**
 * Conversão de vídeo no navegador com FFmpeg.wasm.
 * Presets para TikTok Shop e Shopee Vídeo (9:16, duração e tamanho dentro dos limites).
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const INPUT_NAME = 'input.mp4';
const OUTPUT_NAME = 'output.mp4';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

export type PlatformPreset = 'tiktok' | 'shopee';

/** Carrega o FFmpeg uma vez (lazy). Use ESM no Vite. */
export async function loadFFmpeg(onProgress?: (log: string) => void): Promise<FFmpeg> {
  console.log('[videoConvert] loadFFmpeg chamado');
  if (ffmpegInstance) {
    console.log('[videoConvert] FFmpeg já carregado, reutilizando');
    return ffmpegInstance;
  }
  if (loadPromise) {
    console.log('[videoConvert] Carregamento já em andamento, aguardando...');
    return loadPromise;
  }

  // Core single-thread servido da mesma origem (public/ffmpeg) para não precisar de COOP/COEP,
  // que bloqueiam mídia cross-origin (ex.: Instagram). Arquivos copiados por scripts/copy-ffmpeg.cjs.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const baseURL = origin ? `${origin}/ffmpeg` : 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
  const ffmpeg = new FFmpeg();

  if (onProgress) {
    ffmpeg.on('log', ({ message }) => onProgress(message));
  }

  try {
    let coreURL: string;
    let wasmURL: string;
    if (origin) {
      // Mesma origem: usar toBlobURL para o worker conseguir importar (evita "failed to import ffmpeg-core.js").
      console.log('[videoConvert] Buscando FFmpeg da mesma origem e criando blob URLs...');
      coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
    } else {
      console.log('[videoConvert] Baixando ffmpeg-core.js...');
      coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      console.log('[videoConvert] Baixando ffmpeg-core.wasm...');
      wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
    }
    console.log('[videoConvert] Iniciando ffmpeg.load()...');
    loadPromise = ffmpeg.load({ coreURL, wasmURL });
    ffmpegInstance = await loadPromise;
    console.log('[videoConvert] FFmpeg carregado com sucesso');
    return ffmpegInstance;
  } catch (e) {
    console.error('[videoConvert] Erro ao carregar FFmpeg:', e);
    loadPromise = null;
    throw e;
  }
}

/**
 * Argumentos FFmpeg para cada plataforma.
 * TikTok: 9:16, 1080x1920, até 60s, MP4.
 * Shopee: 9:16, 720x1280, até 60s, MP4, bitrate limitado (~30 MB).
 * Usamos mpeg4 e aac por compatibilidade com o build wasm no navegador.
 */
function getPresetArgs(preset: PlatformPreset): string[] {
  const common = ['-i', INPUT_NAME, '-t', '60', '-movflags', '+faststart'];
  if (preset === 'tiktok') {
    const vf = 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2';
    return [...common, '-vf', vf, '-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'aac', OUTPUT_NAME];
  }
  const vf = 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2';
  return [...common, '-vf', vf, '-c:v', 'mpeg4', '-q:v', '6', '-b:v', '400k', '-maxrate', '500k', '-c:a', 'aac', OUTPUT_NAME];
}

/**
 * Converte o vídeo para o preset da plataforma e retorna o blob MP4.
 * videoUrl deve ser acessível pelo navegador (ex.: URL do proxy).
 */
export async function convertVideoForPlatform(
  preset: PlatformPreset,
  videoUrl: string,
  onProgress?: (log: string) => void
): Promise<Blob> {
  console.log('[videoConvert] convertVideoForPlatform início', { preset, videoUrl: videoUrl.slice(0, 80) + '...' });

  const ffmpeg = await loadFFmpeg(onProgress);
  console.log('[videoConvert] Baixando vídeo (fetchFile)...');
  let data: ArrayBuffer | Uint8Array;
  try {
    data = await fetchFile(videoUrl);
    const sizeBytes = data instanceof ArrayBuffer ? data.byteLength : data.length;
    console.log('[videoConvert] Vídeo baixado, tamanho:', sizeBytes, 'bytes');
  } catch (e) {
    console.error('[videoConvert] Erro ao baixar vídeo (fetchFile):', e);
    throw e;
  }

  console.log('[videoConvert] Escrevendo arquivo no FFmpeg (writeFile)...');
  await ffmpeg.writeFile(INPUT_NAME, data);
  console.log('[videoConvert] writeFile concluído');

  const args = getPresetArgs(preset);
  console.log('[videoConvert] Executando FFmpeg com args:', args);
  try {
    await ffmpeg.exec(args);
    console.log('[videoConvert] ffmpeg.exec concluído');
  } catch (e) {
    console.error('[videoConvert] Erro no ffmpeg.exec:', e);
    throw e;
  }

  console.log('[videoConvert] Lendo arquivo de saída...');
  const output = await ffmpeg.readFile(OUTPUT_NAME);
  await ffmpeg.deleteFile(INPUT_NAME).catch(() => {});
  await ffmpeg.deleteFile(OUTPUT_NAME).catch(() => {});

  const blob = new Blob([output], { type: 'video/mp4' });
  console.log('[videoConvert] Conversão concluída, blob size:', blob.size);
  return blob;
}
