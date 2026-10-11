import { describe, expect, it } from 'vitest';
import { BIG_SLAP, GABARITS, GUARD, MATCH, MOVES, ROUND, SIM } from '../../src/config/balance';
import { ROSTER } from '../../src/config/roster';
import {
  actionOf,
  bigDamage,
  chargePct,
  createFight,
  createFightStarted,
  GUARD_MAX,
  HP,
  moveSteps,
  physicsOf,
  step,
  SUB,
  type FightEvent,
  type FightState,
} from '../../src/logic/fight';
import { mergeInputs, noInput, type InputFrame } from '../../src/logic/input';

const none = noInput();
const press = (...keys: (keyof InputFrame)[]): InputFrame => mergeInputs(Object.fromEntries(keys.map((k) => [k, true])));
const st = (ms: number) => Math.round((ms * SIM.stepsPerSecond) / 1000);

/** Fait tourner le combat en gardant tous les événements. */
function run(s: FightState, n: number, a: InputFrame = none, b: InputFrame = none) {
  const ev: FightEvent[] = [];
  for (let i = 0; i < n; i++) {
    s = step(s, a, b);
    ev.push(...s.ev);
  }
  return { s, ev };
}
const hitsOf = (ev: FightEvent[]) => ev.filter((e): e is Extract<FightEvent, { t: 'hit' }> => e.t === 'hit');

/** Combat lancé, les deux combattants à `dist` px l'un de l'autre. */
function close(left: 'bernard' | 'lola' = 'bernard', right: 'bernard' | 'lola' = 'lola', dist = 80): FightState {
  const s = createFightStarted(left, right);
  const mid = (s.f[0].x + s.f[1].x) / 2;
  s.f[0].x = mid - (dist * SUB) / 2;
  s.f[1].x = mid + (dist * SUB) / 2;
  return s;
}

/** Le joueur 0 charge sa grosse gifle pendant `hold` pas puis relâche ; renvoie l'état et les événements jusqu'à la fin du coup. */
function bigSlap(s: FightState, hold: number, b: InputFrame = none) {
  const charged = run(s, hold + 1, press('grosseGifle'), b);
  const after = run(charged.s, 60, none, b);
  return { s: after.s, ev: [...charged.ev, ...after.ev], charged: charged.s };
}

describe('gifle rapide', () => {
  it('se déroule en trois temps : préparation, coup actif, récupération', () => {
    const m = moveSteps('quick');
    expect([m.startup, m.active, m.recovery]).toEqual([st(100), st(70), st(180)]);
    let s = createFightStarted('bernard', 'lola');
    s = step(s, press('gifle'), none);
    expect(s.f[0].mode).toBe('attack');
    expect(actionOf(s.f[0])).toBe('quickSlap');
    // Bouton maintenu : un seul coup part.
    const total = m.startup + m.active + m.recovery;
    const r = run(s, total, press('gifle'));
    expect(r.s.f[0].mode).toBe('free');
    expect(r.ev.filter((e) => e.t === 'swing')).toHaveLength(0);
  });

  it('touche à portée : dégâts × résistance, adversaire figé et repoussé', () => {
    const { s, ev } = run(close(), 20, press('gifle'));
    const [hit] = hitsOf(ev);
    expect(hitsOf(ev)).toHaveLength(1);
    expect(hit.by).toBe(0);
    expect(hit.blocked).toBe(false);
    expect(hit.dmg / HP).toBeCloseTo(MOVES.quick.damage * GABARITS.rapide.resistance, 5);
    expect(s.f[1].hp).toBe(MATCH.hp * HP - hit.dmg);
    expect(s.f[1].x).toBeGreaterThan(close().f[1].x);
  });

  it('le coup ne touche qu’une fois, et rate hors de portée', () => {
    expect(hitsOf(run(close(), 60, press('gifle')).ev)).toHaveLength(1);
    expect(hitsOf(run(close('bernard', 'lola', 200), 60, press('gifle')).ev)).toHaveLength(0);
  });

  it('fige l’adversaire le temps prévu : il ne peut rien faire', () => {
    let s = close();
    let frozen = 0;
    for (let i = 0; i < 80; i++) {
      s = step(s, i === 0 ? press('gifle') : none, press('gauche'));
      if (s.f[1].mode === 'hit') frozen++;
    }
    // Les pas d'arrêt sur image comptent dans ce qu'on voit, pas dans la durée du figement.
    expect(frozen).toBeGreaterThanOrEqual(st(MOVES.quick.hitstunMs));
    expect(frozen).toBeLessThanOrEqual(st(MOVES.quick.hitstunMs) + st(MOVES.quick.hitstopMs) + 1);
  });

  it('interrompt la charge d’une grosse gifle', () => {
    let s = close();
    s = run(s, 10, none, press('grosseGifle')).s;
    expect(s.f[1].mode).toBe('charge');
    s = run(s, 12, press('gifle'), press('grosseGifle')).s;
    expect(s.f[1].mode).toBe('hit');
  });

  it('passe au-dessus d’un adversaire accroupi', () => {
    expect(hitsOf(run(close(), 40, press('gifle'), press('bas')).ev)).toHaveLength(0);
  });
});

