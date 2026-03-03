/**
 * Copia ffmpeg-core.js e ffmpeg-core.wasm de @ffmpeg/core para public/ffmpeg.
 * Permite carregar o FFmpeg pela mesma origem e evita COOP/COEP (que bloqueiam mídia do Instagram).
 */
const fs = require('fs');
const path = require('path');

const corePkg = path.join(process.cwd(), 'node_modules', '@ffmpeg', 'core', 'dist', 'umd');
const destDir = path.join(process.cwd(), 'public', 'ffmpeg');
const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];

if (!fs.existsSync(corePkg)) {
  console.warn('[copy-ffmpeg] @ffmpeg/core não encontrado. Rode: npm install @ffmpeg/core');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
for (const file of files) {
  const src = path.join(corePkg, file);
  const dest = path.join(destDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log('[copy-ffmpeg] Copiado:', file);
  } else {
    console.warn('[copy-ffmpeg] Arquivo não encontrado:', src);
  }
}
