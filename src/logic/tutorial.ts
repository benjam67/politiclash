// Tutoriel : une suite d'exercices joués dans un vrai combat, contre un partenaire d'entraînement.
// Le moteur ne change pas : le tutoriel lit l'état et les événements de la simulation pour savoir si
// l'exercice est réussi, fait jouer le partenaire, et garde le combat ouvert (PV remis, chrono arrêté).
// Pur, comme la simulation : aucun appel à Phaser ni à l'horloge.
import { BUZZ, MATCH } from '../config/balance';
import { HP, ROUND_STEPS, SUB, type FightState } from './fight';
import { noInput, type InputFrame } from './input';

export const TUTO_STEPS = ['walk', 'jumpCrouch', 'slap', 'kick', 'big', 'guard', 'buzz'] as const;
export type TutoStepId = (typeof TUTO_STEPS)[number];

/** Combien de fois réussir chaque exercice. */
export const TUTO_GOAL: Record<TutoStepId, number> = { walk: 45, jumpCrouch: 2, slap: 2, kick: 2, big: 1, guard: 2, buzz: 1 };

/** Pause « BIEN ! » entre deux exercices, en pas. */
export const TUTO_PAUSE = 70;
/** Le partenaire attaque à ce rythme pendant l'exercice de garde (pas). */
const ATTACK_EVERY = 80;
/** Distance où le partenaire s'arrête pour gifler (px logiques). */
const SLAP_RANGE = 100;

export interface Tuto {
  /** Exercice en cours (index dans TUTO_STEPS) ; TUTO_STEPS.length : terminé. */
  i: number;
  /** Progrès dans l'exercice en cours. */
  n: number;
  /** Exercice « saute et accroupis-toi » : les deux sont faits. */
  jumped: boolean;
  crouched: boolean;
  /** Pas restants dans la pause « BIEN ! » (le prochain exercice commence à 0). */
  pause: number;
  /** Pas écoulés dans l'exercice en cours (rythme du partenaire). */
  t: number;
}

export const createTuto = (): Tuto => ({ i: 0, n: 0, jumped: false, crouched: false, pause: 0, t: 0 });

export const tutoStep = (t: Tuto): TutoStepId | null => TUTO_STEPS[t.i] ?? null;
export const tutoDone = (t: Tuto) => t.i >= TUTO_STEPS.length;
/** Progrès affiché, de 0 à 1. */
export const tutoProgress = (t: Tuto) => {
  const s = tutoStep(t);
  if (!s) return 1;
  if (s === 'jumpCrouch') return (Number(t.jumped) + Number(t.crouched)) / 2;
  return Math.min(1, t.n / TUTO_GOAL[s]);
};

/** Entrées du partenaire d'entraînement (combattant de droite). Il ne bouge pas, sauf pour l'exercice de garde. */
export function tutoPartner(t: Tuto, s: FightState): InputFrame {
  const i = noInput();
  if (s.phase !== 'fight' || t.pause > 0 || tutoStep(t) !== 'guard') return i;
  const me = s.f[1];
  const foe = s.f[0];
  const dx = (foe.x - me.x) / SUB;
  if (Math.abs(dx) > SLAP_RANGE) {
    if (dx < 0) i.gauche = true;
    else i.droite = true;
  } else if (t.t % ATTACK_EVERY === 0) {
    i.gifle = true;
  }
  return i;
}

/**
 * Après un pas de simulation : garde le combat ouvert (PV remis, chrono arrêté, barre Buzz pleine pour
 * le dernier exercice), puis compte ce que le joueur vient de réussir. Rend le nouvel état du tutoriel ;
 * `s` est modifié sur place (c'est l'état que la scène vient de recevoir de la simulation).
 */
export function tutoAfterStep(t0: Tuto, s: FightState): Tuto {
  const t: Tuto = { ...t0 };
  const step = tutoStep(t);

  // Le combat ne se termine jamais pendant le tutoriel.
  s.timeLeft = ROUND_STEPS;
  for (const f of s.f) if (f.hp < MATCH.hp * HP * 0.5 && f.mode !== 'down' && f.mode !== 'cine') f.hp = MATCH.hp * HP;
  if (step === 'buzz' && !s.cine && t.pause === 0) s.f[0].buzz = BUZZ.max;
  else if (step !== 'buzz' && !s.cine) s.f[0].buzz = Math.min(s.f[0].buzz, BUZZ.max - 1);

  if (!step) return t;
  if (t.pause > 0) {
    t.pause -= 1;
    if (t.pause === 0) {
      t.i += 1;
      t.n = 0;
      t.t = 0;
      // La barre Buzz est pleine dès le premier pas de l'exercice : le bouton change tout de suite.
      if (tutoStep(t) === 'buzz' && !s.cine) s.f[0].buzz = BUZZ.max;
    }
    return t;
  }
  if (s.phase !== 'fight') return t;
  t.t += 1;

  const p = s.f[0];
  switch (step) {
    case 'walk':
      if (p.walk !== 0 && p.y === 0) t.n += 1;
      break;
    case 'jumpCrouch':
      if (p.stance === 'jump') t.jumped = true;
      if (p.stance === 'crouch') t.crouched = true;
      t.n = Number(t.jumped) + Number(t.crouched);
      break;
    default:
      for (const e of s.ev) {
        if (step === 'slap' && e.t === 'hit' && e.by === 0 && (e.move === 'quick' || e.move === 'air')) t.n += 1;
        if (step === 'kick' && e.t === 'hit' && e.by === 0 && (e.move === 'kick' || e.move === 'sweep')) t.n += 1;
        if (step === 'big' && e.t === 'hit' && e.by === 0 && e.move === 'big') t.n += 1;
        if (step === 'guard' && e.t === 'hit' && e.by === 1 && e.blocked) t.n += 1;
        if (step === 'buzz' && e.t === 'specialHit' && e.by === 0) t.n += 1;
      }
  }
  if (t.n >= TUTO_GOAL[step]) {
    t.n = TUTO_GOAL[step];
    t.pause = TUTO_PAUSE;
  }
  return t;
}