describe('gifle accroupie et gifle aérienne', () => {
  it('la gifle accroupie touche un adversaire accroupi', () => {
    const { ev, s } = run(close(), 30, press('bas', 'gifle'), press('bas'));
    expect(hitsOf(ev)).toHaveLength(1);
    expect(hitsOf(ev)[0].move).toBe('crouch');
    expect(s.f[1].hp).toBeLessThan(MATCH.hp * HP);
  });

  it('la gifle aérienne touche un adversaire accroupi, une seule fois par saut', () => {
    let s = close('lola', 'bernard', 110);
    const ev: FightEvent[] = [];
    s = step(s, press('haut', 'droite'), press('bas'));
    for (let i = 0; i < 60; i++) {
      // Le bouton est relâché puis rappuyé pendant le saut : la deuxième gifle ne part pas.
      s = step(s, i % 6 < 3 ? press('gifle') : none, press('bas'));
      ev.push(...s.ev);
    }
    expect(ev.filter((e) => e.t === 'swing' && e.move === 'air')).toHaveLength(1);
    expect(hitsOf(ev).filter((h) => h.move === 'air')).toHaveLength(1);
  });

  it('la gifle aérienne reste active jusqu’à l’atterrissage, puis il faut récupérer', () => {
    let s = createFightStarted('bernard', 'lola');
    s = step(s, press('haut'), none);
    s = step(s, press('gifle'), none);
    expect(actionOf(s.f[0])).toBe('airSlap');
    while (s.f[0].stance === 'jump') s = step(s, none, none);
    expect(s.f[0].mode).toBe('recover');
    expect(s.f[0].left).toBe(st(MOVES.air.recoveryMs));
    expect(run(s, st(MOVES.air.recoveryMs)).s.f[0].mode).toBe('free');
  });
});

