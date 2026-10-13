// Le combat : état complet et fonction `step`. Pur et déterministe :
// aucun appel à Phaser, à l'horloge ou à Math.random ; que des entiers.
// Deux exécutions avec les mêmes entrées donnent exactement le même état.
import { ARENA, BIG_SLAP, BUZZ, DIZZY, GUARD, MATCH, MOVEMENT, MOVES, ROUND, SIM, SPECIAL, STYLE, type MoveId } from '../config/balance';
import { ROSTER, type FighterId } from '../config/roster';
import { SPECIALS, type SpecialDef, type SpecialId } from '../config/specials';
import { STAGES, type StageId } from '../config/stages';
import type { Action } from '../config/poses';
import { encodeInput, noInput, type InputFrame } from './input';

/** Les positions sont des entiers en 1/256 de px de l'écran logique. */
export const SUB = 256;
/** Les PV sont des entiers en dixièmes (une grosse gifle chargée à 85 % retire 11,1 PV). */
export const HP = 10;
/** La jauge de garde est comptée en soixantièmes, pour se recharger d'un entier par pas. */
export const GUARD_UNIT = SIM.stepsPerSecond;
/** Durée d'un pas de simulation (ms). */
export const STEP_MS = 1000 / SIM.stepsPerSecond;

export const steps = (ms: number) => Math.round((ms * SIM.stepsPerSecond) / 1000);

export type Stance = 'stand' | 'crouch' | 'jump';
/**
 * Ce que fait le combattant. `free` : il se déplace librement. `attack` : un coup est en cours.
 * `charge` : il arme la grosse gifle. Les autres sont des états subis ou de fin de round,
 * qui durent `left` pas (`recover` : fin d'un coup ; `self` : il s'est giflé lui-même).
 * `buzz` : barre Buzz pleine, il maintient le bouton, le cercle se remplit. `cine` : cinématique d'un coup spécial en cours.
 */
export type Mode = 'free' | 'guard' | 'charge' | 'buzz' | 'cine' | 'attack' | 'recover' | 'hit' | 'block' | 'stun' | 'down' | 'getup' | 'self' | 'ko' | 'win';

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
  /** Pas écoulés depuis le début du coup (`attack`), de la charge (`charge`) ou du cercle (`buzz`). */
  mt: number;
  /** Charge de la grosse gifle, en centièmes de pas à vitesse normale (voir `chargePct`). */
  chg: number;
  /** Pas passés à 100 % de charge (surchauffe au-delà de la tolérance). */
  hot: number;
  /** Pas restants dans un état à durée fixe. */
  left: number;
  /** Coup en cours, ou dernier coup donné (pour l'image affichée). */
  move: MoveId | null;
  /** Le coup en cours a déjà touché ou été bloqué. */
  hitDone: boolean;
  /** Le coup en cours a déjà été esquivé (l'adversaire a déjà gagné son Buzz). */
  dodged: boolean;
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
  /** Barre Buzz, de 0 à `BUZZ.max`. Elle se garde d'un round à l'autre. */
  buzz: number;
  /** Sonné : pas restants pendant lesquels sa jauge de grosse gifle monte de façon irrégulière. */
  dizzy: number;
  /** Vitesse de charge en cours (%) quand il est sonné : elle change tous les quelques pas. */
  wob: number;
  /** Entrées du pas précédent (pour détecter l'appui sur un bouton). */
  prev: number;
  /** Appui sur « Gifle » gardé en mémoire quelques pas : pressé un peu trop tôt, le coup part quand même. */
  buf: number;
  /** Même chose pour le bouton « Pied ». */
  bufKick: number;
}

