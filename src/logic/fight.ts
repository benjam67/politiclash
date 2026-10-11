// Le combat : état complet et fonction `step`. Pur et déterministe :
// aucun appel à Phaser, à l'horloge ou à Math.random ; que des entiers.
// Deux exécutions avec les mêmes entrées donnent exactement le même état.
import { ARENA, GABARITS, MOVEMENT, SIM } from '../config/balance';
import { ROSTER, type FighterId } from '../config/roster';
import { STAGES, type StageId } from '../config/stages';
import type { Action } from '../config/poses';
import type { InputFrame } from './input';

/** Les positions sont des entiers en 1/256 de px de l'écran logique. */
export const SUB = 256;
/** Durée d'un pas de simulation (ms). */
export const STEP_MS = 1000 / SIM.stepsPerSecond;

export type Stance = 'stand' | 'crouch' | 'jump';

export interface FighterState {
  id: FighterId;
  /** Position de l'ancrage (entre les pieds) depuis le bord gauche du niveau. */
  x: number;
  /** Hauteur des pieds au-dessus du sol. */
  y: number;
  /** 1 : regarde vers la droite ; -1 : vers la gauche. */
  facing: 1 | -1;
  stance: Stance;
  /** Marche en cours : 1 vers l'avant, -1 vers l'arrière, 0 à l'arrêt. */
  walk: -1 | 0 | 1;
  /** Nombre de pas passés dans l'action en cours (saut, marche). */
  t: number;
  /** Vitesse horizontale pendant le saut (fixée au décollage). */
  vx: number;
}

export interface FightState {
  /** Numéro du pas de simulation. */
  step: number;
  /** État du générateur aléatoire (entier 32 bits). */
  rng: number;
  stage: StageId;
  f: [FighterState, FighterState];
}

interface Physics {
  walk: number;
  back: number;
  air: number;
  jumpSteps: number;
  halfW: number;
}

const PHYSICS = new Map<FighterId, Physics>();

/** Valeurs par pas d'un combattant, déduites de son gabarit. */
export function physicsOf(id: FighterId): Physics {
  let p = PHYSICS.get(id);
  if (!p) {
    const g = GABARITS[ROSTER[id].gabarit];
    const walk = Math.round((g.walkSpeed * SUB) / SIM.stepsPerSecond);
    p = {
      walk,
      back: Math.round(walk * MOVEMENT.backWalkFactor),
      air: Math.round(walk * MOVEMENT.airSpeedFactor),
      jumpSteps: Math.round((g.jumpMs * SIM.stepsPerSecond) / 1000),
      halfW: ROSTER[id].body.stand.halfW * SUB,
    };
    PHYSICS.set(id, p);
  }
  return p;
}

export const stageWidth = (stage: StageId) => STAGES[stage].widthScreens * SIM.screenW * SUB;

export function createFight(left: FighterId, right: FighterId, stage: StageId = 'bar', seed = 1): FightState {
  const center = stageWidth(stage) / 2;
  const half = (ARENA.startDistance * SUB) / 2;
  const mk = (id: FighterId, x: number, facing: 1 | -1): FighterState => ({ id, x, y: 0, facing, stance: 'stand', walk: 0, t: 0, vx: 0 });
  return { step: 0, rng: seed >>> 0, stage, f: [mk(left, center - half, 1), mk(right, center + half, -1)] };
}

/** Hauteur du saut au pas `t` sur `n` : une parabole, calculée sans accumulation. */
export function jumpArc(t: number, n: number): number {
  return Math.floor((4 * MOVEMENT.jumpHeight * SUB * t * (n - t)) / (n * n));
}

const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);