describe('grosse gifle', () => {
  const lourd = GABARITS.lourd;
  const chargeSteps = physicsOf('bernard').chargeSteps;
  const holdFor = (pct: number) => Math.ceil((pct * chargeSteps) / 100);

  it('la jauge monte de 0 à 100 % dans le temps du gabarit', () => {
    expect(chargeSteps).toBe(st(lourd.chargeTimeMs));
    expect(chargePct('bernard', 0)).toBe(0);
    expect(chargePct('bernard', chargeSteps / 2)).toBe(50);
    expect(chargePct('bernard', chargeSteps * 2)).toBe(100);
  });

  it('on ne peut pas se déplacer pendant la charge', () => {
    const s0 = createFightStarted('bernard', 'lola');
    const s = run(s0, 30, press('grosseGifle', 'droite', 'haut')).s;
    expect(s.f[0].mode).toBe('charge');
    expect(s.f[0].x).toBe(s0.f[0].x);
    expect(s.f[0].y).toBe(0);
  });

  it('relâcher sous 20 % annule le coup', () => {
    const { s, ev } = bigSlap(close(), holdFor(10));
    expect(ev.filter((e) => e.t === 'swing')).toHaveLength(0);
    expect(s.f[1].hp).toBe(MATCH.hp * HP);
  });

  it('hors zone dorée : D = B × C/100 × R_d', () => {
    const { ev, charged } = bigSlap(close(), holdFor(50));
    const pct = chargePct('bernard', charged.f[0].mt);
    const [hit] = hitsOf(ev);
    expect(hit.crit).toBe(false);
    expect(hit.dmg / HP).toBeCloseTo(lourd.base * (pct / 100) * GABARITS.rapide.resistance, 0);
  });

  it('en zone dorée : critique ×2, qui met à terre', () => {
    const { ev, s } = bigSlap(close(), holdFor(85));
    const [hit] = hitsOf(ev);
    expect(hit.crit).toBe(true);
    expect(hit.dmg / HP).toBeGreaterThan(lourd.base * 0.8 * BIG_SLAP.criticalMultiplier * GABARITS.rapide.resistance - 0.1);
    expect(hit.knockdown).toBe(true);
    expect(hit.dmg).toBe(Math.round((bigDamage('bernard', 85, true) * 110) / 100));
    expect(s.f[1].mode === 'down' || s.f[1].mode === 'getup').toBe(true);
  });

  it('à terre puis relevé : invulnérable, puis de nouveau libre', () => {
    let { s } = bigSlap(close(), holdFor(85));
    // Bernard s'acharne : rien ne touche tant que l'adversaire est à terre ou se relève.
    const hp = s.f[1].hp;
    let i = 0;
    let slaps = 0;
    while (s.f[1].mode === 'down' || s.f[1].mode === 'getup') {
      s = step(s, i++ % 8 < 4 ? press('gifle', 'droite') : press('droite'), none);
      slaps += s.ev.filter((e) => e.t === 'hit').length;
      expect(i).toBeLessThan(200);
    }
    expect(slaps).toBe(0);
    expect(s.f[1].hp).toBe(hp);
    expect(s.f[1].mode).toBe('free');
  });

  it('surchauffe : rester à 100 % trop longtemps, et on se gifle soi-même', () => {
    const grace = st(BIG_SLAP.overheatGraceMs);
    const safe = run(createFightStarted('bernard', 'lola'), chargeSteps + grace, press('grosseGifle'));
    expect(safe.s.f[0].mode).toBe('charge');
    const { s, ev } = run(safe.s, 2, press('grosseGifle'));
    expect(ev.some((e) => e.t === 'self')).toBe(true);
    expect(s.f[0].hp).toBe((MATCH.hp - BIG_SLAP.selfSlapDamage) * HP);
    expect(actionOf(s.f[0])).toBe('selfSlap');
    expect(run(s, st(BIG_SLAP.selfSlapMs)).s.f[0].mode).toBe('free');
  });

  it('passe au-dessus d’un adversaire accroupi', () => {
    expect(hitsOf(bigSlap(close(), holdFor(85), press('bas')).ev)).toHaveLength(0);
  });

  it('les deux gabarits peuvent mettre l’autre à terre avec un critique', () => {
    for (const [a, b] of [['bernard', 'lola'], ['lola', 'bernard']] as const) {
      const g = GABARITS[ROSTER[a].gabarit];
      const res = GABARITS[ROSTER[b].gabarit].resistance;
      expect(g.base * (g.goldenZone[0] / 100) * BIG_SLAP.criticalMultiplier * res).toBeGreaterThanOrEqual(BIG_SLAP.knockdownDamage);
    }
  });
});

