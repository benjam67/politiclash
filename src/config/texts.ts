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
  tagline: 'Deux joues. Un seul fauteuil.',
};

/** Écrans d'accueil, de choix et de fin de match. */
export const SCREENS = {
  play: 'ENTRER EN CAMPAGNE',
  pickFighter: 'QUI SE PRÉSENTE ?',
  pickFoe: 'FACE À QUI ?',
  pickLevel: 'DIFFICULTÉ',
  pickStage: 'OÙ SE TIENT LE DÉBAT ?',
  random: 'TIRAGE AU SORT',
  soon: 'BIENTÔT CANDIDAT',
  soonStage: 'BIENTÔT',
  /** Fin de match. `elected` vient de FIGHTER_TEXTS (ÉLU ou ÉLUE). */
  winner: (short: string, elected: string) => `${short} EST ${elected} !`,
  again: 'NOUVEAU DÉBAT',
  other: 'NOUVELLE CAMPAGNE',
  home: 'ACCUEIL',
};

/** Grandes annonces au centre de l'écran pendant le combat. */
export const ANNOUNCE = {
  round: (n: number) => (n === 1 ? '1ER TOUR' : `${n}E TOUR`),
  final: 'VOTE FINAL',
  fight: 'BAGARRE !',
  ko: 'K.O. !',
  doubleKo: 'DOUBLE K.O. !',
  timeUp: 'BUREAUX FERMÉS !',
  draw: 'RECOMPTAGE DES VOIX !',
  roundFor: (short: string) => `${short} EN TÊTE !`,
  /** Étiquette au-dessus des phrases du commentateur. */
  commentator: 'L’ÉDITORIALISTE',
};

/** Petits mots qui jaillissent sur les coups. */
export const HIT_LABELS = {
  crit: 'CRITIQUE ×2',
  grazed: 'EFFLEURÉE',
  missed: 'PROMESSE NON TENUE…',
  limp: 'GIFLE MOLLE…',
  self: 'DÉRAPAGE !',
  stun: 'DANS LES CHOUX !',
  special: 'SPÉCIALE !',
  dodge: 'LANGUE DE BOIS !',
  perfect: 'PIROUETTE !',
  block: 'VETO !',
  guardBreak: 'MAJORITÉ PERDUE !',
  wrongGuard: 'MAUVAISE GARDE !',
  down: 'CHUTE DANS LES SONDAGES !',
  /** Jauge de la grosse gifle. */
  charging: 'CHARGE…',
  golden: 'PARFAIT !',
  overheat: 'SURCHAUFFE !',
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
  /** Accord pour l'écran de victoire : « MANU EST ÉLU ! », « NARINE EST ÉLUE ! ». */
  elected: 'ÉLU' | 'ÉLUE';
  /** Répliques du commentateur quand le coup spécial part. */
  specialLines: string[];
}

// Noms des coups spéciaux et répliques : choisis par le propriétaire (14 octobre). Répliques dites par l’éditorialiste.
export const FIGHTER_TEXTS: Record<FighterId, FighterTexts> = {
  aviateur: {
    name: 'Manu Macs', short: 'Manu', katakana: 'マニュ', special: 'Poudre de perlimpinpin', elected: 'ÉLU',
    specialLines: ['C’est de la poudre de perlimpinpin !', 'Parce que c’est SON PROJET !'],
  },
  tailleur: {
    name: 'Narine le Zen', short: 'Narine', katakana: 'ナリーヌ', special: 'Coupé-Décalé', elected: 'ÉLUE',
    specialLines: ['C’est entraînant ça… Qu’est-ce que c’est ?', 'Dis donc, ça déménage !'],
  },
  cadet: {
    name: 'Macron Junior', short: 'Macron Junior', katakana: 'マクロン・ジュニア', special: 'La Tournée générale', elected: 'ÉLU',
    specialLines: ['Cul sec ! Et la pinte finit sur le crâne !', 'C’est sa tournée, c’était dans son programme !', 'Promesse tenue !'],
  },
  barbe: {
    name: 'Tête d’Ampoule', short: 'Tête d’Ampoule', katakana: 'テット・ダンプール', special: 'Le Kapital', elected: 'ÉLU',
    specialLines: ['La faucille et le marteau tournoient… en plein dans le mille !', 'C’est pour vous, camarades !'],
  },
  doyen: {
    name: 'Méluche', short: 'Méluche', katakana: 'メルシュ', special: 'La Perquis’', elected: 'ÉLU',
    specialLines: ['La République, c’est lui !', 'Pas besoin de micro, on l’entend jusqu’à l’hémicycle !'],
  },
  binocle: {
    name: 'Jordan Le Mytho', short: 'Jordan Le Mytho', katakana: 'ジョルダン・ル・ミト', special: 'Le Secret de Tolbiac', elected: 'ÉLU',
    specialLines: ['C’était donc vrai !', 'Le secret de Tolbiac est enfin révélé… et ça sent mauvais !'],
  },
};