export type FightEvent =
  | { t: 'round'; n: number }
  | { t: 'fight' }
  | { t: 'swing'; who: 0 | 1; move: MoveId }
  | { t: 'hit'; by: 0 | 1; move: MoveId; dmg: number; crit: boolean; blocked: boolean; /** Il gardait, mais pas à la bonne hauteur. */ wrongGuard: boolean; guardBreak: boolean; knockdown: boolean; x: number; y: number }
  | { t: 'self'; who: 0 | 1; dmg: number }
  | { t: 'ko'; who: 0 | 1 | 2 }
  | { t: 'timeup' }
  | { t: 'roundEnd'; winner: 0 | 1 | 2 }
  | { t: 'matchEnd'; winner: 0 | 1 }
  /** Esquive réussie (accroupi sous une gifle, en l'air au-dessus d'un coup de pied) : +Buzz. */
  | { t: 'dodge'; who: 0 | 1; x: number; y: number }
  | { t: 'buzzFull'; who: 0 | 1 }
  /** Le cercle du Buzz commence à se remplir, ou s'annule (bouton relâché, coup reçu). */
  | { t: 'buzzStart'; who: 0 | 1 }
  | { t: 'buzzCancel'; who: 0 | 1 }
  | { t: 'dizzy'; who: 0 | 1 }
  /** La cinématique du coup spécial de `who` commence. */
  | { t: 'special'; who: 0 | 1; special: SpecialId }
  /** Départ du projectile ou de l'onde (coups à distance). */
  | { t: 'launch'; who: 0 | 1 }
  /** Le signal : la victime `who` doit mettre la garde maintenant. */
  | { t: 'signal'; who: 0 | 1 }
  /** La victime `who` a mis la garde : au bon moment, ou trop tôt / trop tard. */
  | { t: 'parry'; who: 0 | 1; ok: boolean }
  | { t: 'specialHit'; by: 0 | 1; dmg: number; parried: boolean; x: number; y: number }
  | { t: 'cineEnd' };

/** Cinématique d'un coup spécial en cours. Durée fixe, comptée en pas : elle fait partie de la simulation. */
export interface Cine {
  /** Le lanceur. */
  who: 0 | 1;
  special: SpecialId;
  /** Pas écoulés depuis le début. */
  t: number;
  /** Rapprochement des coups de près : position de départ et d'arrivée du lanceur. */
  x0: number;
  x1: number;
  /** Garde au bon moment : 0 pas encore jouée, 1 réussie, 2 ratée (trop tôt, trop tard, ou tenue avant le signal). */
  parry: 0 | 1 | 2;
  /** L'impact a eu lieu. */
  done: boolean;
}

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
  /** Cinématique d'un coup spécial en cours : le chrono et les combattants sont arrêtés. */
  cine: Cine | null;
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
}

const PHYSICS = new Map<FighterId, Physics>();

/** À appeler après avoir modifié le style de combat en cours de route (outils de réglage). */
export const clearPhysicsCache = () => PHYSICS.clear();

/** Valeurs par pas d'un combattant : le style commun, et sa boîte de corps. */
export function physicsOf(id: FighterId): Physics {
  let p = PHYSICS.get(id);
  if (!p) {
    const walk = Math.round((STYLE.walkSpeed * SUB) / SIM.stepsPerSecond);
    p = {
      walk,
      back: Math.round(walk * MOVEMENT.backWalkFactor),
      air: Math.round(walk * MOVEMENT.airSpeedFactor),
      jumpSteps: steps(STYLE.jumpMs),
      halfW: ROSTER[id].body.stand.halfW * SUB,
      chargeSteps: steps(STYLE.chargeTimeMs),
    };
    PHYSICS.set(id, p);
  }
  return p;
}

/** Durées d'un coup, en pas (les mêmes pour tous les combattants). */
export function moveSteps(m: MoveId) {
  return {
    startup: steps(MOVES[m].startupMs),
    active: MOVES[m].activeMs === null ? -1 : steps(MOVES[m].activeMs as number),
    recovery: steps(MOVES[m].recoveryMs),
  };
}

export const GUARD_MAX = GUARD.max * GUARD_UNIT;
export const ROUND_STEPS = MATCH.roundTimeS * SIM.stepsPerSecond;
const OVERHEAT_STEPS = steps(BIG_SLAP.overheatGraceMs);
const BUFFER_STEPS = steps(MOVEMENT.inputBufferMs);
/** Durée du cercle du Buzz, en pas. */
export const BUZZ_STEPS = steps(BUZZ.holdMs);
/** Fenêtre de la garde au bon moment, en pas (6 à 60 pas par seconde). */
export const PARRY_STEPS = steps(SPECIAL.parryWindowMs);
/** Durée du rapprochement des coups spéciaux de près, en pas. */
export const DASH_STEPS = steps(SPECIAL.dashMs);
export const DIZZY_STEPS = steps(DIZZY.ms);

export const stageWidth = (stage: StageId) => STAGES[stage].widthScreens * SIM.screenW * SUB;

