import Phaser from 'phaser';
// Couleurs et polices de l'interface (direction artistique).
export const COLORS = {
  ink: 0x1a1020,
  yellow: 0xffc93c,
  red: 0xe8304a,
  pink: 0xff3d8b,
  cyan: 0x35c8f0,
  cream: 0xfff7e8,
};

/**
 * Couleurs du drapeau tricolore actuel, pour les menus : le bleu marine (retour au bleu
 * foncé historique en 2020, à la place du bleu clair de 1976), le blanc et le rouge.
 */
export const FLAG = { blue: 0x002654, white: 0xffffff, red: 0xce1126 };
export const FLAG_CSS = { blue: '#002654', white: '#FFFFFF', red: '#CE1126' };

/** Bandeau de titre des menus : bleu marine, souligné de blanc et de rouge. */
export function flagBand(scene: Phaser.Scene, x: number, y: number, w: number, h: number, angle: number) {
  const s = Math.max(6, Math.round(h * 0.09));
  return [
    scene.add.rectangle(x, y + h / 2 + s * 1.5, w, s, FLAG.red).setAngle(angle),
    scene.add.rectangle(x, y + h / 2 + s * 0.5, w, s, FLAG.white).setAngle(angle),
    scene.add.rectangle(x, y, w, h, FLAG.blue).setStrokeStyle(7, COLORS.ink).setAngle(angle),
  ];
}

export const CSS = {
  ink: '#1A1020',
  yellow: '#FFC93C',
  red: '#E8304A',
  pink: '#FF3D8B',
  cyan: '#35C8F0',
  cream: '#FFF7E8',
};

export const FONT_TITLE = '"Dela Gothic One", "Arial Black", sans-serif';
export const FONT_UI = '"M PLUS 1p", "Arial", sans-serif';

/** Attend les polices Google (avec un délai maximal) avant de créer des textes. */
export async function loadFonts(timeoutMs = 2500): Promise<void> {
  if (!('fonts' in document)) return;
  // Les polices japonaises sont découpées par plages : on charge celles des caractères utilisés.
  const kana = 'バシッ！ーンペチ…ピシャフランス・ガル';
  const names = 'ベルナールローラ';
  const load = Promise.all([
    document.fonts.load(`40px "Dela Gothic One"`, `AÀÉÎ×${kana}`),
    document.fonts.load(`800 20px "M PLUS 1p"`, `AÀÉÎ’${names}`),
    document.fonts.load(`500 20px "M PLUS 1p"`, `A${names}`),
  ]).catch(() => undefined);
  await Promise.race([load, new Promise((r) => setTimeout(r, timeoutMs))]);
}
