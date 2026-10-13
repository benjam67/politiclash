// Toutes les valeurs de réglage du jeu. Modifier ici, jamais dans la logique.
// Valeurs de départ de la roadmap : elles seront réglées par simulation (phase 3).
//
// Unités : les distances sont en px d'un écran logique de 844 × 390 (voir SIM),
// les durées en millisecondes. L'affichage convertit vers la taille réelle.

/** Simulation à pas fixe (phase 1). */
export const SIM = {
  stepsPerSecond: 60,
  /** Écran logique : toutes les distances de la logique sont exprimées dans ce repère. */
  screenW: 844,
  screenH: 390,
};

/** Arène et déplacements (px de l'écran logique). */
export const ARENA = {
  /** Distance minimale entre un combattant et le bord du niveau (et de l'écran) : sa silhouette n'est jamais coupée. */
  wallMargin: 140,
  /** Les combattants ne peuvent pas s'éloigner de plus que cette distance : ils tiennent tous les deux à l'écran. */
  maxSeparation: 560,
  /** Distance entre les deux combattants au début du round. */
  startDistance: 250,
  /** Quand deux corps se chevauchent (après un saut), ils s'écartent au plus de cette distance par pas, chacun. */
  pushPerStep: 6,
  /** Recul du combattant mis K.O. : vitesse de départ en px par pas (elle s'amortit ensuite). */
  koPush: 14,
};

export const MOVEMENT = {
  /** Hauteur du sommet du saut. */
  jumpHeight: 95,
  /** Vitesse horizontale en l'air, par rapport à la marche. */
  airSpeedFactor: 1.5,
  /** Vitesse de la marche arrière, par rapport à la marche avant. */
  backWalkFactor: 0.8,
  /** Un appui sur « Gifle » ou « Pied » fait un peu trop tôt (pendant un autre coup) est gardé en mémoire ce temps-là. */
  inputBufferMs: 100,
};

export const MATCH = {
  roundsToWin: 2,
  maxRounds: 3,
  hp: 100,
  /** Durée d'un round, en secondes. À la fin, celui qui a le plus de PV gagne. */
  roundTimeS: 60,
};

/**
 * Le style de combat, commun à tous les combattants (décision du 13 octobre : les anciens
 * gabarits « lourd » et « rapide » sont fusionnés). Seul le coup spécial distingue les combattants
 * (voir `specials.ts`) ; leurs boîtes de corps peuvent varier pour coller aux dessins (`roster.ts`).
 */
export const STYLE = {
  /** Vitesse de marche (px/s). */
  walkSpeed: 200,
  /** Durée totale d'un saut (ms). */
  jumpMs: 600,
  /** Base B de la formule de dégâts de la grosse gifle. */
  base: 13,
  /** Temps (ms) pour que la jauge monte de 0 à 100 %. */
  chargeTimeMs: 1200,
  /** Zone dorée [min, max] en % de charge. */
  goldenZone: [78, 90] as [number, number],
};

/** Rectangle de frappe, relatif à l'ancrage du combattant : x vers l'avant, y au-dessus des pieds (px logiques). */
export interface HitBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface MoveDef {
  startupMs: number;
  /** `null` = actif jusqu'à l'atterrissage. */
  activeMs: number | null;
  recoveryMs: number;
  /** Dégâts (la grosse gifle les calcule avec sa formule). */
  damage: number;
  /** Durée pendant laquelle l'adversaire touché est figé. */
  hitstunMs: number;
  /** Arrêt sur image au contact. */
  hitstopMs: number;
  /** Recul de l'adversaire touché : vitesse de départ en px par pas (elle s'amortit ensuite). */
  push: number;
  /** Hauteur du coup : une gifle est haute, un coup de pied est bas. La garde doit être à la bonne hauteur. */
  level: 'high' | 'low';
  box: HitBox;
}

/**
 * Durées, dégâts et portée des coups.
 * - Gifles (hautes) : la rapide et la grosse passent au-dessus d'un adversaire accroupi (140 px de haut) ;
 *   l'aérienne le touche. Elles se bloquent avec la garde haute.
 * - Coups de pied (bas) : plus lents, plus longs, ils touchent un adversaire accroupi mais on peut sauter
 *   par-dessus. Ils se bloquent avec la garde basse. `sweep` est le coup de pied donné accroupi (balayette).
 */
export const MOVES = {
  quick: { startupMs: 100, activeMs: 70, recoveryMs: 180, damage: 5, hitstunMs: 250, hitstopMs: 50, push: 3, level: 'high', box: { x0: 15, x1: 96, y0: 150, y1: 215 } },
  air: { startupMs: 120, activeMs: null, recoveryMs: 150, damage: 7, hitstunMs: 300, hitstopMs: 60, push: 4, level: 'high', box: { x0: 0, x1: 86, y0: -20, y1: 110 } },
  kick: { startupMs: 150, activeMs: 80, recoveryMs: 230, damage: 7, hitstunMs: 280, hitstopMs: 60, push: 5, level: 'low', box: { x0: 15, x1: 112, y0: 10, y1: 75 } },
  sweep: { startupMs: 130, activeMs: 70, recoveryMs: 250, damage: 6, hitstunMs: 250, hitstopMs: 50, push: 4, level: 'low', box: { x0: 15, x1: 104, y0: 0, y1: 55 } },
  /** Grosse gifle, après relâchement du bouton. Dégâts selon la formule. */
  big: { startupMs: 60, activeMs: 90, recoveryMs: 350, damage: 0, hitstunMs: 450, hitstopMs: 100, push: 9, level: 'high', box: { x0: 15, x1: 116, y0: 141, y1: 222 } },
} satisfies Record<string, MoveDef>;