function newFighter(id: FighterId, x: number, facing: 1 | -1, buzz = 0): FighterState {
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
    chg: 0,
    hot: 0,
    left: 0,
    move: null,
    hitDone: false,
    dodged: false,
    airUsed: false,
    bigPct: 0,
    bigCrit: false,
    heavy: false,
    kb: 0,
    hp: MATCH.hp * HP,
    guard: GUARD_MAX,
    buzz,
    dizzy: 0,
    wob: 100,
    prev: 0,
    buf: 0,
    bufKick: 0,
  };
}

/** Placement en début de round. La barre Buzz de chacun est gardée d'un round à l'autre. */
function startPositions(left: FighterId, right: FighterId, stage: StageId, buzz: [number, number] = [0, 0]): [FighterState, FighterState] {
  const center = stageWidth(stage) / 2;
  const half = (ARENA.startDistance * SUB) / 2;
  return [newFighter(left, center - half, 1, buzz[0]), newFighter(right, center + half, -1, buzz[1])];
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
    cine: null,
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

const CHARGE_STEPS = steps(STYLE.chargeTimeMs);

/**
 * Charge de la grosse gifle (0–100 %) d'après `chg`, la charge accumulée en centièmes de pas :
 * à vitesse normale, `chg` augmente de 100 par pas maintenu (sonné, de 70 à 130).
 */
export function chargePct(chg: number): number {
  return Math.min(100, Math.floor(chg / CHARGE_STEPS));
}

/** Dégâts (en dixièmes de PV) d'une grosse gifle. */
export function bigDamage(pct: number, crit: boolean): number {
  return Math.round((STYLE.base * HP * pct * (crit ? BIG_SLAP.criticalMultiplier : 1)) / 100);
}

export const inGolden = (pct: number) => pct >= STYLE.goldenZone[0] && pct <= STYLE.goldenZone[1];

/** Dégâts (en dixièmes de PV) d'un coup bloqué : 10 % arrondis au PV, au moins 1 PV. */
export function chipDamage(dmg: number): number {
  return Math.max(GUARD.chipMin, Math.round((dmg * GUARD.chipRatio) / HP)) * HP;
}

/** Tirage aléatoire entier (mulberry32), à partir de l'état du générateur, qu'il fait avancer. */
function rand(r: { v: number }): number {
  r.v = (r.v + 0x6d2b79f5) >>> 0;
  let t = r.v;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Vitesse de charge d'un combattant sonné, en % (100 ± la variance). */
function wobble(r: { v: number }): number {
  const v = Math.round(DIZZY.variance * 100);
  return 100 - v + (rand(r) % (2 * v + 1));
}

function makeDizzy(f: FighterState, who: 0 | 1, r: { v: number }, ev: FightEvent[]) {
  if (f.dizzy <= 0) ev.push({ t: 'dizzy', who });
  f.dizzy = DIZZY_STEPS;
  f.wob = wobble(r);
}

function addBuzz(f: FighterState, gain: number, who: 0 | 1, ev: FightEvent[]) {
  if (gain <= 0 || f.buzz >= BUZZ.max) return;
  f.buzz = Math.min(BUZZ.max, f.buzz + gain);
  if (f.buzz >= BUZZ.max) ev.push({ t: 'buzzFull', who });
}

const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);
const BIT = { gifle: 1 << 4, grosseGifle: 1 << 5, garde: 1 << 6, pied: 1 << 7 };

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
  n.chg = 0;
  n.hot = 0;
  n.left = 0;
  n.move = null;
  n.hitDone = false;
  n.dodged = false;
}

function startAttack(n: FighterState, move: MoveId, who: 0 | 1, ev: FightEvent[]) {
  n.mode = 'attack';
  n.move = move;
  n.mt = 0;
  n.hitDone = false;
  n.dodged = false;
  n.walk = 0;
  ev.push({ t: 'swing', who, move });
}

