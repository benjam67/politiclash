// Déroulé des cinématiques des coups spéciaux. Une cinématique fait partie de la simulation :
// sa durée est fixe, comptée en pas (60 par seconde). L'affichage montre les poses et les effets
// d'après ce déroulé ; il ne décide de rien. Aucun nom ici : chaque combattant choisit son coup
// spécial dans `roster.ts`, et son nom affiché est dans `texts.ts`.
//
// Règles communes (dégâts, garde au bon moment, rapprochement) : `SPECIAL` dans `balance.ts`.

/** Effets tracés par le jeu pendant la cinématique (voir `fx/SpecialFx.ts`). */
export type SpecialEffect = 'glitter' | 'dance' | 'beer' | 'shout' | 'throw' | 'wind';

/** Accessoires dessinés par le propriétaire (`raw/props/<nom>.png`). En attendant, le jeu en dessine un provisoire. */
export const PROP_FILES = ['caca', 'faucille-marteau'] as const;
export type PropFile = (typeof PROP_FILES)[number];

export interface SpecialDef {
  /** `near` : le lanceur se colle à l'adversaire au début ; `far` : il reste où il est. */
  range: 'near' | 'far';
  /** Pose 1 jusqu'au pas `poses[0]`, pose 2 jusqu'au pas `poses[1]`, puis pose 3 jusqu'à la fin. */
  poses: [number, number];
  /** Coup à distance : départ du projectile ou de l'onde (pas). Il arrive sur la victime à l'impact. */
  launch?: number;
  /** Le signal (éclair et son sec) : la victime a `SPECIAL.parryWindowMs` pour mettre la garde. */
  signal: number;
  /** L'impact : 35 PV, ou 18 avec une garde au bon moment. */
  impact: number;
  /** Fin de la cinématique : chacun reprend la main. */
  end: number;
  effect: SpecialEffect;
  /** Projectile : l'accessoire dessiné, s'il y en a un. */
  prop?: PropFile;
  /** Le projectile tournoie en vol. */
  spin?: boolean;
}

export const SPECIALS = {
  /** Poudre dans la main, souffle (nuage de paillettes dorées), face au public bras levés : explosion dorée. */
  poudre: { range: 'near', poses: [24, 52], signal: 60, impact: 68, end: 108, effect: 'glitter' },
  /** Petite danse en deux temps, puis coup de hanche : étoiles et recul. */
  danse: { range: 'near', poses: [26, 50], signal: 52, impact: 60, end: 100, effect: 'dance' },
  /** Sort une pinte, la boit cul sec, la casse sur la tête : mousse et éclats de verre. */
  pinte: { range: 'near', poses: [28, 56], signal: 58, impact: 66, end: 104, effect: 'beer' },
  /** Inspire, puis hurle : une onde de choc traverse l'écran et repousse l'adversaire. */
  hurlement: { range: 'far', poses: [30, 58], launch: 32, signal: 50, impact: 58, end: 100, effect: 'shout' },
  /** Élan, lancer d'une faucille et d'un marteau qui tournoient, puis fierté. */
  lancer: { range: 'far', poses: [30, 60], launch: 32, signal: 54, impact: 62, end: 104, effect: 'throw', prop: 'faucille-marteau', spin: true },
  /** Se retourne, dos à l'adversaire, tir par les fesses avec un petit nuage, puis se redresse. */
  vent: { range: 'far', poses: [22, 64], launch: 34, signal: 52, impact: 60, end: 104, effect: 'wind', prop: 'caca', spin: true },
} satisfies Record<string, SpecialDef>;

export type SpecialId = keyof typeof SPECIALS;
export const specialDef = (id: SpecialId): SpecialDef => SPECIALS[id];
