// Le combat : état complet et fonction `step`. Pur et déterministe :
// aucun appel à Phaser, à l'horloge ou à Math.random ; que des entiers.
// Deux exécutions avec les mêmes entrées donnent exactement le même état.
import { ARENA, BIG_SLAP, GABARITS, GUARD, MATCH, MOVEMENT, MOVES, ROUND, SIM, type MoveId } from '../config/balance';
import { ROSTER, type FighterId } from '../config/roster';
import { STAGES, type StageId } from '../config/stages';
import type { Action } from '../config/poses';
import { encodeInput, noInput, type InputFrame } from './input';

/** Les positions sont des entiers en 1/256 de px de l'écran logique. */
export const SUB = 256;
/** Les PV sont des entiers en dixièmes (un coup bloqué de 5 dégâts enlève 0,5 PV). */
export const HP = 10;
/** La jauge de garde est comptée en soixantièmes, pour se recharger d'un entier par pas. */
export const GUARD_UNIT = SIM.stepsPerSecond;
/** Durée d'un pas de simulation (ms). */
export const STEP_MS = 1000 / SIM.stepsPerSecond;

const steps = (ms: number) => Math.round((ms * SIM.stepsPerSecond) / 1000);

export type Stance = 'stand' | 'crouch' | 'jump';
/**
 * Ce que fait le combattant. `free` : il se déplace librement. `attack` : un coup est en cours.
 * `charge` : il arme la grosse gifle. Les autres sont des états subis ou de fin de round,
 * qui durent `left` pas (`recover` : fin d'un coup ; `self` : il s'est giflé lui-même).
 */
export type Mode = 'free' | 'guard' | 'charge' | 'attack' | 'recover' | 'hit' | 'block' | 'stun' | 'down' | 'getup' | 'self' | 'ko' | 'win';

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
  /** Nombre de pas passés dans le saut ou la marche en cours. */
  t: number;
  /** Vitesse horizontale pendant le saut (fixée au décollage). */
  vx: number;
  mode: Mode;
  /** Pas écoulés depuis le début du coup (`attack`) ou de la charge (`charge`). */
  mt: number;
  /** Pas restants dans un état à durée fixe. */
  left: number;
  /** Coup en cours, ou dernier coup donné (pour l'image affichée). */
  move: MoveId | null;
  /** Le coup en cours a déjà touché ou été bloqué. */
  hitDone: boolean;
  /** Une gifle aérienne a déjà été donnée pendant ce saut. */
  airUsed: boolean;
  /** Grosse gifle : charge au relâchement (%), et coup critique (zone dorée). */
  bigPct: number;
  bigCrit: boolean;
  /** Le dernier coup reçu était une grosse gifle (image « coup lourd »). */
  heavy: boolean;
  /** Vitesse de recul après un coup reçu ; elle s'amortit à chaque pas. */
  kb: number;
  /** PV, en dixièmes. */
  hp: number;
  /** Jauge de garde, en soixantièmes. */
  guard: number;
  /** Entrées du pas précédent (pour détecter l'appui sur un bouton). */
  prev: number;
  /** Appui sur « Gifle » gardé en mémoire quelques pas : pressé un peu trop tôt, le coup part quand même. */
  buf: number;
}

export type FightEvent =
  | { t: 'round'; n: number }
  | { t: 'fight' }
  | { t: 'swing'; who: 0 | 1; move: MoveId }
  | { t: 'hit'; by: 0 | 1; move: MoveId; dmg: number; crit: boolean; blocked: boolean; guardBreak: boolean; knockdown: boolean; x: number; y: number }
  | { t: 'self'; who: 0 | 1; dmg: number }
  | { t: 'ko'; who: 0 | 1 | 2 }
  | { t: 'timeup' }
  | { t: 'roundEnd'; winner: 0 | 1 | 2 }
  | { t: 'matchEnd'; winner: 0 | 1 };

/** `intro` : annonce du round. `fight` : on se bat. `roundEnd` : K.O. ou fin du chrono. `matchEnd` : terminé. */
export type Phase = 'intro' | 'fight' | 'roundEnd' | 'matchEnd';