/** Un pas pour un combattant : états en cours, puis décisions selon les entrées. */
function act(f: FighterState, other: FighterState, input: InputFrame, who: 0 | 1, minX: number, maxX: number, ev: FightEvent[], r: { v: number }): FighterState {
  const p = physicsOf(f.id);
  const n: FighterState = { ...f };
  const now = encodeInput(input);
  const pressed = now & ~f.prev;
  n.prev = now;
  if (pressed & BIT.gifle) n.buf = BUFFER_STEPS;
  else if (n.buf > 0) n.buf -= 1;
  if (pressed & BIT.pied) n.bufKick = BUFFER_STEPS;
  else if (n.bufKick > 0) n.bufKick -= 1;
  const slap = n.buf > 0;
  const kick = n.bufKick > 0;
  if (n.dizzy > 0) n.dizzy -= 1;

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
          if (guarding) {
            n.mode = 'guard';
            n.stance = input.bas ? 'crouch' : 'stand';
          }
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
        const pct = chargePct(n.chg);
        if (pct < BIG_SLAP.minChargePct) {
          toFree(n);
        } else {
          n.bigPct = pct;
          n.bigCrit = inGolden(pct);
          n.chg = 0;
          n.hot = 0;
          startAttack(n, 'big', who, ev);
        }
      } else {
        n.mt += 1;
        // Sonné : la jauge monte de façon irrégulière, sa vitesse change tous les quelques pas.
        if (n.dizzy > 0 && n.mt % DIZZY.changeEverySteps === 0) n.wob = wobble(r);
        n.chg += n.dizzy > 0 ? n.wob : 100;
        if (chargePct(n.chg) >= 100) n.hot += 1;
        if (n.hot > OVERHEAT_STEPS) {
          // Surchauffe : il se gifle lui-même.
          const dmg = BIG_SLAP.selfSlapDamage * HP;
          n.hp = Math.max(0, n.hp - dmg);
          n.mode = 'self';
          n.left = steps(BIG_SLAP.selfSlapMs);
          n.mt = 0;
          n.chg = 0;
          n.hot = 0;
          ev.push({ t: 'self', who, dmg });
        }
      }
      break;
    }

    case 'buzz':
      // Le cercle se remplit tant que le bouton est maintenu ; relâché, rien ne se passe, la barre reste pleine.
      if (!input.grosseGifle) {
        toFree(n);
        ev.push({ t: 'buzzCancel', who });
      } else {
        n.mt += 1;
      }
      break;

    case 'cine':
      break;

    case 'guard':
      faceOther();
      // Garde haute par défaut ; stick vers le bas : garde basse. On peut changer en cours de garde.
      n.stance = input.bas ? 'crouch' : 'stand';
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
        n.stance = input.bas ? 'crouch' : 'stand';
        n.walk = 0;
      } else if (slap) {
        n.buf = 0;
        n.stance = 'stand';
        startAttack(n, 'quick', who, ev);
      } else if (kick) {
        // Coup de pied debout, ou balayette si on est accroupi.
        n.bufKick = 0;
        n.stance = input.bas ? 'crouch' : 'stand';
        startAttack(n, input.bas ? 'sweep' : 'kick', who, ev);
      } else if (pressed & BIT.grosseGifle) {
        // Barre Buzz pleine : le bouton lance le cercle du coup spécial au lieu de la grosse gifle.
        n.mode = n.buzz >= BUZZ.max ? 'buzz' : 'charge';
        n.mt = 0;
        n.chg = 0;
        n.hot = 0;
        n.stance = 'stand';
        n.walk = 0;
        if (n.mode === 'buzz') ev.push({ t: 'buzzStart', who });
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
  const xa = f.x + f.facing * b.x0 * SUB;
  const xb = f.x + f.facing * b.x1 * SUB;
  return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0: f.y + b.y0 * SUB, y1: f.y + b.y1 * SUB };
}

/** Rectangle vulnérable (le corps), ou `null` si le combattant est intouchable. */
export function hurtBox(f: FighterState): Rect | null {
  if (f.mode === 'down' || f.mode === 'getup' || f.mode === 'ko' || f.mode === 'win' || f.mode === 'cine') return null;
  // En garde basse, on protège ses jambes mais la tête reste à portée de gifle : seul l'accroupi « pur » passe dessous.
  const low = f.stance === 'crouch' && f.mode !== 'guard' && f.mode !== 'block';
  const body = ROSTER[f.id].body[low ? 'crouch' : 'stand'];
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
  const dmg = move === 'big' ? bigDamage(att.bigPct, crit) : MOVES[move].damage * HP;
  // Point d'impact : au milieu de la zone commune.
  const x = (Math.max(s.x0, h.x0) + Math.min(s.x1, h.x1)) >> 1;
  const y = (Math.max(s.y0, h.y0) + Math.min(s.y1, h.y1)) >> 1;
  return { dmg, crit, move, x, y };
}

