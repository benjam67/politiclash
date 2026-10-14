// Génère les icônes PWA à partir de raw/icons/logo-boxeur.png (le boxeur tricolore du logo France Bagarre),
// et l'image du logo utilisée par le jeu et l'écran « tourne ton téléphone » (public/assets/ui/logo.webp).
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'raw/icons/logo-boxeur.png');
const OUT = path.join(ROOT, 'public/icons');
const UI = path.join(ROOT, 'public/assets/ui');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(UI, { recursive: true });

const NAVY = '#002654';
const meta = await sharp(SRC).metadata();
const ratio = meta.height / meta.width;

/** Fond bleu marine, le logo au centre dans un cadre blanc. `safe` : icône « maskable » (tout tient dans le cercle central). */
async function make(name, size, safe = false, round = true) {
  const w = Math.round(size * (safe ? 0.72 : 0.84));
  const h = Math.round(w * ratio);
  const b = Math.max(2, Math.round(size * 0.022));
  const logo = await sharp(SRC).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer();
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${round ? size * 0.18 : 0}" fill="${NAVY}"/>
    <rect x="${(size - w) / 2 - b}" y="${(size - h) / 2 - b}" width="${w + 2 * b}" height="${h + 2 * b}" rx="${b}" fill="#fff"/>
  </svg>`);
  await sharp(bg)
    .composite([{ input: logo, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, name));
}

await make('icon-192.png', 192);
await make('icon-512.png', 512);
await make('icon-maskable-512.png', 512, true, false);
await make('apple-touch-icon.png', 180, false, false);

// Le logo du jeu, agrandi ×2 pour les écrans à haute densité.
await sharp(SRC).resize(meta.width * 2, meta.height * 2, { kernel: 'lanczos3' }).webp({ quality: 90 }).toFile(path.join(UI, 'logo.webp'));
console.log('icônes et logo générés');