describe('garde', () => {
  it('bloque une gifle : 10 % des dégâts, et la jauge de garde baisse', () => {
    const { s, ev } = run(close(), 20, press('gifle'), press('garde'));
    const [hit] = hitsOf(ev);
    expect(hit.blocked).toBe(true);
    expect(hit.dmg / HP).toBeCloseTo(MOVES.quick.damage * GUARD.chipRatio, 5);
    expect(s.f[1].hp).toBe(MATCH.hp * HP - hit.dmg);
    expect(s.f[1].guard).toBeLessThan(GUARD_MAX);
    expect(actionOf(s.f[1])).toBe('guard');
  });

  it('on ne peut pas se déplacer en gardant', () => {
    const s0 = createFightStarted('bernard', 'lola');
    const s = run(s0, 30, press('garde', 'droite', 'haut')).s;
    expect(s.f[0].mode).toBe('guard');
    expect(s.f[0].x).toBe(s0.f[0].x);
  });

  it('se vide à force de bloquer : garde brisée, sonné une seconde, puis jauge pleine', () => {
    let s = close();
    const ev: FightEvent[] = [];
    let i = 0;
    while (!ev.some((e) => e.t === 'hit' && e.guardBreak)) {
      s = step(s, i++ % 30 < 3 ? press('gifle', 'droite') : press('droite'), press('garde'));
      ev.push(...s.ev);
      expect(i).toBeLessThan(900);
    }
    const blocks = hitsOf(ev).length;
    expect(blocks).toBeGreaterThanOrEqual(3);
    expect(blocks).toBeLessThanOrEqual(8);
    expect(s.f[1].mode).toBe('stun');
    expect(actionOf(s.f[1])).toBe('dazed');
    expect(s.f[1].left).toBe(st(GUARD.breakStunMs));
    // Sonné, on encaisse plein pot.
    const r = run(run(s, 15).s, 25, press('gifle'), press('garde'));
    expect(hitsOf(r.ev)[0].blocked).toBe(false);
  });

  it('se recharge hors garde', () => {
    let s = run(close(), 20, press('gifle'), press('garde')).s;
    const low = s.f[1].guard;
    s = run(s, 60).s;
    expect(s.f[1].guard - low).toBe(GUARD.regenPerSecond * SIM.stepsPerSecond);
    expect(run(s, 600).s.f[1].guard).toBe(GUARD_MAX);
  });

  it('une grosse gifle hors zone dorée est bloquée ; en zone dorée elle brise la garde', () => {
    const chargeSteps = physicsOf('bernard').chargeSteps;
    const normal = hitsOf(bigSlap(close(), Math.ceil(chargeSteps * 0.5), press('garde')).ev)[0];
    expect(normal.blocked).toBe(true);
    const golden = bigSlap(close(), Math.ceil(chargeSteps * 0.85), press('garde'));
    const [hit] = hitsOf(golden.ev);
    expect(hit.blocked).toBe(false);
    expect(hit.crit).toBe(true);
    expect(hit.guardBreak).toBe(true);
    expect(golden.s.f[1].hp).toBe(MATCH.hp * HP - hit.dmg);
  });
});

describe('échange de coups', () => {
  it('deux gifles au même instant touchent les deux', () => {
    const { ev, s } = run(close('bernard', 'bernard'), 30, press('gifle'), press('gifle'));
    expect(hitsOf(ev).map((h) => h.by).sort()).toEqual([0, 1]);
    expect(s.f[0].hp).toBe(s.f[1].hp);
  });
});