function applyHit(att: FighterState, def: FighterState, hit: Hit, by: 0 | 1, ev: FightEvent[], r: { v: number }): number {
  const victim = by === 0 ? 1 : 0;
  const m = MOVES[hit.move];
  att.hitDone = true;
  const dir = def.x > att.x || (def.x === att.x && att.facing === 1) ? 1 : -1;
  // La garde n'arrête que les coups de sa hauteur : haute contre les gifles, basse contre les coups de pied.
  const guarding = def.mode === 'guard' || def.mode === 'block';
  const rightHeight = (def.stance === 'crouch' ? 'low' : 'high') === m.level;
  const guarded = guarding && rightHeight && !hit.crit;
  const wrongGuard = guarding && !rightHeight;

  if (guarded) {
    const dmg = chipDamage(hit.dmg);
    def.hp = Math.max(0, def.hp - dmg);
    def.guard -= Math.round((GUARD.drainBase * HP + hit.dmg * GUARD.drainPerDamage) * GUARD_UNIT / HP);
    const broken = def.guard <= 0;
    if (broken) {
      def.guard = 0;
      def.mode = 'stun';
      def.left = steps(GUARD.breakStunMs);
      makeDizzy(def, victim, r, ev);
    } else {
      def.mode = 'block';
      def.left = steps(m.hitstunMs * GUARD.blockstunRatio);
    }
    def.kb = dir * ((m.push * SUB) >> 1);
    ev.push({ t: 'hit', by, move: hit.move, dmg, crit: false, blocked: true, wrongGuard: false, guardBreak: broken, knockdown: false, x: hit.x, y: hit.y });
    return steps(m.hitstopMs) >> 1;
  }

  const dmg = hit.dmg;
  const knockdown = hit.move === 'big' && dmg >= BIG_SLAP.knockdownDamage * HP;
  // Le cercle du Buzz est annulé par le coup ; la barre reste pleine.
  if (def.mode === 'buzz') ev.push({ t: 'buzzCancel', who: victim });
  // Un critique traverse la garde.
  const guardBreak = hit.crit && guarding && rightHeight;
  // Après une garde brisée (ou traversée), la jauge repart pleine : sinon le prochain blocage la casserait aussitôt.
  if (guardBreak || def.mode === 'stun') def.guard = GUARD_MAX;
  if (guardBreak || dmg >= DIZZY.threshold * HP) makeDizzy(def, victim, r, ev);
  def.hp = Math.max(0, def.hp - dmg);
  def.chg = 0;
  def.hot = 0;
  def.mode = knockdown ? 'down' : 'hit';
  def.left = knockdown ? steps(BIG_SLAP.knockdownMs) : steps(m.hitstunMs);
  def.heavy = hit.move === 'big';
  def.move = null;
  def.mt = 0;
  def.hitDone = false;
  def.walk = 0;
  if (def.stance === 'crouch') def.stance = 'stand';
  def.kb = dir * m.push * SUB * (knockdown ? 2 : 1);
  ev.push({ t: 'hit', by, move: hit.move, dmg, crit: hit.crit, blocked: false, wrongGuard, guardBreak, knockdown, x: hit.x, y: hit.y });
  // Celui qui touche remplit sa barre Buzz ; celui qui encaisse ou bloque, non.
  addBuzz(att, hit.move === 'big' ? (hit.crit ? BUZZ.critHit : BUZZ.bigHit) : BUZZ.lightHit, by, ev);
  return steps(m.hitstopMs);
}

const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Esquive réussie : le coup de `att` est actif et aurait touché `def` debout au sol, mais `def`
 * passe dessous (accroupi, sans garde, sous une gifle) ou dessus (en l'air, au-dessus d'un coup de pied).
 * Une seule fois par coup. `def` gagne du Buzz.
 */
function checkDodge(att: FighterState, def: FighterState, who: 0 | 1, ev: FightEvent[]) {
  if (att.dodged) return;
  const s = strikeBox(att);
  if (!s || !att.move) return;
  const level = MOVES[att.move].level;
  const ducking = def.stance === 'crouch' && def.mode === 'free' && level === 'high' && att.move !== 'air';
  const hopping = def.stance === 'jump' && level === 'low' && (def.mode === 'free' || def.mode === 'attack');
  if (!ducking && !hopping) return;
  const body = ROSTER[def.id].body.stand;
  const standing: Rect = { x0: def.x - body.halfW * SUB, x1: def.x + body.halfW * SUB, y0: 0, y1: body.h * SUB };
  const now = hurtBox(def);
  if (!overlaps(s, standing) || (now && overlaps(s, now))) return;
  att.dodged = true;
  addBuzz(def, BUZZ.dodge, who, ev);
  ev.push({ t: 'dodge', who, x: def.x, y: def.y + (ducking ? body.h * SUB : 0) });
}