/** Barre Buzz et coup spécial. */
export const BUZZ_TEXTS = {
  /** Sur le bouton « Grosse gifle » quand la barre est pleine, et à côté de la barre. */
  button: 'BUZZ',
  full: 'BUZZ !',
  /** Garde au bon moment pendant le coup spécial. */
  parried: 'DÉMENTI !',
  tooEarly: 'TROP TÔT !',
};

export const STAGE_TEXTS: Record<StageId, { name: string }> = {
  bar: { name: 'Le Bistro' },
  elysee: { name: 'L’Élysée' },
  republique: { name: 'La République' },
  assemblee: { name: 'L’Assemblée' },
  bastille: { name: 'La Bastille' },
};

/** Noms des niveaux de difficulté. */
export const TEXTS_AI = { easy: 'Municipales', normal: 'Législatives', hard: 'Présidentielle' };

/** Phrases du commentateur, par situation. Ton absurde et exagéré. */
export const COMMENTS = {
  roundStart: ['Les bureaux de vote sont ouverts, les joues aussi !', 'Un seul fauteuil, deux joues à rougir !', 'Débat d’entre-deux-gifles : c’est parti !'],
  crit: ['Une gifle historique, les sondages s’affolent !', 'Celle-là passera au journal de 20 heures !', 'Une claque digne d’un discours d’investiture !'],
  big: ['Quelle mandale ! Dix points de perdus dans les sondages !', 'Ça résonne jusque dans l’hémicycle !'],
  normal: ['Propre, net, sans amendement.', 'Une gifle bien argumentée.', 'Un point de plus dans les intentions de vote !'],
  grazed: ['Une gifle tiède, comme un programme de compromis.', 'Un courant d’air, tout au plus.'],
  missed: ['Une gifle dans le vide, comme une promesse de campagne !', 'Hors sujet ! La joue était juste à côté !'],
  limp: ['C’est une gifle ou une poignée de main ?', 'Une gifle molle… le public réclame un vrai programme !'],
  self: ['Autogifle ! Le dérapage de la campagne !', 'Une gifle contre son propre camp !'],
  buzz: ['Le Buzz est plein ! Les réseaux s’enflamment !', 'Ça tourne en boucle sur les chaînes d’info !'],
  parry: ['Démenti immédiat, les dégâts sont limités !', 'Les éléments de langage étaient prêts !'],
  special: ['Coup spécial ! Ça fera la une demain matin !', 'Ça ne s’apprend dans aucune grande école !'],
  dodge: ['Pas de réponse à la question… ni à la gifle !', 'Esquivé ! Quelle langue de bois !'],
  guard: ['Ça rebondit comme une question gênante !', 'Bloqué ! Une défense en béton armé !'],
  guardBreak: ['La garde a sauté ! La majorité s’effondre !', 'Plus de garde ! Le flanc est à découvert !'],
  stun: ['Sonné ! On voit des sondages défiler !', 'Les jambes en coton, la jauge part dans tous les sens !'],
  ko: ['K.O. ! Campagne terminée !', 'Rideau ! Fin de la course à l’Élysée !', 'Élimination dès ce tour !'],
  timeUp: ['Les bureaux ferment, place au dépouillement !', 'Le chrono a parlé, on compte les joues rouges !'],
} as const;

export type CommentKind = keyof typeof COMMENTS;

/**
 * Tutoriel du premier lancement. Pour chaque exercice : un titre, puis la consigne au doigt (téléphone)
 * et au clavier (ordinateur).
 */
