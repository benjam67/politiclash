// Image d'aperçu des liens partagés (WhatsApp, Messages, réseaux) : public/share.jpg, 1200 × 630.
// Décor de l'Assemblée assombri, les six candidats en garde (ceux de droite en miroir, face au centre), le logo au-dessus.
// Usage : npm run share (après `npm run assets`, car l'image part des poses optimisées).
import sharp from 'sharp';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const W = 1200;
const H = 630;
const pub = (...p) => path.join(ROOT, 'public', ...p);

// Ordre de gauche à droite ; les trois derniers sont retournés pour faire face au centre.
const FIGHTERS = ['tailleur', 'doyen', 'aviateur', 'barbe', 'binocle', 'cadet'];

const bg = await sharp(pub('assets/stages/assemblee/decor.webp'))
  .resize(W, H, { fit: 'cover', position: 'centre' })
  .modulate({ brightness: 0.55, saturation: 0.9 })
  .toBuffer();

const layers = [];

// Bandeau tricolore en bas.
layers.push({
  input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></linearGradient></defs>
    <rect y="${H * 0.45}" width="${W}" height="${H * 0.55}" fill="url(#g)"/>
    <rect y="${H - 14}" width="${W / 3}" height="14" fill="#002654"/>
    <rect x="${W / 3}" y="${H - 14}" width="${W / 3}" height="14" fill="#FFFFFF"/>
    <rect x="${(2 * W) / 3}" y="${H - 14}" width="${W / 3}" height="14" fill="#CE1126"/>
  </svg>`),
  left: 0,
  top: 0,
});

// Les combattants : même échelle pour tous, pieds sur une même ligne.
const fh = 360; // hauteur de l'image d'une pose
const step = 190;
const x0 = (W - step * (FIGHTERS.length - 1)) / 2;
for (const [i, id] of FIGHTERS.entries()) {
  let img = sharp(pub('assets/fighters', id, 'idle.webp')).resize({ height: fh });
  if (i >= FIGHTERS.length / 2) img = img.flop();
  const buf = await img.png().toBuffer();
  const { width } = await sharp(buf).metadata();
  layers.push({ input: buf, left: Math.round(x0 + i * step - width / 2), top: H - 14 - fh + 4 });
}

// Le logo dans un cadre blanc, incliné comme sur l'accueil, et le nom du jeu à côté.
// Le nom utilise la police du jeu (Dela Gothic One) : elle doit être installée sur la machine
// (paquet npm @fontsource/dela-gothic-one : convertir le .woff latin en .ttf, par exemple avec fontTools,
// le copier dans ~/.fonts, puis `fc-cache -f`). Sans elle, le nom sort dans une autre police.
const LW = 400;
const logo = await sharp(path.join(ROOT, 'raw/icons/logo-boxeur.png')).resize({ width: LW, kernel: 'lanczos3' }).png().toBuffer();
const { height: LH } = await sharp(logo).metadata();
const b = 7;
const framed = await sharp({ create: { width: LW + 2 * b, height: LH + 2 * b, channels: 4, background: '#FFFFFF' } })
  .composite([{ input: logo, left: b, top: b }])
  .png()
  .toBuffer();
const tilted = await sharp(framed).rotate(-4, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
layers.push({ input: tilted, left: 60, top: 40 });

const title = (y, text, size) =>
  `<text x="0" y="${y}" font-family="Dela Gothic One" font-size="${size}" fill="#FFFFFF" stroke="#002654" stroke-width="10" paint-order="stroke" stroke-linejoin="round">${text}</text>`;
layers.push({
  input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240">
    ${title(100, 'FRANCE', 96)}
    ${title(205, 'BAGARRE', 96)}
  </svg>`),
  left: 540,
  top: 18,
});

await sharp(bg).composite(layers).jpeg({ quality: 82, mozjpeg: true }).toFile(pub('share.jpg'));
console.log('public/share.jpg écrit');
