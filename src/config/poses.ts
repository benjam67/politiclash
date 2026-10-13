// Table « action → image ». Tant qu'une vraie pose n'est pas dessinée, une pose
// existante la remplace (avec un petit effet codé). Quand le dessin arrive :
// déposer le fichier dans `raw/fighters/<id>/` et relancer `npm run assets` :
// les poses présentes sont relevées dans `assets.json`, et prises automatiquement.
import assets from './assets.json';
import type { FighterId } from './roster';

/** Les 21 poses communes, plus les deux anciennes poses de spéciale (`special`, `special2`), fournies pour tous. */
export const POSES_COMMON = ['idle', 'walk1', 'walk2', 'jump', 'crouch', 'guard', 'guard_low', 'quick', 'air_slap', 'kick', 'crouch_kick', 'windup', 'swing', 'slap', 'special', 'special2', 'selfslap', 'hit', 'hit_heavy', 'down', 'getup', 'dazed', 'victory'] as const;
/**
 * Les 3 poses du coup spécial propre à chaque combattant (`special1.png` à `special3.png`).
 * `special2.png` remplace alors l'ancienne pose du même nom. Tant que `special1.png` et `special3.png`
 * ne sont pas là, la cinématique joue les anciennes poses (armement, `special`, `special2`).
 */
export const POSES_SPECIAL = ['special1', 'special2', 'special3'] as const;
/** Poses facultatives : prises si le fichier existe. */
export const POSES_OPTIONAL = ['walk3', 'walk4', 'special1', 'special3'] as const;
export type PoseFile = (typeof POSES_COMMON)[number] | (typeof POSES_SPECIAL)[number] | (typeof POSES_OPTIONAL)[number];

/** Images fournies pour un combattant (relevées par `npm run assets`). */
export const posesOf = (id: FighterId): readonly PoseFile[] => assets.fighters[id].poses as PoseFile[];
export const hasPose = (id: FighterId, pose: PoseFile) => posesOf(id).includes(pose);
/** Le combattant a ses 3 vraies poses de coup spécial. */
export const hasSpecialPoses = (id: FighterId) => hasPose(id, 'special1') && hasPose(id, 'special3');
export const fighterKey = (id: FighterId, pose: PoseFile) => `${id}_${pose}`;

export const ACTIONS = [
  'idle',
  'walk',
  'jump',
  'crouch',
  'guard',
  'guardLow',
  'charge',
  'buzzHold',
  'quickSlap',
  'airSlap',
  'kick',
  'crouchKick',
  'bigSwing',
  'bigSlap',
  'special1',
  'special2',
  'special3',
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
  /** Images suivantes, affichées en alternance avec la première (marche). */
  alt?: PoseFile[];
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

const TABLE: Record<Exclude<Action, 'special1' | 'special2' | 'special3' | 'walk'>, PoseDef> = {
  idle: { pose: 'idle' },
  jump: { pose: 'jump' },
  crouch: { pose: 'crouch' },
  guard: { pose: 'guard' },
  guardLow: { pose: 'guard_low' },
  charge: { pose: 'windup' },
  // Le cercle du Buzz : il arme, en attendant une pose dédiée.
  buzzHold: { pose: 'windup', provisional: true },
  quickSlap: { pose: 'quick' },
  airSlap: { pose: 'air_slap' },
  kick: { pose: 'kick' },
  crouchKick: { pose: 'crouch_kick' },
  bigSwing: { pose: 'swing' },
  bigSlap: { pose: 'slap' },
  selfSlap: { pose: 'selfslap' },
  hitLight: { pose: 'hit' },
  hitHeavy: { pose: 'hit_heavy' },
  down: { pose: 'down' },
  getup: { pose: 'getup' },
  dazed: { pose: 'dazed' },
  victory: { pose: 'victory' },
};

/** Poses provisoires de la cinématique, tant que les trois vraies ne sont pas fournies. */
const SPECIAL_FALLBACK: Record<'special1' | 'special2' | 'special3', PoseFile> = { special1: 'windup', special2: 'special', special3: 'special2' };

/** Durée d'affichage de chaque image d'une alternance (marche), en pas de simulation. */
export const ALT_STEPS = 10;

export function poseFor(id: FighterId, action: Action): PoseDef {
  if (action === 'walk') {
    const more = (['walk3', 'walk4'] as const).filter((p) => hasPose(id, p));
    return { pose: 'walk1', alt: ['walk2', ...more] };
  }
  if (action === 'special1' || action === 'special2' || action === 'special3') {
    return hasSpecialPoses(id) ? { pose: action } : { pose: SPECIAL_FALLBACK[action], provisional: true };
  }
  return TABLE[action];
}

/** Image à afficher au pas `t` d'une alternance. */
export function frameOf(def: PoseDef, t: number): PoseFile {
  if (!def.alt || def.alt.length === 0) return def.pose;
  const all = [def.pose, ...def.alt];
  return all[Math.floor(t / ALT_STEPS) % all.length];
}
