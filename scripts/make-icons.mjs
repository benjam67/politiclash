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

// Icônes d'onglet : favicon.ico (16, 32 et 48 px, images PNG dans le fichier .ico) et favicon-32.png,
// à la racine du site (certains navigateurs et services demandent /favicon.ico d'office).
const PUB = path.join(ROOT, 'public');
const sizes = [16, 32, 48];
const pngs = [];
// Le logo est un bandeau : à 16 ou 32 px il devient illisible. On garde un carré centré sur le boxeur,
// bord à bord, coins arrondis.
const side = meta.height;
// Cadré sur la tête et le gant, un peu à droite du centre, pour garder du bleu et du rouge.
const square = await sharp(SRC).extract({ left: Math.round(meta.width * 0.36), top: 0, width: side, height: side }).png().toBuffer();
for (const s of sizes) {
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><rect width="${s}" height="${s}" rx="${s * 0.2}"/></svg>`);
  const png = await sharp(square).resize(s, s, { kernel: 'lanczos3' }).composite([{ input: mask, blend: 'dest-in' }]).png({ compressionLevel: 9 }).toBuffer();
  pngs.push(png);
  if (s === 32) fs.writeFileSync(path.join(OUT, 'favicon-32.png'), png);
}
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(s, e);
  head.writeUInt8(s, e + 1);
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
fs.writeFileSync(path.join(PUB, 'favicon.ico'), Buffer.concat([head, ...pngs]));