export const TUTORIAL = {
  heading: 'MEDIA TRAINING',
  steps: {
    walk: { title: 'Marche', touch: 'Pousse le stick à gauche ou à droite.', keys: 'Flèches ← → (ou Q et D).' },
    jumpCrouch: { title: 'Saute et accroupis-toi', touch: 'Stick en haut pour sauter, en bas pour t’accroupir.', keys: '↑ pour sauter, ↓ pour t’accroupir.' },
    slap: { title: 'Gifle', touch: 'Approche-toi et touche « Gifle ». Deux fois !', keys: 'Approche-toi et appuie sur J. Deux fois !' },
    kick: { title: 'Coup de pied', touch: 'Touche « Pied » : il frappe bas, sous la garde haute.', keys: 'Appuie sur I : il frappe bas, sous la garde haute.' },
    big: { title: 'Grosse gifle', touch: 'Maintiens « Grosse gifle » et relâche dans la zone dorée.', keys: 'Maintiens K et relâche dans la zone dorée.' },
    guard: { title: 'Garde', touch: 'Il attaque ! Maintiens « Garde » pour bloquer ses gifles.', keys: 'Il attaque ! Maintiens L pour bloquer ses gifles.' },
    buzz: { title: 'Le Buzz', touch: 'Barre Buzz pleine : maintiens « Buzz » jusqu’à remplir le cercle.', keys: 'Barre Buzz pleine : maintiens K jusqu’à remplir le cercle.' },
  },
  good: 'ÇA MARQUE DES POINTS !',
  done: 'CANDIDATURE VALIDÉE !',
  doneHelp: { touch: 'Astuce : stick en bas + « Garde », c’est la garde basse, contre les coups de pied.', keys: 'Astuce : ↓ + L, c’est la garde basse, contre les coups de pied.' },
  skip: 'PASSER',
  go: 'EN CAMPAGNE !',
  /** Bouton de l'accueil pour refaire le tutoriel. */
  replay: 'TUTORIEL',
  /** Sur l'accueil, nombre de victoires contre l'IA. */
  wins: (n: number) => (n === 1 ? '1 élection gagnée' : `${n} élections gagnées`),
};

/** Jeu en ligne. */
export const ONLINE = {
  menuTitle: 'EN LIGNE',
  friends: 'ENTRE AMIS',
  friendsHelp: 'Chacun sur son téléphone, avec un code de salon.',
  quick: 'PRIMAIRE OUVERTE',
  quickSoon: 'Bientôt : contre n’importe qui.',
  pseudoLabel: 'Ton pseudo',
  create: 'CRÉER UN SALON',
  join: 'REJOINDRE',
  go: 'C’EST PARTI',
  share: 'PARTAGER LE LIEN',
  shareText: (code: string) => `Je me présente contre toi ! Viens perdre la présidentielle sur PolitiClash, salon ${code}`,
  copied: 'Lien copié ! Envoie-le à ton adversaire.',
  creating: 'Création du salon…',
  waiting: 'En attente de ton adversaire…',
  joining: (code: string) => `Connexion au salon ${code}…`,
  codeHelp: 'Le code du salon (4 lettres) :',
  errors: {
    badCode: 'Le code fait 4 lettres.',
    'room-not-found': 'Salon introuvable. Vérifie le code.',
    'room-taken': 'Ce code est déjà pris, réessaie.',
    network: 'Pas de connexion au serveur. Vérifie ta connexion et réessaie.',
    'p2p-failed': 'Connexion impossible sur ce réseau. Essayez en Wi-Fi tous les deux.',
  } as Record<string, string>,
  // Salon
  room: (code: string) => `SALON ${code}`,
  stage: 'TERRAIN',
  hostPicksStage: 'L’hôte choisit le terrain',
  ready: 'PRÊT',
  notReady: 'PAS PRÊT',
  isReady: 'PRÊT !',
  waitingThem: 'En attente…',
  quit: '← QUITTER',
  pickFirst: 'Choisis ton combattant.',
  pressReady: 'Appuie sur PRÊT quand tu veux.',
  waitReady: (who: string) => `On attend ${who}…`,
  ping: (ms: number) => `Connexion : ${ms} ms`,
  weak: 'Connexion faible : le jeu pourra ralentir.',
  // Combat
  vs: (who: string) => `EN LIGNE · CONTRE ${who.toUpperCase()}`,
  unstable: 'Connexion instable…',
  paused: 'Connexion coupée',
  pausedHelp: 'On attend ton adversaire, le match reprend tout seul.',
  lostTitle: 'Connexion perdue',
  cancelled: 'Élection annulée.',
  menu: 'MENU',
  // Fin de match
  again: 'NOUVEAU DÉBAT',
  againWait: (who: string) => `On attend ${who}…`,
  againThem: (who: string) => `${who} veut un nouveau débat !`,
  changeFighter: 'CHANGER DE CANDIDAT',
  // Départs
  left: (who: string) => `${who} a retiré sa candidature.`,
  version: 'Vous n’avez pas la même version du jeu. Rechargez la page tous les deux.',
  muteOn: 'Réactions coupées',
  muteOff: 'Réactions',
};

/** Réactions toutes prêtes (pas de chat libre). PROVISOIRES, à remplacer par le propriétaire. */
export const REACTIONS = ['Votez pour moi !', 'Pas de commentaire', 'Bien joué', 'Même pas mal', 'Recomptage !'];