export interface FightState {
  /** Numéro du pas de simulation. */
  step: number;
  /** État du générateur aléatoire (entier 32 bits). */
  rng: number;
  stage: StageId;
  phase: Phase;
  /** Pas écoulés dans la phase en cours. */
  pt: number;
  round: number;
  wins: [number, number];
  /** Temps restant au chrono, en pas. */
  timeLeft: number;
  /** Vainqueur du round qui vient de finir (2 = égalité), puis du match. -1 : pas encore. */
  winner: -1 | 0 | 1 | 2;
  /** Arrêt sur image en cours (pas restants). */
  hitstop: number;
  f: [FighterState, FighterState];
  /** Ce qui s'est passé pendant ce pas (pour les effets et les sons). */
  ev: FightEvent[];
}

interface Physics {
  walk: number;
  back: number;
  air: number;
  jumpSteps: number;
  halfW: number;
  chargeSteps: number;
  /** Résistance en pourcentage entier (85, 110…). */
  resPct: number;
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
      jumpSteps: steps(g.jumpMs),
      halfW: ROSTER[id].body.stand.halfW * SUB,
      chargeSteps: steps(g.chargeTimeMs),
      resPct: Math.round(g.resistance * 100),
    };
    PHYSICS.set(id, p);
  }
  return p;
}

/** Durées d'un coup, en pas. */
export const moveSteps = (m: MoveId) => ({
  startup: steps(MOVES[m].startupMs),
  active: MOVES[m].activeMs === null ? -1 : steps(MOVES[m].activeMs as number),
  recovery: steps(MOVES[m].recoveryMs),
});

export const GUARD_MAX = GUARD.max * GUARD_UNIT;
export const ROUND_STEPS = MATCH.roundTimeS * SIM.stepsPerSecond;
const OVERHEAT_STEPS = steps(BIG_SLAP.overheatGraceMs);
const BUFFER_STEPS = steps(MOVEMENT.inputBufferMs);

export const stageWidth = (stage: StageId) => STAGES[stage].widthScreens * SIM.screenW * SUB;

function newFighter(id: FighterId, x: number, facing: 1 | -1): FighterState {
  return {
    id,
    x,
    y: 0,
    facing,
    stance: 'stand',
    walk: 0,
    t: 0,
    vx: 0,
    mode: 'free',
    mt: 0,
    left: 0,
    move: null,
    hitDone: false,
    airUsed: false,
    bigPct: 0,
    bigCrit: false,
    heavy: false,
    kb: 0,
    hp: MATCH.hp * HP,
    guard: GUARD_MAX,
    prev: 0,
    buf: 0,
  };
}

function startPositions(left: FighterId, right: FighterId, stage: StageId): [FighterState, FighterState] {
  const center = stageWidth(stage) / 2;
  const half = (ARENA.startDistance * SUB) / 2;
  return [newFighter(left, center - half, 1), newFighter(right, center + half, -1)];
}

export function createFight(left: FighterId, right: FighterId, stage: StageId = 'bar', seed = 1): FightState {
  return {
    step: 0,
    rng: seed >>> 0,
    stage,
    phase: 'intro',
    pt: 0,
    round: 1,
    wins: [0, 0],
    timeLeft: ROUND_STEPS,
    winner: -1,
    hitstop: 0,
    f: startPositions(left, right, stage),
    ev: [{ t: 'round', n: 1 }],
  };
}

/** Combat déjà lancé, sans l'annonce du round (tests, entraînement). */
export function createFightStarted(left: FighterId, right: FighterId, stage: StageId = 'bar', seed = 1): FightState {
  return { ...createFight(left, right, stage, seed), phase: 'fight', ev: [] };
}

/** Hauteur du saut au pas `t` sur `n` : une parabole, calculée sans accumulation. */
export function jumpArc(t: number, n: number): number {
  return Math.floor((4 * MOVEMENT.jumpHeight * SUB * t * (n - t)) / (n * n));
}

