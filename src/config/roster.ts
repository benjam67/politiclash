// Liste des combattants : gabarit de jeu, images, boîtes de collision.
// Aucun nom ici : l'habillage (noms, coup spécial) est dans `texts.ts`,
// les dessins dans `raw/fighters/<id>/` (puis `npm run assets`).
import assets from './assets.json';
import type { GabaritId } from './balance';

/** Rectangle relatif au point d'ancrage (entre les pieds), en px de l'écran logique. */
export interface Box {
  /** Demi-largeur de part et d'autre de l'ancrage. */
  halfW: number;
  /** Hauteur au-dessus des pieds. */
  h: number;
}

export interface FighterDef {
  /** Profil de jeu (voir GABARITS dans `balance.ts`). */
  gabarit: GabaritId;
  /** Voix des cris générés en code. */
  voice: 'grave' | 'aigu';
  /** Boîtes de corps (provisoires : réglées pose par pose en phase 2). */
  body: { stand: Box; crouch: Box };
}

export const ROSTER = {
  bernard: {
    gabarit: 'lourd',
    voice: 'grave',
    body: { stand: { halfW: 38, h: 250 }, crouch: { halfW: 42, h: 150 } },
  },
  lola: {
    gabarit: 'rapide',
    voice: 'aigu',
    body: { stand: { halfW: 28, h: 252 }, crouch: { halfW: 32, h: 150 } },
  },
} satisfies Record<string, FighterDef>;

export type FighterId = keyof typeof ROSTER;
export const FIGHTER_IDS = Object.keys(ROSTER) as FighterId[];

/** L'écran de sélection prévoit 6 cases ; les cases vides affichent « Bientôt ». */
export const ROSTER_SLOTS = 6;

/** Mesures des images (écrites par `npm run assets`). */
export const spriteOf = (id: FighterId) => assets.fighters[id];
