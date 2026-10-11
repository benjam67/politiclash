// Table « action → image ». Tant qu'une vraie pose n'est pas dessinée, une pose
// existante la remplace (avec un petit effet codé). Quand le dessin arrive :
// déposer le fichier dans `raw/fighters/<id>/`, l'ajouter à POSE_FILES, relancer
// `npm run assets` et changer une ligne ici.
import type { FighterId } from './roster';

/** Images fournies pour chaque combattant (`<pose>.png` dans `raw/fighters/<id>/`). */
export const POSE_FILES = ['idle', 'windup', 'swing', 'slap', 'hit', 'dazed', 'victory', 'selfslap', 'dodge', 'dodge_perfect', 'guard'] as const;
export type PoseFile = (typeof POSE_FILES)[number];
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

/** Poses propres à un combattant, quand elles diffèrent de la table commune. */
const OVERRIDES: Partial<Record<FighterId, Partial<Record<Action, PoseDef>>>> = {};

export const poseFor = (id: FighterId, action: Action): PoseDef => OVERRIDES[id]?.[action] ?? DEFAULT[action];