// ── Coup spécial ─────────────────────────────────────────────────────────

export const specialOf = (id: FighterId): SpecialDef => SPECIALS[ROSTER[id].special];

/** Le cercle est complet : la cinématique commence. Les deux combattants sont figés, posés au sol, face à face. */
function startCine(n: FightState, who: 0 | 1) {
  const L = n.f[who];
  const V = n.f[who === 0 ? 1 : 0];
  for (const f of [L, V]) {
    f.mode = 'cine';
    f.stance = 'stand';
    f.y = 0;
    f.t = 0;
    f.vx = 0;
    f.walk = 0;
    f.kb = 0;
    f.move = null;
    f.mt = 0;
    f.chg = 0;
    f.hot = 0;
    f.left = 0;
    f.hitDone = false;
    f.dodged = false;
    f.airUsed = false;
    f.buf = 0;
    f.bufKick = 0;
  }
  const dir = V.x > L.x || (V.x === L.x && L.facing === 1) ? 1 : -1;
  L.facing = dir;
  V.facing = dir === 1 ? -1 : 1;
  const sp = specialOf(L.id);
  // Coup de près : il se colle à l'adversaire. Coup à distance : il reste où il est.
  const contact = physicsOf(L.id).halfW + physicsOf(V.id).halfW + SPECIAL.dashGap * SUB;
  const x1 = sp.range === 'near' ? V.x - dir * contact : L.x;
  const w = stageWidth(n.stage);
  const minX = ARENA.wallMargin * SUB;
  n.cine = { who, special: ROSTER[L.id].special, t: 0, x0: L.x, x1: clamp(x1, minX, w - minX), parry: 0, done: false };
  n.ev.push({ t: 'special', who, special: n.cine.special });
}