export type MoveId = keyof typeof MOVES;

/** Grosse gifle : jauge héritée du premier jeu. */
export const BIG_SLAP = {
  /** Sous cette charge (%), relâcher annule le coup. */
  minChargePct: 20,
  /** Temps passé à 100 % avant de se gifler soi-même. */
  overheatGraceMs: 150,
  selfSlapDamage: 8,
  /** Temps perdu après s'être giflé soi-même. */
  selfSlapMs: 600,
  /** Multiplicateur en zone dorée (brise aussi la garde). */
  criticalMultiplier: 2,
  /** À partir de ces dégâts, l'adversaire est mis à terre. */
  knockdownDamage: 14,
  /** Temps au sol avant le relevé, puis durée du relevé (invulnérable pendant les deux). */
  knockdownMs: 800,
  getupMs: 350,
};

export const GUARD = {
  /** Part des dégâts qui passe à travers la garde (arrondie au PV, au moins `chipMin`). */
  chipRatio: 0.1,
  chipMin: 1,
  /** Jauge de garde : chaque coup bloqué la vide de `drainBase + dégâts × drainPerDamage`. */
  max: 100,
  drainBase: 12,
  drainPerDamage: 2,
  /** Recharge par seconde, hors garde. */
  regenPerSecond: 14,
  /** Durée du blocage, en part du temps de figement du coup. */
  blockstunRatio: 0.6,
  /** Garde brisée : durée pendant laquelle le combattant est sonné. */
  breakStunMs: 1000,
};

/** Déroulement d'un round. */
export const ROUND = {
  /** « ROUND 1 », « BAGARRE ! » : les combattants attendent. */
  introMs: 1900,
  /** Après un K.O. ou la fin du chrono, avant le round suivant. */
  endMs: 2800,
};

/**
 * Sonné : après une garde brisée, ou un coup d'au moins `threshold` dégâts (le coup spécial),
 * la jauge de grosse gifle monte de façon irrégulière pendant `ms`.
 */
export const DIZZY = {
  threshold: 25,
  ms: 3000,
  /** La vitesse de charge varie de ± cette part. */
  variance: 0.3,
  /** Elle change de vitesse tous les … pas de simulation. */
  changeEverySteps: 8,
};

/** Barre Buzz : elle se remplit en attaquant et en esquivant bien (pas en encaissant). */
export const BUZZ = {
  max: 100,
  /** Gifle rapide, gifle aérienne, coup de pied ou balayette qui touche. */
  lightHit: 9,
  /** Grosse gifle qui touche, hors zone dorée. */
  bigHit: 14,
  /** Grosse gifle en zone dorée qui touche. */
  critHit: 25,
  /** Esquive réussie : accroupi sous une gifle, ou en l'air au-dessus d'un coup de pied, pendant que le coup est actif et à portée. */
  dodge: 20,
  /** Durée du cercle à maintenir pour lancer le coup spécial (ms). */
  holdMs: 500,
};

/** Le coup spécial (cinématique) : commun à tous ; le déroulé de chacun est dans `specials.ts`. */
export const SPECIAL = {
  damage: 35,
  /** Dégâts si la victime met la garde juste après le signal. */
  parriedDamage: 18,
  /** Fenêtre de la garde au bon moment, après le signal (ms). */
  parryWindowMs: 100,
  /** Rapprochement des coups spéciaux de près : écart restant entre les deux corps (px), durée (ms). */
  dashGap: 62,
  dashMs: 130,
  /** Recul de la victime à l'impact (px par pas, il s'amortit). */
  push: 16,
  /** Arrêt sur image à l'impact (ms). */
  hitstopMs: 160,
};

/** Mise en scène (proportions relatives à la hauteur de l'écran). */
export const STAGE = {
  /** Hauteur de la silhouette idle des combattants, en fraction de la hauteur d'écran. */
  fighterHeight: 0.6,
  /** Ligne des pieds des combattants, distance au bas de l'écran (fraction de hauteur). */
  fighterFeetFromBottom: 0.045,
  /** Écart entre l'avant des deux combattants au début du round, en fraction de la largeur d'écran. */
  fighterGap: 0.14,
  /** Taille des figurants du décor par rapport aux combattants. */
  crowdRatio: 0.45,
  /** Teinte d'assombrissement des figurants et du personnage central du décor. */
  crowdTint: 0xb3a49c,
  patronTint: 0xd4c6bd,
};
