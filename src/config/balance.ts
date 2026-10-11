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
};

export const MOVEMENT = {
  /** Hauteur du sommet du saut. */
  jumpHeight: 95,
  /** Vitesse horizontale en l'air, par rapport à la marche. */
  airSpeedFactor: 1.5,
  /** Vitesse de la marche arrière, par rapport à la marche avant. */
  backWalkFactor: 0.8,
};

export const MATCH = {
  roundsToWin: 2,
  maxRounds: 3,
  hp: 100,
  /** Durée d'un round, en secondes. À la fin, celui qui a le plus de PV gagne. */
  roundTimeS: 60,
};

/**
 * Gabarits de combattants : des profils de jeu neutres, sans nom ni visage.
 * Chaque combattant de `roster.ts` choisit un gabarit ; son habillage est dans `texts.ts`.
 */
export interface Gabarit {
  /** Vitesse de marche (px/s). */
  walkSpeed: number;
  /** Durée totale d'un saut (ms). */
  jumpMs: number;
  /** Base B de la formule de dégâts de la grosse gifle. */
  base: number;
  /** Temps (ms) pour que la jauge monte de 0 à 100 %. */
  chargeTimeMs: number;
  /** Zone dorée [min, max] en % de charge. */
  goldenZone: [number, number];
  /** Résistance R_d appliquée aux dégâts reçus. */
  resistance: number;
  /** Mécanique de la gifle spéciale : nombre de gifles et multiplicateur de chacune. */
  special: { hits: number; multiplier: number };
}

export const GABARITS = {
  /** Lent, frappe fort, encaisse. Spéciale : une seule gifle énorme. */
  lourd: { walkSpeed: 160, jumpMs: 650, base: 14, chargeTimeMs: 1400, goldenZone: [80, 90], resistance: 0.85, special: { hits: 1, multiplier: 1.8 } },
  /** Rapide, mobile, fragile. Spéciale : trois gifles enchaînées. */
  rapide: { walkSpeed: 230, jumpMs: 550, base: 11, chargeTimeMs: 1000, goldenZone: [76, 92], resistance: 1.1, special: { hits: 3, multiplier: 0.7 } },
} satisfies Record<string, Gabarit>;

export type GabaritId = keyof typeof GABARITS;

/** Durées et dégâts des coups. `activeMs: null` = actif jusqu'à l'atterrissage. */
export const MOVES = {
  quick: { startupMs: 100, activeMs: 70, recoveryMs: 180, damage: 5, hitstunMs: 250 },
  crouch: { startupMs: 130, activeMs: 70, recoveryMs: 220, damage: 6, hitstunMs: 250 },
  air: { startupMs: 120, activeMs: null, recoveryMs: 150, damage: 7, hitstunMs: 300 },
  /** Grosse gifle, après relâchement du bouton. Dégâts selon la formule. */
  big: { startupMs: 60, activeMs: 90, recoveryMs: 350, hitstunMs: 450 },
} as const;

/** Grosse gifle : jauge héritée du premier jeu. */
export const BIG_SLAP = {
  /** Sous cette charge (%), relâcher annule le coup. */
  minChargePct: 20,
  /** Temps passé à 100 % avant de se gifler soi-même. */
  overheatGraceMs: 150,
  selfSlapDamage: 8,
  /** Multiplicateur en zone dorée (brise aussi la garde). */
  criticalMultiplier: 2,
  /** À partir de ces dégâts, l'adversaire est mis à terre. */
  knockdownDamage: 25,
  /** Temps au sol avant le relevé (invulnérable pendant le relevé). */
  knockdownMs: 800,
};

export const GUARD = {
  /** Part des dégâts qui passe à travers la garde. */
  chipRatio: 0.1,
  /** Garde brisée : durée pendant laquelle le combattant est sonné. */
  breakStunMs: 1000,
};

export const ADVANCED = {
  rageMax: 100,
  ragePerDamage: 1,
  /** Un coup d'au moins ces dégâts sonne la victime. */
  stunThreshold: 25,
  stunMs: 3000,
  stunSpeedVariance: 0.3,
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
