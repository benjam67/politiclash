// Table « action → image ». Tant qu'une vraie pose n'est pas dessinée, une pose
// existante la remplace (avec un petit effet codé). Quand le dessin arrive :
// déposer le fichier dans `raw/fighters/<id>/`, l’ajouter à la liste des poses, relancer
// `npm run assets` et changer une ligne ici.
import type { FighterId } from './roster';

/** Premier jeu d'images (11 poses, héritées du premier jeu) : les actions manquantes ont une pose provisoire. */
export const POSES_V1 = ['idle', 'windup', 'swing', 'slap', 'hit', 'dazed', 'victory', 'selfslap', 'dodge', 'dodge_perfect', 'guard'] as const;
/** Jeu complet du guide des dessins : une vraie image pour chaque action. */
export const POSES_FULL = ['idle', 'walk1', 'walk2', 'jump', 'crouch', 'guard', 'guard_low', 'quick', 'air_slap', 'kick', 'crouch_kick', 'windup', 'swing', 'slap', 'special', 'special2', 'selfslap', 'hit', 'hit_heavy', 'down', 'getup', 'dazed', 'victory'] as const;
export type PoseFile = (typeof POSES_V1)[number] | (typeof POSES_FULL)[number];
/** Combattants qui ont le jeu complet. Les autres utilisent le premier jeu. */
const FULL_SET: readonly FighterId[] = ['aviateur', 'tailleur'];
/** Images fournies pour un combattant (`<pose>.png` dans `raw/fighters/<id>/`). */
export const posesOf = (id: FighterId): readonly PoseFile[] => (FULL_SET.includes(id) ? POSES_FULL : POSES_V1);
export const fighterKey = (id: FighterId, pose: PoseFile) => `${id}_${pose}`;

export const ACTIONS = [
  'idle',
  'walk',
  'jump',
  'crouch',
  'guard',
  'guardLow',
  'charge',
  'quickSlap',
  'airSlap',
  'kick',
  'crouchKick',
  'bigSwing',
  'bigSlap',
  'special',
  'selfSlap',
  'hitLight',
  'hitHeavy',
  'down',
  'getup',
  'dazed',
  'victory',
] as const;
export type Action = (typeof ACTIONS)[number];

export interface PoseDef {
  pose: PoseFile;
  /** Seconde image, affichée en alternance avec la première (marche). */
  alt?: PoseFile;
  /** Pose de remplacement, en attendant le vrai dessin. */
  provisional?: boolean;
  /** Petits effets codés appliqués à l'image (surtout pour les poses provisoires). */
  fx?: {
    /** Rebond vertical répété (px écran logique). */
    bob?: number;
    /** Écrasement vertical (1 = normal). */
    squashY?: number;
    /** Inclinaison en degrés, vers l'arrière du perso. */
    tilt?: number;
  };
}

const DEFAULT: Record<Action, PoseDef> = {
  idle: { pose: 'idle' },
  walk: { pose: 'idle', provisional: true, fx: { bob: 4 } },
  jump: { pose: 'idle', provisional: true },
  crouch: { pose: 'idle', provisional: true, fx: { squashY: 0.62 } },
  guard: { pose: 'guard' },
  guardLow: { pose: 'guard', provisional: true, fx: { squashY: 0.74 } },
  charge: { pose: 'windup' },
  quickSlap: { pose: 'slap', provisional: true },
  airSlap: { pose: 'slap', provisional: true },
  // En attendant les dessins : l'ancienne pose d'esquive, jambe en avant, fait office de coup de pied.
  kick: { pose: 'dodge', provisional: true, fx: { tilt: 8 } },
  crouchKick: { pose: 'dodge', provisional: true, fx: { squashY: 0.62 } },
  bigSwing: { pose: 'swing' },
  bigSlap: { pose: 'slap' },
  special: { pose: 'slap', provisional: true },
  selfSlap: { pose: 'selfslap' },
  hitLight: { pose: 'hit' },
  hitHeavy: { pose: 'hit', provisional: true, fx: { tilt: 12 } },
  down: { pose: 'dazed', provisional: true, fx: { tilt: 80 } },
  getup: { pose: 'dazed', provisional: true, fx: { tilt: 30 } },
  dazed: { pose: 'dazed' },
  victory: { pose: 'victory' },
};

/** Table du jeu complet : chaque action a son vrai dessin, sans effet de remplacement. */
const FULL: Record<Action, PoseDef> = {
  idle: { pose: 'idle' },
  walk: { pose: 'walk1', alt: 'walk2' },
  jump: { pose: 'jump' },
  crouch: { pose: 'crouch' },
  guard: { pose: 'guard' },
  guardLow: { pose: 'guard_low' },
  charge: { pose: 'windup' },
  quickSlap: { pose: 'quick' },
  airSlap: { pose: 'air_slap' },
  kick: { pose: 'kick' },
  crouchKick: { pose: 'crouch_kick' },
  bigSwing: { pose: 'swing' },
  bigSlap: { pose: 'slap' },
  special: { pose: 'special' },
  selfSlap: { pose: 'selfslap' },
  hitLight: { pose: 'hit' },
  hitHeavy: { pose: 'hit_heavy' },
  down: { pose: 'down' },
  getup: { pose: 'getup' },
  dazed: { pose: 'dazed' },
  victory: { pose: 'victory' },
};

/** Durée d'affichage de chaque image d'une alternance (marche), en pas de simulation. */
export const ALT_STEPS = 10;

export const poseFor = (id: FighterId, action: Action): PoseDef => (FULL_SET.includes(id) ? FULL : DEFAULT)[action];
