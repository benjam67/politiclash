import Phaser from 'phaser';
import { COLORS, CSS, FONT_TITLE, FLAG, FLAG_CSS } from './theme';

export interface CardOptions {
  w: number;
  h: number;
  label: string;
  /** Image affichée dans la carte : texture et cadrage (centre et taille du carré à montrer, en px de la texture). */
  image?: { key: string; cx: number; cy: number; size: number; flipX?: boolean };
  /** Grand symbole à la place de l'image (« ? »). */
  symbol?: string;
  color?: number;
  locked?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

/** Carte à gros contour (portrait d'un combattant, vignette d'un niveau, case « Bientôt »). */
export function makeCard(scene: Phaser.Scene, x: number, y: number, name: string, o: CardOptions) {
  const c = scene.add.container(x, y).setName(name);
  const labelH = 38;
  const shadow = scene.add.rectangle(6, 7, o.w, o.h, COLORS.ink, 0.55);
  const bg = scene.add.rectangle(0, 0, o.w, o.h, o.locked ? 0x3a2f45 : (o.color ?? FLAG.white)).setStrokeStyle(o.selected ? 9 : 6, o.selected ? FLAG.red : COLORS.ink);
  c.add([shadow, bg]);

  const boxH = o.h - labelH - 12;
  const boxW = o.w - 16;
  const boxY = -o.h / 2 + 8 + boxH / 2;
  if (o.image) {
    const s = Math.max(boxW, boxH) / o.image.size;
    // On montre un rectangle de la texture, centré sur (cx, cy), qui remplit le cadre de la carte.
    const cw = boxW / s;
    const ch = boxH / s;
    const img = scene.add.image(0, 0, o.image.key).setOrigin(0, 0).setScale(s);
    const tex = img.frame;
    const cx = Phaser.Math.Clamp(o.image.cx, cw / 2, tex.width - cw / 2);
    const cy = Phaser.Math.Clamp(o.image.cy, ch / 2, tex.height - ch / 2);
    img.setCrop(cx - cw / 2, cy - ch / 2, cw, ch);
    img.setPosition(-cx * s, boxY - cy * s);
    if (o.locked) img.setTint(0x554a60);
    c.add(scene.add.rectangle(0, boxY, boxW, boxH, o.locked ? 0x2a2233 : 0x6f8fb0));
    c.add(img);
  } else {
    c.add(scene.add.rectangle(0, boxY, boxW, boxH, o.locked ? 0x2a2233 : COLORS.ink, o.locked ? 1 : 0.85));
    c.add(
      scene.add
        .text(0, boxY, o.symbol ?? '?', { fontFamily: FONT_TITLE, fontSize: `${Math.round(boxH * 0.6)}px`, color: o.locked ? '#5d5268' : FLAG_CSS.white })
        .setOrigin(0.5),
    );
  }
  c.add(scene.add.rectangle(0, boxY, boxW, boxH).setStrokeStyle(4, COLORS.ink));

  const t = scene.add
    .text(0, o.h / 2 - labelH / 2 - 4, o.label, { fontFamily: FONT_TITLE, fontSize: '20px', color: o.locked ? '#8d8299' : CSS.ink })
    .setOrigin(0.5);
  if (t.width > o.w - 18) t.setScale((o.w - 18) / t.width);
  c.add(t);

  if (o.onClick && !o.locked) {
    c.setSize(o.w, o.h).setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => c.setScale(0.95));
    c.on('pointerout', () => c.setScale(1));
    c.on('pointerup', () => {
      c.setScale(1);
      o.onClick!();
    });
  }
  return c;
}