/** Charge de la grosse gifle (0–100 %) après `mt` pas de maintien. */
export function chargePct(id: FighterId, mt: number): number {
  return Math.min(100, Math.floor((mt * 100) / physicsOf(id).chargeSteps));
}

/** Dégâts (en dixièmes de PV) d'une grosse gifle, avant la résistance de celui qui reçoit. */
export function bigDamage(id: FighterId, pct: number, crit: boolean): number {
  const g = GABARITS[ROSTER[id].gabarit];
  return Math.round((g.base * HP * pct * (crit ? BIG_SLAP.criticalMultiplier : 1)) / 100);
}

const inGolden = (id: FighterId, pct: number) => {
  const [a, b] = GABARITS[ROSTER[id].gabarit].goldenZone;
  return pct >= a && pct <= b;
};

const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);
const BIT = { gifle: 1 << 4, grosseGifle: 1 << 5 };

/** Fait avancer le saut en cours. Renvoie vrai à l'atterrissage. */
function fly(n: FighterState): boolean {
  if (n.stance !== 'jump') return false;
  const p = physicsOf(n.id);
  n.t += 1;
  n.x += n.vx;
  n.y = jumpArc(n.t, p.jumpSteps);
  if (n.t < p.jumpSteps) return false;
  n.stance = 'stand';
  n.y = 0;
  n.t = 0;
  n.vx = 0;
  n.walk = 0;
  n.airUsed = false;
  return true;
}

function toFree(n: FighterState) {
  n.mode = 'free';
  n.mt = 0;
  n.left = 0;
  n.move = null;
  n.hitDone = false;
}

function startAttack(n: FighterState, move: MoveId, who: 0 | 1, ev: FightEvent[]) {
  n.mode = 'attack';
  n.move = move;
  n.mt = 0;
  n.hitDone = false;
  n.walk = 0;
  ev.push({ t: 'swing', who, move });
}