/** Un pas de cinématique : déroulé fixe, seule compte la garde de la victime au moment du signal. */
function stepCine(s: FightState, n: FightState, in0: InputFrame, in1: InputFrame): FightState {
  const c: Cine = { ...(s.cine as Cine), t: (s.cine as Cine).t + 1 };
  n.cine = c;
  const lw = c.who;
  const vw = lw === 0 ? 1 : 0;
  const L: FighterState = { ...s.f[lw] };
  const V: FighterState = { ...s.f[vw] };
  n.f = lw === 0 ? [L, V] : [V, L];
  const sp = specialOf(L.id);
  const lin = lw === 0 ? in0 : in1;
  const vin = lw === 0 ? in1 : in0;

  // Garde au bon moment : un appui dans les 6 pas qui suivent le signal. Trop tôt, ou tenue avant : ratée.
  const now = encodeInput(vin);
  const pressedGuard = (now & ~V.prev & BIT.garde) !== 0;
  if (c.parry === 0) {
    if (c.t < sp.signal) {
      if (pressedGuard) c.parry = 2;
    } else if (c.t < sp.signal + PARRY_STEPS) {
      if (pressedGuard) c.parry = 1;
      else if (vin.garde) c.parry = 2;
    } else {
      c.parry = 2;
    }
    if (c.parry !== 0 && pressedGuard) n.ev.push({ t: 'parry', who: vw, ok: c.parry === 1 });
  }
  // Les appuis faits pendant la cinématique ne déclenchent rien à la sortie.
  V.prev = now;
  L.prev = encodeInput(lin);

  if (sp.range === 'near' && c.t <= DASH_STEPS) {
    L.x = c.x0 + (((c.x1 - c.x0) * c.t) / DASH_STEPS | 0);
  }
  if (c.t === sp.launch) n.ev.push({ t: 'launch', who: lw });
  if (c.t === sp.signal) n.ev.push({ t: 'signal', who: vw });

  if (c.t === sp.impact) {
    const parried = c.parry === 1;
    const dmg = (parried ? SPECIAL.parriedDamage : SPECIAL.damage) * HP;
    const r = { v: n.rng };
    V.hp = Math.max(0, V.hp - dmg);
    V.mode = 'down';
    V.left = steps(BIG_SLAP.knockdownMs);
    V.heavy = true;
    if (dmg >= DIZZY.threshold * HP || !parried) makeDizzy(V, vw, r, n.ev);
    n.rng = r.v;
    V.kb = L.facing * SPECIAL.push * SUB;
    L.buzz = 0;
    c.done = true;
    const body = ROSTER[V.id].body.stand;
    n.ev.push({ t: 'specialHit', by: lw, dmg, parried, x: V.x - L.facing * body.halfW * SUB, y: ((body.h * 3) >> 2) * SUB });
    n.hitstop = steps(SPECIAL.hitstopMs);
  } else if (c.done && V.kb !== 0) {
    // La victime est projetée en arrière pendant la fin de la cinématique.
    const minX = ARENA.wallMargin * SUB;
    V.x = clamp(V.x + V.kb, minX, stageWidth(n.stage) - minX);
    V.kb = ((V.kb * 4) / 5) | 0;
  }

  if (c.t >= sp.end || (c.done && V.hp <= 0)) {
    n.cine = null;
    toFree(L);
    n.ev.push({ t: 'cineEnd' });
  }
  if (V.hp <= 0 && !n.cine) {
    n.ev.push({ t: 'ko', who: vw });
    endRound(n, lw);
  }
  return n;
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

  // Cinématique d'un coup spécial : le chrono s'arrête, le déroulé est fixe.
  if (s.cine) return stepCine(s, n, in0, in1);

  const w = stageWidth(s.stage);
  const minX = ARENA.wallMargin * SUB;
  const maxX = w - minX;
  const fighting = s.phase === 'fight';
  const quiet = noInput();
  const r = { v: s.rng };
  const a = act(s.f[0], s.f[1], fighting ? in0 : quiet, 0, minX, maxX, n.ev, r);
  const b = act(s.f[1], s.f[0], fighting ? in1 : quiet, 1, minX, maxX, n.ev, r);
  n.f = [a, b];
  n.pt = s.pt + 1;

  if (fighting) {
    // Les deux coups sont jugés sur le même instant : un échange touche les deux.
    const hitA = findHit(a, b);
    const hitB = findHit(b, a);
    let stop = 0;
    if (hitA) stop = Math.max(stop, applyHit(a, b, hitA, 0, n.ev, r));
    if (hitB) stop = Math.max(stop, applyHit(b, a, hitB, 1, n.ev, r));
    n.hitstop = stop;
    checkDodge(a, b, 1, n.ev);
    checkDodge(b, a, 0, n.ev);
  }
  n.rng = r.v;

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

  // Cercle du Buzz complet (et pas interrompu par un coup à ce pas-ci) : la cinématique commence.
  if (fighting && n.hitstop === 0) {
    const ready = a.mode === 'buzz' && a.mt >= BUZZ_STEPS ? 0 : b.mode === 'buzz' && b.mt >= BUZZ_STEPS ? 1 : -1;
    if (ready >= 0 && a.hp > 0 && b.hp > 0) {
      startCine(n, ready as 0 | 1);
      return n;
    }
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
      n.f = startPositions(a.id, b.id, s.stage, [a.buzz, b.buzz]);
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
      return f.stance === 'crouch' ? 'guardLow' : 'guard';
    case 'charge':
      return 'charge';
    case 'buzz':
      return 'buzzHold';
    case 'cine':
      return 'idle';
    case 'attack':
    case 'recover':
      if (f.move === 'big') return f.mode === 'attack' && f.mt < moveSteps('big').startup ? 'bigSwing' : 'bigSlap';
      if (f.move === 'air') return 'airSlap';
      if (f.move === 'kick') return 'kick';
      if (f.move === 'sweep') return 'crouchKick';
      return 'quickSlap';
    case 'free':
      if (f.stance === 'jump') return 'jump';
      if (f.stance === 'crouch') return 'crouch';
      return f.walk !== 0 ? 'walk' : 'idle';
  }
}

/** Action à afficher pour le combattant `i`, cinématique comprise. */
export function actionIn(s: FightState, i: 0 | 1): Action {
  const f = s.f[i];
  const c = s.cine;
  if (c && f.mode === 'cine') {
    if (c.who !== i) return c.parry === 1 ? 'guard' : 'idle';
    const sp = specialOf(f.id);
    return c.t < sp.poses[0] ? 'special1' : c.t < sp.poses[1] ? 'special2' : 'special3';
  }
  return actionOf(f);
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
