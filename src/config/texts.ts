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

// Noms des coups spéciaux et répliques : PROVISOIRES, écrits pour tester. À remplacer par le propriétaire.
export const FIGHTER_TEXTS: Record<FighterId, FighterTexts> = {
  aviateur: {
    name: 'Manu Macs', short: 'Manu', katakana: 'マニュ', special: 'Poudre de perlimpinpin',
    specialLines: ['Un nuage doré… et BOUM ! Le public est ébloui !', 'De la poudre aux yeux, et une explosion en prime !'],
  },
  tailleur: {
    name: 'Narine le Zen', short: 'Narine', katakana: 'ナリーヌ', special: 'Le Déhanché zen',
    specialLines: ['Un petit pas de danse… et le coup de hanche part !', 'Tout en souplesse, tout dans la hanche !'],
  },
  cadet: {
    name: 'Baby', short: 'Baby', katakana: 'ベビー', special: 'La Tournée générale',
    specialLines: ['Cul sec ! Et la pinte finit sur le crâne !', 'C’est sa tournée ! Personne n’a pu refuser !'],
  },
  barbe: {
    name: 'Bompardiou', short: 'Bompardiou', katakana: 'ボンパルディウ', special: 'Le Grand Lancer',
    specialLines: ['La faucille et le marteau tournoient… en plein dans le mille !', 'Un lancer d’outils, du jamais vu dans ce bar !'],
  },
  doyen: {
    name: 'JLM', short: 'JLM', katakana: 'ジェイエルエム', special: 'Le Coup de gueule',
    specialLines: ['Quel coup de gueule ! Les verres ont explosé au fond du bar !', 'Une onde de choc ! On l’a entendu jusqu’au bout de la rue !'],
  },
  binocle: {
    name: 'Jordan', short: 'Jordan', katakana: 'ジョルダン', special: 'Le Vent arrière',
    specialLines: ['Dos tourné… et tir par l’arrière ! Quelle indignité !', 'Ça sent mauvais pour l’adversaire !'],
  },
};

/** Barre Buzz et coup spécial. */
export const BUZZ_TEXTS = {
  /** Sur le bouton « Grosse gifle » quand la barre est pleine, et à côté de la barre. */
  button: 'BUZZ',
  full: 'BUZZ !',
  /** Garde au bon moment pendant le coup spécial. */
  parried: 'PARÉ !',
  tooEarly: 'TROP TÔT !',
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
  buzz: ['Le Buzz est plein ! Attention les yeux !', 'Toute la salle en parle : le Buzz est à fond !', 'Ça buzze, ça buzze ! Le coup spécial est prêt !'],
  parry: ['Paré au dernier moment ! Les dégâts sont limités !', 'Quelle lecture ! Il a senti le coup venir !'],
  special: ['Coup spécial ! On a senti le courant d’air jusqu’au comptoir !', 'Ça, on ne l’apprend dans aucune école !'],
  dodge: ['Esquivé ! La joue a filé comme une savonnette !', 'Il a vu venir la claque !', 'Par-dessous ! La gifle n’a brassé que de l’air !'],
  guard: ['Bloqué ! Une garde en béton armé !', 'Ça tape dans les bras, pas dans la joue !'],
  guardBreak: ['La garde a sauté ! Portes ouvertes !', 'Plus de garde ! La joue est à découvert !'],
  stun: ['Sonné ! Il voit des petits oiseaux !', 'Les jambes en coton ! La jauge va faire n’importe quoi !'],
  ko: ['K.O. ! Appelez le pharmacien du village !', 'Rideau ! Il voit des étoiles !', 'Il est sonné comme une cloche de l’église !'],
  timeUp: ['Terminé ! On compte les joues rouges !', 'Le chrono a parlé !'],
} as const;

export type CommentKind = keyof typeof COMMENTS;
