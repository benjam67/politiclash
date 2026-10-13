// Liste des combattants : coup spécial, voix, boîtes de collision.
// Tous ont le même style de combat (`STYLE` dans `balance.ts`).
// Aucun nom ici : l'habillage (noms, nom du coup spécial, répliques) est dans `texts.ts`,
// les dessins dans `raw/fighters/<id>/` (puis `npm run assets`).
import assets from './assets.json';
import type { SpecialId } from './specials';

/** Rectangle relatif au point d'ancrage (entre les pieds), en px de l'écran logique. */
export interface Box {
  /** Demi-largeur de part et d'autre de l'ancrage. */
  halfW: number;
  /** Hauteur au-dessus des pieds. */
  h: number;
}

export interface FighterDef {
  /** Son coup spécial (voir `specials.ts`). */
  special: SpecialId;
  /** Voix des cris générés en code. */
  voice: 'grave' | 'aigu';
  /** Boîtes de corps : c'est là qu'on peut être touché. Accroupi, on passe sous les gifles hautes. */
  body: { stand: Box; crouch: Box };
}

// Accroupi : 140 px de haut, sous les gifles debout (la grosse gifle frappe à partir de 141 px).
const BODY = { stand: { halfW: 26, h: 230 }, crouch: { halfW: 30, h: 140 } };

export const ROSTER = {
  aviateur: { special: 'poudre', voice: 'grave', body: BODY },
  tailleur: { special: 'danse', voice: 'aigu', body: BODY },
  cadet: { special: 'pinte', voice: 'grave', body: BODY },
  barbe: { special: 'lancer', voice: 'grave', body: BODY },
  doyen: { special: 'hurlement', voice: 'grave', body: BODY },
  binocle: { special: 'vent', voice: 'grave', body: BODY },
} satisfies Record<string, FighterDef>;

export type FighterId = keyof typeof ROSTER;
export const FIGHTER_IDS = Object.keys(ROSTER) as FighterId[];
/** Combattants proposés au joueur (écran de sélection, écran titre, adversaire au hasard). */
export const PLAYABLE_IDS: FighterId[] = [...FIGHTER_IDS];

/** L'écran de sélection prévoit 6 cases ; les cases vides affichent « Bientôt ». */
export const ROSTER_SLOTS = 6;

/** Mesures des images (écrites par `npm run assets`). */
export const spriteOf = (id: FighterId) => assets.fighters[id];