function moveFighter(f: FighterState, other: FighterState, input: InputFrame, minX: number, maxX: number): FighterState {
  const p = physicsOf(f.id);
  const n: FighterState = { ...f };

  if (n.stance === 'jump') {
    n.t += 1;
    n.x += n.vx;
    n.y = jumpArc(n.t, p.jumpSteps);
    if (n.t >= p.jumpSteps) {
      n.stance = 'stand';
      n.y = 0;
      n.t = 0;
      n.vx = 0;
      n.walk = 0;
    }
  } else {
    // Au sol, on fait toujours face à l'adversaire.
    if (other.x > n.x) n.facing = 1;
    else if (other.x < n.x) n.facing = -1;

    const dir = (input.droite ? 1 : 0) - (input.gauche ? 1 : 0);
    if (input.haut) {
      n.stance = 'jump';
      n.walk = 0;
      n.t = 1;
      n.vx = dir * p.air;
      n.x += n.vx;
      n.y = jumpArc(1, p.jumpSteps);
    } else if (input.bas) {
      if (n.stance !== 'crouch') n.t = 0;
      n.stance = 'crouch';
      n.walk = 0;
      n.t += 1;
    } else {
      const walk = dir === 0 ? 0 : dir === n.facing ? 1 : -1;
      if (n.stance !== 'stand' || walk !== n.walk) n.t = 0;
      n.stance = 'stand';
      n.walk = walk;
      if (walk !== 0) {
        n.x += dir * (walk === 1 ? p.walk : p.back);
        n.t += 1;
      }
    }
  }
  n.x = clamp(n.x, minX, maxX);
  return n;
}

/** Avance le combat d'un pas. Ne modifie pas l'état reçu. */
export function step(s: FightState, in0: InputFrame, in1: InputFrame): FightState {
  const w = stageWidth(s.stage);
  const minX = ARENA.wallMargin * SUB;
  const maxX = w - minX;
  const a = moveFighter(s.f[0], s.f[1], in0, minX, maxX);
  const b = moveFighter(s.f[1], s.f[0], in1, minX, maxX);

  // Deux corps au sol ne se traversent pas : ils s'écartent (en douceur après un saut par-dessus).
  if (a.stance !== 'jump' && b.stance !== 'jump') {
    const minDist = physicsOf(a.id).halfW + physicsOf(b.id).halfW;
    const dx = b.x - a.x;
    const dist = dx < 0 ? -dx : dx;
    if (dist < minDist) {
      // À égalité parfaite, celui de gauche au départ reste à gauche.
      const sign = dx > 0 || (dx === 0 && s.f[0].x <= s.f[1].x) ? 1 : -1;
      const max = ARENA.pushPerStep * SUB;
      const overlap = minDist - dist;
      const pa = Math.min(overlap >> 1, max);
      const pb = Math.min(overlap - (overlap >> 1), max);
      const ax = clamp(a.x - sign * pa, minX, maxX);
      const bx = clamp(b.x + sign * pb, minX, maxX);
      // Contre un mur, l'autre prend le reste du déplacement.
      const lostA = pa - (ax > a.x ? ax - a.x : a.x - ax);
      const lostB = pb - (bx > b.x ? bx - b.x : b.x - bx);
      a.x = clamp(ax - sign * lostB, minX, maxX);
      b.x = clamp(bx + sign * lostA, minX, maxX);
    }
  }

  // Ils ne s'éloignent jamais de plus d'un écran : celui qui s'écarte est retenu.
  const maxSep = ARENA.maxSeparation * SUB;
  const sep = b.x > a.x ? b.x - a.x : a.x - b.x;
  if (sep > maxSep) {
    const sign = b.x > a.x ? 1 : -1;
    const excess = sep - maxSep;
    const outA = Math.max(0, -sign * (a.x - s.f[0].x));
    const outB = Math.max(0, sign * (b.x - s.f[1].x));
    let ra = Math.min(outA, excess >> 1);
    const rb = Math.min(outB, excess - ra);
    ra = Math.min(outA, excess - rb);
    a.x += sign * ra;
    b.x -= sign * rb;
  }

  return { step: s.step + 1, rng: s.rng, stage: s.stage, f: [a, b] };
}

/** Action à afficher pour un combattant (voir `config/poses.ts`). */
export function actionOf(f: FighterState): Action {
  if (f.stance === 'jump') return 'jump';
  if (f.stance === 'crouch') return 'crouch';
  return f.walk !== 0 ? 'walk' : 'idle';
}

/** Empreinte de contrôle de l'état (FNV-1a, 32 bits) : deux états identiques ont la même empreinte. */
export function hashState(s: FightState): number {
  const text = JSON.stringify(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
