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
  /** Allonge : multiplie la portée des coups (1 = portée normale). */
  reach: number;
  /** Boîtes de corps : c'est là qu'on peut être touché. Accroupi, on passe sous les gifles hautes. */
  body: { stand: Box; crouch: Box };
}

export const ROSTER = {
  bernard: {
    gabarit: 'lourd',
    voice: 'grave',
    reach: 1.06,
    body: { stand: { halfW: 36, h: 228 }, crouch: { halfW: 40, h: 140 } },
  },
  lola: {
    gabarit: 'rapide',
    voice: 'aigu',
    reach: 1,
    body: { stand: { halfW: 26, h: 230 }, crouch: { halfW: 30, h: 140 } },
  },
} satisfies Record<string, FighterDef>;

export type FighterId = keyof typeof ROSTER;
export const FIGHTER_IDS = Object.keys(ROSTER) as FighterId[];

/** L'écran de sélection prévoit 6 cases ; les cases vides affichent « Bientôt ». */
export const ROSTER_SLOTS = 6;

/** Mesures des images (écrites par `npm run assets`). */
export const spriteOf = (id: FighterId) => assets.fighters[id];