/** Un pas pour un combattant : états en cours, puis décisions selon les entrées. */
function act(f: FighterState, other: FighterState, input: InputFrame, who: 0 | 1, minX: number, maxX: number, ev: FightEvent[]): FighterState {
  const p = physicsOf(f.id);
  const n: FighterState = { ...f };
  const now = encodeInput(input);
  const pressed = now & ~f.prev;
  n.prev = now;
  if (pressed & BIT.gifle) n.buf = BUFFER_STEPS;
  else if (n.buf > 0) n.buf -= 1;
  const slap = n.buf > 0;

  // Recul après un coup reçu.
  if (n.kb !== 0) {
    n.x += n.kb;
    // `| 0` tronque vers zéro sans jamais produire de « -0 » (qui ne survit pas à une copie JSON).
    n.kb = ((n.kb * 4) / 5) | 0;
  }

  const landed = fly(n);
  const grounded = n.stance !== 'jump';
  const faceOther = () => {
    if (other.x > n.x) n.facing = 1;
    else if (other.x < n.x) n.facing = -1;
  };

  switch (n.mode) {
    case 'ko':
    case 'win':
      break;

    case 'hit':
    case 'block':
    case 'stun':
    case 'self':
    case 'recover':
    case 'down':
    case 'getup':
      n.left -= 1;
      if (n.left <= 0 && grounded) {
        if (n.mode === 'down') {
          n.mode = 'getup';
          n.left = steps(BIG_SLAP.getupMs);
        } else {
          if (n.mode === 'stun') n.guard = GUARD_MAX;
          const guarding = n.mode === 'block' && input.garde;
          toFree(n);
          if (guarding) n.mode = 'guard';
        }
      }
      break;

    case 'attack': {
      n.mt += 1;
      const m = moveSteps(n.move as MoveId);
      if (n.move === 'air') {
        if (landed) {
          n.mode = 'recover';
          n.left = m.recovery;
        }
      } else if (n.mt >= m.startup + m.active + m.recovery) {
        toFree(n);
      }
      break;
    }

    case 'charge': {
      if (!input.grosseGifle) {
        const pct = chargePct(n.id, n.mt);
        if (pct < BIG_SLAP.minChargePct) {
          toFree(n);
        } else {
          n.bigPct = pct;
          n.bigCrit = inGolden(n.id, pct);
          startAttack(n, 'big', who, ev);
        }
      } else {
        n.mt += 1;
        if (n.mt > p.chargeSteps + OVERHEAT_STEPS) {
          // Surchauffe : il se gifle lui-même.
          const dmg = BIG_SLAP.selfSlapDamage * HP;
          n.hp = Math.max(0, n.hp - dmg);
          n.mode = 'self';
          n.left = steps(BIG_SLAP.selfSlapMs);
          n.mt = 0;
          ev.push({ t: 'self', who, dmg });
        }
      }
      break;
    }

    case 'guard':
      faceOther();
      if (!input.garde) toFree(n);
      break;

    case 'free':
      if (!grounded) {
        if (slap && !n.airUsed) {
          n.buf = 0;
          n.airUsed = true;
          startAttack(n, 'air', who, ev);
        }
        break;
      }
      faceOther();
      if (input.garde) {
        n.mode = 'guard';
        n.stance = 'stand';
        n.walk = 0;
      } else if (slap) {
        n.buf = 0;
        n.stance = input.bas ? 'crouch' : 'stand';
        startAttack(n, input.bas ? 'crouch' : 'quick', who, ev);
      } else if (pressed & BIT.grosseGifle) {
        n.mode = 'charge';
        n.mt = 0;
        n.stance = 'stand';
        n.walk = 0;
      } else {
        const dir = (input.droite ? 1 : 0) - (input.gauche ? 1 : 0);
        if (input.haut) {
          n.stance = 'jump';
          n.walk = 0;
          n.t = 1;
          n.vx = dir * p.air;
          n.x += n.vx;
          n.y = jumpArc(1, p.jumpSteps);
        } else if (input.bas) {
          n.stance = 'crouch';
          n.walk = 0;
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
      break;
  }

  // La garde se recharge dès qu'on ne s'en sert pas.
  if (n.mode !== 'guard' && n.mode !== 'block' && n.mode !== 'stun' && n.guard < GUARD_MAX) {
    n.guard = Math.min(GUARD_MAX, n.guard + GUARD.regenPerSecond);
  }

  n.x = clamp(n.x, minX, maxX);
  return n;
}

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Rectangle de frappe du coup en cours, s'il est actif et n'a pas encore touché. */
export function strikeBox(f: FighterState): Rect | null {
  if (f.mode !== 'attack' || f.hitDone || !f.move) return null;
  const m = moveSteps(f.move);
  const active = f.move === 'air' ? f.mt >= m.startup && f.stance === 'jump' : f.mt >= m.startup && f.mt < m.startup + m.active;
  if (!active) return null;
  const b = MOVES[f.move].box;
  const reach = ROSTER[f.id].reach;
  const xa = f.x + f.facing * b.x0 * SUB;
  const xb = f.x + f.facing * Math.round(b.x1 * reach) * SUB;
  return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0: f.y + b.y0 * SUB, y1: f.y + b.y1 * SUB };
}

/** Rectangle vulnérable (le corps), ou `null` si le combattant est intouchable. */
export function hurtBox(f: FighterState): Rect | null {
  if (f.mode === 'down' || f.mode === 'getup' || f.mode === 'ko' || f.mode === 'win') return null;
  const body = ROSTER[f.id].body[f.stance === 'crouch' ? 'crouch' : 'stand'];
  return { x0: f.x - body.halfW * SUB, x1: f.x + body.halfW * SUB, y0: f.y, y1: f.y + body.h * SUB };
}

interface Hit {
  dmg: number;
  crit: boolean;
  move: MoveId;
  x: number;
  y: number;
}

/** Le coup de `att` touche-t-il `def` à ce pas ? */
function findHit(att: FighterState, def: FighterState): Hit | null {
  const s = strikeBox(att);
  const h = hurtBox(def);
  if (!s || !h) return null;
  if (s.x0 >= h.x1 || s.x1 <= h.x0 || s.y0 >= h.y1 || s.y1 <= h.y0) return null;
  const move = att.move as MoveId;
  const crit = move === 'big' && att.bigCrit;
  const dmg = move === 'big' ? bigDamage(att.id, att.bigPct, crit) : MOVES[move].damage * HP;
  // Point d'impact : au milieu de la zone commune.
  const x = (Math.max(s.x0, h.x0) + Math.min(s.x1, h.x1)) >> 1;
  const y = (Math.max(s.y0, h.y0) + Math.min(s.y1, h.y1)) >> 1;
  return { dmg, crit, move, x, y };
}

function applyHit(att: FighterState, def: FighterState, hit: Hit, by: 0 | 1, ev: FightEvent[]): number {
  const m = MOVES[hit.move];
  att.hitDone = true;
  const dir = def.x > att.x || (def.x === att.x && att.facing === 1) ? 1 : -1;
  const guarded = (def.mode === 'guard' || def.mode === 'block') && !hit.crit;

  if (guarded) {
    const dmg = Math.round(hit.dmg * GUARD.chipRatio);
    def.hp = Math.max(0, def.hp - dmg);
    def.guard -= Math.round((GUARD.drainBase * HP + hit.dmg * GUARD.drainPerDamage) * GUARD_UNIT / HP);
    const broken = def.guard <= 0;
    if (broken) {
      def.guard = 0;
      def.mode = 'stun';
      def.left = steps(GUARD.breakStunMs);
    } else {
      def.mode = 'block';
      def.left = steps(m.hitstunMs * GUARD.blockstunRatio);
    }
    def.kb = dir * ((m.push * SUB) >> 1);
    ev.push({ t: 'hit', by, move: hit.move, dmg, crit: false, blocked: true, guardBreak: broken, knockdown: false, x: hit.x, y: hit.y });
    return steps(m.hitstopMs) >> 1;
  }

  const dmg = Math.round((hit.dmg * physicsOf(def.id).resPct) / 100);
  const knockdown = hit.move === 'big' && dmg >= BIG_SLAP.knockdownDamage * HP;
  // Un critique traverse la garde et la vide.
  const guardBreak = hit.crit && (def.mode === 'guard' || def.mode === 'block');
  if (guardBreak) def.guard = 0;
  def.hp = Math.max(0, def.hp - dmg);
  def.mode = knockdown ? 'down' : 'hit';
  def.left = knockdown ? steps(BIG_SLAP.knockdownMs) : steps(m.hitstunMs);
  def.heavy = hit.move === 'big';
  def.move = null;
  def.mt = 0;
  def.hitDone = false;
  def.walk = 0;
  if (def.stance === 'crouch') def.stance = 'stand';
  def.kb = dir * m.push * SUB * (knockdown ? 2 : 1);
  ev.push({ t: 'hit', by, move: hit.move, dmg, crit: hit.crit, blocked: false, guardBreak, knockdown, x: hit.x, y: hit.y });
  return steps(m.hitstopMs);
}

function endRound(n: FightState, winner: 0 | 1 | 2) {
  n.phase = 'roundEnd';
  n.pt = 0;
  n.winner = winner;
  if (winner !== 2) n.wins[winner] += 1;
  n.f.forEach((f, i) => {
    if (winner === 2 || i !== winner) {
      if (f.hp <= 0) {
        // Le K.O. projette en arrière : le vainqueur ne cache pas le vaincu.
        const o = n.f[i === 0 ? 1 : 0];
        f.mode = 'ko';
        f.kb = (f.x > o.x || (f.x === o.x && i === 1) ? 1 : -1) * ARENA.koPush * SUB;
      }
      else if (f.mode !== 'down' && f.mode !== 'getup') toFree(f);
    } else {
      f.mode = 'win';
    }
    f.move = null;
    f.walk = 0;
    if (f.stance === 'crouch') f.stance = 'stand';
  });
  n.ev.push({ t: 'roundEnd', winner });
}

/** Avance le combat d'un pas. Ne modifie pas l'état reçu. */
export function step(s: FightState, in0: InputFrame, in1: InputFrame): FightState {
  const n: FightState = { ...s, step: s.step + 1, wins: [s.wins[0], s.wins[1]], ev: [] };

  if (s.phase === 'matchEnd') return n;

  // Arrêt sur image : rien ne bouge, le chrono attend. Les appuis ne sont pas perdus (`prev` n'est pas mis à jour).
  if (s.hitstop > 0) {
    n.hitstop = s.hitstop - 1;
    return n;
  }

  const w = stageWidth(s.stage);
  const minX = ARENA.wallMargin * SUB;
  const maxX = w - minX;
  const fighting = s.phase === 'fight';
  const quiet = noInput();
  const a = act(s.f[0], s.f[1], fighting ? in0 : quiet, 0, minX, maxX, n.ev);
  const b = act(s.f[1], s.f[0], fighting ? in1 : quiet, 1, minX, maxX, n.ev);
  n.f = [a, b];
  n.pt = s.pt + 1;

  if (fighting) {
    // Les deux coups sont jugés sur le même instant : un échange touche les deux.
    const hitA = findHit(a, b);
    const hitB = findHit(b, a);
    let stop = 0;
    if (hitA) stop = Math.max(stop, applyHit(a, b, hitA, 0, n.ev));
    if (hitB) stop = Math.max(stop, applyHit(b, a, hitB, 1, n.ev));
    n.hitstop = stop;
  }

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

  if (s.phase === 'intro') {
    if (n.pt >= steps(ROUND.introMs)) {
      n.phase = 'fight';
      n.pt = 0;
      n.ev.push({ t: 'fight' });
    }
  } else if (fighting) {
    n.timeLeft = s.timeLeft - 1;
    const koA = a.hp <= 0;
    const koB = b.hp <= 0;
    if (koA || koB) {
      n.ev.push({ t: 'ko', who: koA && koB ? 2 : koA ? 0 : 1 });
      endRound(n, koA && koB ? 2 : koA ? 1 : 0);
    } else if (n.timeLeft <= 0) {
      n.timeLeft = 0;
      n.ev.push({ t: 'timeup' });
      endRound(n, a.hp === b.hp ? 2 : a.hp > b.hp ? 0 : 1);
    }
  } else if (s.phase === 'roundEnd' && n.pt >= steps(ROUND.endMs)) {
    const champion = n.wins[0] >= MATCH.roundsToWin ? 0 : n.wins[1] >= MATCH.roundsToWin ? 1 : -1;
    if (champion >= 0) {
      n.phase = 'matchEnd';
      n.pt = 0;
      n.winner = champion as 0 | 1;
      n.ev.push({ t: 'matchEnd', winner: champion as 0 | 1 });
    } else {
      n.phase = 'intro';
      n.pt = 0;
      n.round = s.round + 1;
      n.winner = -1;
      n.timeLeft = ROUND_STEPS;
      n.f = startPositions(a.id, b.id, s.stage);
      n.ev.push({ t: 'round', n: n.round });
    }
  }

  return n;
}

/** Action à afficher pour un combattant (voir `config/poses.ts`). */
export function actionOf(f: FighterState): Action {
  switch (f.mode) {
    case 'ko':
      return f.stance === 'jump' ? 'hitHeavy' : 'dazed';
    case 'win':
      return f.stance === 'jump' ? 'jump' : 'victory';
    case 'down':
      return 'down';
    case 'getup':
      return 'getup';
    case 'stun':
      return 'dazed';
    case 'hit':
      return f.heavy ? 'hitHeavy' : 'hitLight';
    case 'self':
      return 'selfSlap';
    case 'guard':
    case 'block':
      return 'guard';
    case 'charge':
      return 'charge';
    case 'attack':
    case 'recover':
      if (f.move === 'big') return f.mode === 'attack' && f.mt < moveSteps('big').startup ? 'bigSwing' : 'bigSlap';
      if (f.move === 'air') return 'airSlap';
      if (f.move === 'crouch') return 'crouchSlap';
      return 'quickSlap';
    case 'free':
      if (f.stance === 'jump') return 'jump';
      if (f.stance === 'crouch') return 'crouch';
      return f.walk !== 0 ? 'walk' : 'idle';
  }
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