describe('rounds et match', () => {
  it('le round commence par une annonce pendant laquelle personne ne bouge', () => {
    const s0 = createFight('bernard', 'lola');
    expect(s0.phase).toBe('intro');
    expect(s0.ev).toEqual([{ t: 'round', n: 1 }]);
    const { s, ev } = run(s0, st(ROUND.introMs) - 1, press('droite', 'gifle'), press('gauche'));
    expect(s.phase).toBe('intro');
    expect(s.f[0].x).toBe(s0.f[0].x);
    expect(s.timeLeft).toBe(s0.timeLeft);
    expect(ev).toHaveLength(0);
    const next = step(s, none, none);
    expect(next.phase).toBe('fight');
    expect(next.ev).toEqual([{ t: 'fight' }]);
  });

  it('le chrono descend pendant le combat ; à zéro, celui qui a le plus de PV gagne le round', () => {
    let s = close();
    s = run(s, 20, press('gifle')).s;
    const r = run(s, MATCH.roundTimeS * SIM.stepsPerSecond, none, none);
    expect(r.ev.some((e) => e.t === 'timeup')).toBe(true);
    expect(r.ev.find((e) => e.t === 'roundEnd')).toEqual({ t: 'roundEnd', winner: 0 });
    expect(r.s.wins).toEqual([1, 0]);
  });

  it('égalité au chrono : personne ne marque', () => {
    const r = run(createFightStarted('bernard', 'lola'), MATCH.roundTimeS * SIM.stepsPerSecond + 5);
    expect(r.ev.find((e) => e.t === 'roundEnd')).toEqual({ t: 'roundEnd', winner: 2 });
    expect(r.s.wins).toEqual([0, 0]);
  });

  it('K.O. à 0 PV : round gagné, puis nouveau round avec PV pleins', () => {
    let s = close();
    s.f[1].hp = 3 * HP;
    const r = run(s, 30, press('gifle'));
    expect(r.ev.find((e) => e.t === 'ko')).toEqual({ t: 'ko', who: 1 });
    expect(r.s.phase).toBe('roundEnd');
    expect(r.s.f[1].mode).toBe('ko');
    expect(r.s.f[0].mode).toBe('win');
    expect(actionOf(r.s.f[0])).toBe('victory');
    expect(actionOf(r.s.f[1])).toBe('dazed');
    const next = run(r.s, st(ROUND.endMs) + 1);
    expect(next.ev.find((e) => e.t === 'round')).toEqual({ t: 'round', n: 2 });
    s = next.s;
    expect(s.phase).toBe('intro');
    expect(s.round).toBe(2);
    expect(s.wins).toEqual([1, 0]);
    expect(s.f.map((f) => f.hp)).toEqual([MATCH.hp * HP, MATCH.hp * HP]);
    expect(s.timeLeft).toBe(MATCH.roundTimeS * SIM.stepsPerSecond);
  });

  it('personne n’agit pendant la fin du round', () => {
    const s = close();
    s.f[1].hp = 3 * HP;
    const r = run(s, 30, press('gifle'));
    const hp = r.s.f[1].hp;
    const after = run(r.s, 60, press('gifle', 'droite'), press('gifle'));
    expect(hitsOf(after.ev)).toHaveLength(0);
    expect(after.s.f[1].hp).toBe(hp);
  });

  it('se gifler soi-même à 0 PV donne le round à l’adversaire', () => {
    const s = createFightStarted('bernard', 'lola');
    s.f[0].hp = 5 * HP;
    const r = run(s, physicsOf('bernard').chargeSteps + 20, press('grosseGifle'));
    expect(r.ev.find((e) => e.t === 'roundEnd')).toEqual({ t: 'roundEnd', winner: 1 });
  });

  it('double K.O. : personne ne marque', () => {
    const s = close('bernard', 'bernard');
    s.f[0].hp = s.f[1].hp = 2 * HP;
    const r = run(s, 30, press('gifle'), press('gifle'));
    expect(r.ev.find((e) => e.t === 'ko')).toEqual({ t: 'ko', who: 2 });
    expect(r.s.wins).toEqual([0, 0]);
  });

  it('le match se gagne en 2 rounds, puis plus rien ne bouge', () => {
    let s = close();
    const ev: FightEvent[] = [];
    for (let i = 0; i < 4000 && s.phase !== 'matchEnd'; i++) {
      if (s.phase === 'fight' && s.f[1].hp > 3 * HP) {
        s = { ...s, f: [{ ...s.f[0], x: s.f[1].x - 80 * SUB }, { ...s.f[1], hp: 3 * HP }] };
      }
      s = step(s, i % 20 < 3 ? press('gifle') : none, none);
      ev.push(...s.ev);
    }
    expect(s.phase).toBe('matchEnd');
    expect(s.wins).toEqual([2, 0]);
    expect(s.winner).toBe(0);
    expect(ev.filter((e) => e.t === 'matchEnd')).toEqual([{ t: 'matchEnd', winner: 0 }]);
    const frozen = run(s, 100, press('gifle', 'droite'), press('gauche'));
    expect(frozen.s.f).toEqual(s.f);
    expect(frozen.ev).toHaveLength(0);
  });
});

describe('appui gardé en mémoire', () => {
  it('une gifle demandée juste avant la fin du coup précédent part quand même', () => {
    const m = moveSteps('quick');
    const total = m.startup + m.active + m.recovery;
    let s = step(createFightStarted('bernard', 'lola'), press('gifle'), none);
    s = run(s, total - 5).s;
    expect(s.f[0].mode).toBe('attack');
    // Nouvel appui 4 pas avant la fin : la deuxième gifle s'enchaîne.
    s = step(s, press('gifle'), none);
    const r = run(s, 6);
    expect(r.ev.filter((e) => e.t === 'swing')).toHaveLength(1);
  });

  it('un appui trop ancien est oublié', () => {
    let s = step(createFightStarted('bernard', 'lola'), press('gifle'), none);
    s = step(s, none, none);
    s = step(s, press('gifle'), none);
    const r = run(s, 60);
    expect(r.ev.filter((e) => e.t === 'swing')).toHaveLength(0);
  });
});
