// ─────────────────────────────────────────────────────────────────────────────
// TOUS LES TEXTES DU JEU : noms, surnoms, coups spéciaux, répliques.
//
// Ce fichier appartient au propriétaire du projet : c'est ici (et dans le dossier
// d'images `raw/`) que se fait l'habillage des combattants. Rien d'autre à toucher.
// Le reste du code ne contient aucun nom de personnage.
// ─────────────────────────────────────────────────────────────────────────────
import type { FighterId } from './roster';
import type { StageId } from './stages';

/** Titre du jeu. À reporter aussi dans `index.html` et `public/manifest.webmanifest`. */
export const GAME = {
  title: 'POLITICLASH',
  /** Sous-titre décoratif en katakana. */
  titleKana: 'ポリティクラッシュ',
  tagline: 'Deux joues. Aucun programme.',
};

export interface FighterTexts {
  /** Nom complet, affiché au-dessus de la barre de vie. */
  name: string;
  /** Nom court, pour les annonces (« ROUND POUR … ! »). */
  short: string;
  /** Petit texte décoratif sous le nom. */
  katakana: string;
  /** Nom du coup spécial. */
  special: string;
  /** Répliques du commentateur quand le coup spécial part. */
  specialLines: string[];
}

export const FIGHTER_TEXTS: Record<FighterId, FighterTexts> = {
  bernard: {
    name: 'Big Bernard', short: 'Bernard', katakana: 'ベルナール', special: 'Le Battoir',
    specialLines: ['LE BATTOIR ! Une main comme une pelle à tarte !', 'Le Battoir ! On a senti le courant d’air jusqu’au comptoir !'],
  },
  lola: {
    name: 'Lola Tornade', short: 'Lola', katakana: 'ローラ', special: 'La Toupie',
    specialLines: ['LA TOUPIE ! Elle tourne, elle tourne… et ça claque !', 'Trois claques en une ! La Toupie est lâchée !'],
  },
};

export const STAGE_TEXTS: Record<StageId, { name: string }> = {
  bar: { name: 'Le bar' },
};

/** Noms des niveaux de difficulté. */
export const TEXTS_AI = { easy: 'Facile', normal: 'Normal', hard: 'Difficile' };

/** Phrases du commentateur, par situation. Ton absurde et exagéré. */
export const COMMENTS = {
  roundStart: ['Mesdames, messieurs, ça va claquer !', 'Le patron siffle, les joues tremblent !', 'Qui repartira avec la joue en feu ?'],
  crit: ['Il lui a refait le portrait !', 'CLAQUE DU SIÈCLE ! On l’entend jusqu’à la mairie !', 'Une gifle parfaite, à encadrer au-dessus du comptoir !', 'Ça, c’est de la gifle d’artisan !'],
  big: ['Quelle mandale ! Les verres en tremblent !', 'Ça résonne jusqu’au fond de la cave !', 'Ouille ouille ouille, la joue est cuite !'],
  normal: ['Propre, net, sans bavure.', 'Une bonne gifle de comptoir.', 'Ça claque, mais ça tient debout !', 'Joli revers, tout dans le poignet !'],
  grazed: ['Ça a juste effleuré la moustache…', 'Un peu de travers, ça !', 'Un courant d’air, tout au plus.'],
  missed: ['Raté ! Il a giflé l’air du bar !', 'Le ventilateur a pris plus cher que la joue !', 'Visez la joue, pas le plafond !'],
  limp: ['Une gifle molle… le public siffle !', 'C’est une caresse, ça ?', 'Trop lent ! Gifle de dimanche matin.'],
  self: ['Il s’est giflé tout seul ! Magnifique !', 'Surchauffe ! Il se met une claque à lui-même !', 'L’autogifle, une spécialité locale.'],
  rage: ['La rage monte ! Ça va faire très mal…', 'Il voit rouge ! Planquez les verres !', 'Les veines du cou sont sorties !'],
  special: ['Coup spécial ! On a senti le courant d’air jusqu’au comptoir !', 'Ça, on ne l’apprend dans aucune école !'],
  dodge: ['Esquivé ! La joue a filé comme une savonnette !', 'Il a vu venir la claque !', 'Un pas en arrière, et la gifle perd son jus !'],
  guard: ['Bloqué ! Une garde en béton armé !', 'Ça tape dans les bras, pas dans la joue !'],
  guardBreak: ['La garde a sauté ! Portes ouvertes !', 'Plus de garde ! La joue est à découvert !'],
  stun: ['Sonné ! Il voit des petits oiseaux !', 'Les jambes en coton ! La jauge va faire n’importe quoi !'],
  ko: ['K.O. ! Appelez le pharmacien du village !', 'Rideau ! Il voit des étoiles !', 'Il est sonné comme une cloche de l’église !'],
  timeUp: ['Terminé ! On compte les joues rouges !', 'Le chrono a parlé !'],
} as const;

export type CommentKind = keyof typeof COMMENTS;
