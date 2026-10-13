import { describe, expect, it } from 'vitest';
import { BUZZ, DIZZY, MATCH, MOVES, ROUND, SIM, SPECIAL } from '../../src/config/balance';
import { FIGHTER_IDS, ROSTER, type FighterId } from '../../src/config/roster';
import { SPECIALS } from '../../src/config/specials';
import {
  actionIn,
  BUZZ_STEPS,
  chargePct,
  createFightStarted,
  DASH_STEPS,
  DIZZY_STEPS,
  hashState,
  HP,
  PARRY_STEPS,
  physicsOf,
  specialOf,
  step,
  SUB,
  type FightEvent,
  type FightState,
} from '../../src/logic/fight';
import { decodeInput, mergeInputs, noInput, type InputFrame } from '../../src/logic/input';
import { createRng } from '../../src/logic/rng';

const none = noInput();
const press = (...keys: (keyof InputFrame)[]): InputFrame => mergeInputs(Object.fromEntries(keys.map((k) => [k, true])));
const st = (ms: number) => Math.round((ms * SIM.stepsPerSecond) / 1000);

function run(s: FightState, n: number, a: InputFrame | ((s: FightState) => InputFrame) = none, b: InputFrame | ((s: FightState) => InputFrame) = none) {
  const ev: FightEvent[] = [];
  for (let i = 0; i < n; i++) {
    s = step(s, typeof a === 'function' ? a(s) : a, typeof b === 'function' ? b(s) : b);
    ev.push(...s.ev);
  }
  return { s, ev };
}

function close(left: FighterId = 'aviateur', right: FighterId = 'doyen', dist = 80): FightState {
  const s = createFightStarted(left, right);
  const mid = (s.f[0].x + s.f[1].x) / 2;
  s.f[0].x = mid - (dist * SUB) / 2;
  s.f[1].x = mid + (dist * SUB) / 2;
  return s;
}

/** Barre pleine pour le joueur 0, à `dist` px. */
function full(left: FighterId = 'aviateur', right: FighterId = 'doyen', dist = 80) {
  const s = close(left, right, dist);
  s.f[0].buzz = BUZZ.max;
  return s;
}

/** Le joueur 0 maintient le bouton jusqu'à ce que la cinématique commence. */
function launch(s: FightState, b: InputFrame = none) {
  const r = run(s, BUZZ_STEPS + 1, press('grosseGifle'), b);
  expect(r.s.cine).not.toBeNull();
  return r;
}

/** Fait tourner la cinématique jusqu'au bout ; `b(t)` : entrées de la victime au pas `t` de la cinématique. */
function playCine(s: FightState, b: (t: number) => InputFrame = () => none) {
  const ev: FightEvent[] = [];
  let guard = 0;
  while (s.cine || s.hitstop > 0) {
    const t = s.cine ? s.cine.t + 1 : -1;
    s = step(s, none, b(t));
    ev.push(...s.ev);
    expect(++guard).toBeLessThan(400);
  }
  return { s, ev };
}

describe('barre Buzz', () => {
  it('se remplit sur les coups qui touchent : +9 pour une gifle rapide ou un coup de pied', () => {
    const slap = run(close(), 30, press('gifle'));
    expect(slap.s.f[0].buzz).toBe(BUZZ.lightHit);
    const kick = run(close(), 30, press('pied'));
    expect(kick.s.f[0].buzz).toBe(BUZZ.lightHit);
  });

  it('grosse gifle : +14, et +25 en zone dorée', () => {
    const cs = physicsOf('aviateur').chargeSteps;
    const big = (pct: number) => {
      let s = run(close(), Math.ceil((pct * cs) / 100) + 1, press('grosseGifle')).s;
      s = run(s, 40).s;
      return s.f[0].buzz;
    };
    expect(big(50)).toBe(BUZZ.bigHit);
    expect(big(84)).toBe(BUZZ.critHit);
  });

  it('rien pour un coup bloqué, rien pour un coup reçu', () => {
    const r = run(close(), 30, press('gifle'), press('garde'));
    expect(r.ev.some((e) => e.t === 'hit' && e.blocked)).toBe(true);
    expect(r.s.f[0].buzz).toBe(0);
    expect(r.s.f[1].buzz).toBe(0);
    const hit = run(close(), 30, press('gifle'));
    expect(hit.s.f[1].buzz).toBe(0);
  });

  it('esquive réussie : accroupi sous une gifle rapide, +20, une fois par coup', () => {
    const r = run(close(), 30, press('gifle'), press('bas'));
    expect(r.ev.filter((e) => e.t === 'hit')).toHaveLength(0);
    expect(r.ev.filter((e) => e.t === 'dodge')).toEqual([expect.objectContaining({ who: 1 })]);
    expect(r.s.f[1].buzz).toBe(BUZZ.dodge);
  });

  it('esquive réussie : en l’air au-dessus d’un coup de pied', () => {
    let s = close();
    s = step(s, none, press('haut'));
    s = run(s, 6).s;
    const r = run(s, 20, press('pied'));
    expect(r.ev.filter((e) => e.t === 'hit')).toHaveLength(0);
    expect(r.ev.some((e) => e.t === 'dodge' && e.who === 1)).toBe(true);
    expect(r.s.f[1].buzz).toBe(BUZZ.dodge);
  });

  it('pas d’esquive hors de portée, ni en garde basse sous une gifle', () => {
    expect(run(close('aviateur', 'doyen', 200), 30, press('gifle'), press('bas')).s.f[1].buzz).toBe(0);
    // La garde basse laisse la tête à portée : la gifle touche, aucun Buzz pour celui qui garde.
    const r = run(close(), 30, press('gifle'), press('garde', 'bas'));
    expect(r.ev.some((e) => e.t === 'hit')).toBe(true);
    expect(r.s.f[1].buzz).toBe(0);
  });

  it('plafonne à 100, et annonce la barre pleine une seule fois', () => {
    const s = close();
    s.f[0].buzz = BUZZ.max - 2;
    const r = run(s, 30, press('gifle'));
    expect(r.s.f[0].buzz).toBe(BUZZ.max);
    expect(r.ev.filter((e) => e.t === 'buzzFull')).toEqual([{ t: 'buzzFull', who: 0 }]);
  });

  it('se garde d’un round à l’autre, et repart de zéro au nouveau match', () => {
    const s = close();
    s.f[0].buzz = 60;
    s.f[1].hp = 3 * HP;
    const r = run(s, 30 + st(ROUND.endMs) + 2, (x) => (x.step < 3 ? press('gifle') : none));
    expect(r.s.round).toBe(2);
    expect(r.s.f[0].buzz).toBe(60 + BUZZ.lightHit);
    expect(r.s.f.map((f) => f.hp)).toEqual([MATCH.hp * HP, MATCH.hp * HP]);
    expect(createFightStarted('aviateur', 'doyen').f.map((f) => f.buzz)).toEqual([0, 0]);
  });
});

describe('cercle du Buzz', () => {
  it('barre pleine : le bouton lance le cercle au lieu de la grosse gifle, et on ne bouge plus', () => {
    const s0 = full();
    const r = run(s0, 10, press('grosseGifle', 'droite'));
    expect(r.s.f[0].mode).toBe('buzz');
    expect(r.s.f[0].x).toBe(s0.f[0].x);
    expect(actionIn(r.s, 0)).toBe('buzzHold');
    expect(r.ev.some((e) => e.t === 'buzzStart')).toBe(true);
  });

  it('barre pas pleine : c’est une grosse gifle normale', () => {
    const s = close();
    s.f[0].buzz = BUZZ.max - 1;
    expect(run(s, 10, press('grosseGifle')).s.f[0].mode).toBe('charge');
  });

  it('se remplit en 0,5 s : la cinématique commence à la fin', () => {
    expect(BUZZ_STEPS).toBe(30);
    const r = run(full(), BUZZ_STEPS, press('grosseGifle'));
    expect(r.s.cine).toBeNull();
    const next = step(r.s, press('grosseGifle'), none);
    expect(next.cine).not.toBeNull();
    expect(next.ev).toContainEqual({ t: 'special', who: 0, special: ROSTER.aviateur.special });
  });

  it('relâché avant la fin : rien ne se passe, la barre reste pleine', () => {
    let s = run(full(), 20, press('grosseGifle')).s;
    const r = run(s, 2);
    s = r.s;
    expect(r.ev).toContainEqual({ t: 'buzzCancel', who: 0 });
    expect(s.f[0].mode).toBe('free');
    expect(s.f[0].buzz).toBe(BUZZ.max);
    expect(run(s, 60).s.cine).toBeNull();
  });

  it('touché pendant que le cercle se remplit : annulé, la barre reste pleine', () => {
    const r = run(full(), 25, press('grosseGifle'), (x) => (x.step === 10 ? press('gifle') : none));
    expect(r.ev.some((e) => e.t === 'hit' && e.by === 1)).toBe(true);
    expect(r.ev).toContainEqual({ t: 'buzzCancel', who: 0 });
    expect(r.s.cine).toBeNull();
    expect(r.s.f[0].buzz).toBe(BUZZ.max);
    // Bouton toujours maintenu après le coup : il faut relâcher et rappuyer.
    expect(run(r.s, 60, press('grosseGifle')).s.cine).toBeNull();
  });
});

describe('cinématique du coup spécial', () => {
  it('touche toujours : 35 PV, même si la victime garde, s’accroupit, saute ou frappe', () => {
    for (const b of [none, press('garde'), press('bas'), press('haut'), press('gifle'), press('garde', 'bas')]) {
      const { s } = launch(full());
      const r = playCine(s, () => b);
      const hit = r.ev.find((e) => e.t === 'specialHit');
      expect(hit).toMatchObject({ by: 0, parried: false, dmg: SPECIAL.damage * HP });
      expect(r.s.f[1].hp).toBe((MATCH.hp - SPECIAL.damage) * HP);
    }
  });

  it('touche de loin aussi : peu importe la distance', () => {
    const { s } = launch(full('doyen', 'aviateur', 500));
    const r = playCine(s);
    expect(r.s.f[1].hp).toBe((MATCH.hp - SPECIAL.damage) * HP);
  });

  it('le lanceur est intouchable, le chrono s’arrête', () => {
    const { s } = launch(full());
    const time = s.timeLeft;
    const r = playCine(s, () => press('gifle', 'pied'));
    expect(r.ev.filter((e) => e.t === 'hit')).toHaveLength(0);
    expect(r.s.f[0].hp).toBe(MATCH.hp * HP);
    expect(r.s.timeLeft).toBe(time);
  });

  it('dure le temps prévu, pose 1, 2 puis 3, puis chacun reprend la main', () => {
    const { s } = launch(full());
    const sp = specialOf('aviateur');
    const seen: string[] = [];
    let x = s;
    while (x.cine) {
      const a = actionIn(x, 0);
      if (seen[seen.length - 1] !== a) seen.push(a);
      x = step(x, none, none);
    }
    expect(seen).toEqual(['special1', 'special2', 'special3']);
    expect(x.ev).toContainEqual({ t: 'cineEnd' });
    expect(x.f[0].mode).toBe('free');
    expect(x.f[1].mode).toBe('down');
    expect(x.step - s.step).toBeGreaterThanOrEqual(sp.end - 1);
  });

  it('après l’impact, la barre Buzz retombe à 0 et la grosse gifle revient', () => {
    const { s } = launch(full());
    const r = playCine(s);
    expect(r.s.f[0].buzz).toBe(0);
    const again = run(run(r.s, 2).s, 10, press('grosseGifle'));
    expect(again.s.f[0].mode).toBe('charge');
  });

  it('les coups de près se collent à l’adversaire ; ceux à distance restent où ils sont', () => {
    for (const id of FIGHTER_IDS) {
      const s0 = full(id, id === 'doyen' ? 'aviateur' : 'doyen', 400);
      const { s } = launch(s0);
      const after = run(s, DASH_STEPS + 1).s;
      const gap = Math.abs(after.f[1].x - after.f[0].x) / SUB;
      if (SPECIALS[ROSTER[id].special].range === 'near') {
        expect(gap, id).toBeLessThan(physicsOf(id).halfW / SUB + physicsOf('doyen').halfW / SUB + SPECIAL.dashGap + 2);
        expect(Math.sign(after.f[1].x - after.f[0].x)).toBe(Math.sign(s0.f[1].x - s0.f[0].x));
      } else {
        expect(after.f[0].x, id).toBe(s.f[0].x);
      }
    }
  });

  it('les six coups spéciaux se jouent jusqu’au bout, avec signal et impact', () => {
    for (const id of FIGHTER_IDS) {
      const { s } = launch(full(id, id === 'cadet' ? 'barbe' : 'cadet', 200));
      const r = playCine(s);
      const types = r.ev.map((e) => e.t);
      expect(types, id).toContain('signal');
      expect(types, id).toContain('specialHit');
      expect(types.indexOf('signal')).toBeLessThan(types.indexOf('specialHit'));
      if (specialOf(id).range === 'far') expect(types, id).toContain('launch');
    }
  });

  it('garde au bon moment, dans les 6 pas après le signal : 18 PV seulement', () => {
    const sp = specialOf('aviateur');
    for (let d = 0; d < PARRY_STEPS; d++) {
      const { s } = launch(full());
      const r = playCine(s, (t) => (t >= sp.signal + d ? press('garde') : none));
      expect(r.ev).toContainEqual({ t: 'parry', who: 1, ok: true });
      expect(r.ev.find((e) => e.t === 'specialHit')).toMatchObject({ parried: true, dmg: SPECIAL.parriedDamage * HP });
      expect(r.s.f[1].hp).toBe((MATCH.hp - SPECIAL.parriedDamage) * HP);
    }
  });

  it('trop tôt, trop tard, ou tenue avant le signal : 35 PV', () => {
    const sp = specialOf('aviateur');
    const cases: ((t: number) => InputFrame)[] = [
      (t) => (t === sp.signal - 1 ? press('garde') : none),
      (t) => (t >= sp.signal - 3 ? press('garde') : none),
      (t) => (t >= sp.signal + PARRY_STEPS ? press('garde') : none),
      () => press('garde'),
      // Plusieurs appuis : le premier, trop tôt, compte.
      (t) => (t === sp.signal - 5 || t === sp.signal + 1 ? press('garde') : none),
    ];
    for (const b of cases) {
      const { s } = launch(full());
      const r = playCine(s, b);
      expect(r.ev.find((e) => e.t === 'specialHit')).toMatchObject({ parried: false, dmg: SPECIAL.damage * HP });
    }
  });

  it('met à terre, puis sonné ; il se relève normalement après la cinématique', () => {
    const { s } = launch(full());
    const r = playCine(s);
    expect(r.s.f[1].mode).toBe('down');
    expect(r.s.f[1].dizzy).toBeGreaterThan(0);
    let x = r.s;
    let n = 0;
    while (x.f[1].mode !== 'free') {
      x = step(x, none, none);
      expect(++n).toBeLessThan(200);
    }
  });

  it('peut mettre K.O. : le round s’arrête à l’impact', () => {
    const s0 = full();
    s0.f[1].hp = 20 * HP;
    const { s } = launch(s0);
    const r = playCine(s);
    expect(r.ev).toContainEqual({ t: 'ko', who: 1 });
    expect(r.s.phase).toBe('roundEnd');
    expect(r.s.wins).toEqual([1, 0]);
    expect(r.s.cine).toBeNull();
  });

  it('les appuis faits pendant la cinématique ne déclenchent rien à la sortie', () => {
    const { s } = launch(full());
    let x = s;
    while (x.cine) x = step(x, press('gifle'), none);
    const after = run(x, 3, press('gifle'));
    expect(after.ev.filter((e) => e.t === 'swing')).toHaveLength(0);
  });
});

describe('sonné', () => {
  it('garde brisée : sonné 3 s, la jauge de grosse gifle monte de façon irrégulière', () => {
    let s = close();
    const ev: FightEvent[] = [];
    let i = 0;
    while (!ev.some((e) => e.t === 'hit' && e.guardBreak)) {
      s = step(s, i++ % 30 < 3 ? press('gifle', 'droite') : press('droite'), press('garde'));
      ev.push(...s.ev);
      expect(i).toBeLessThan(900);
    }
    expect(ev).toContainEqual({ t: 'dizzy', who: 1 });
    expect(s.f[1].dizzy).toBeGreaterThan(DIZZY_STEPS - 3);
    expect(DIZZY_STEPS).toBe(st(DIZZY.ms));
  });

  it('sonné, la charge varie de ±30 % ; sinon elle monte d’un cran régulier', () => {
    const speeds = (dizzy: boolean) => {
      const s = createFightStarted('aviateur', 'doyen', 'bar', 7);
      if (dizzy) s.f[0].dizzy = 9999;
      const list: number[] = [];
      let x = step(s, press('grosseGifle'), none);
      for (let i = 0; i < 60 && x.f[0].mode === 'charge'; i++) {
        const before = x.f[0].chg;
        x = step(x, press('grosseGifle'), none);
        if (x.f[0].mode === 'charge') list.push(x.f[0].chg - before);
      }
      return list;
    };
    expect(new Set(speeds(false))).toEqual(new Set([100]));
    const d = speeds(true);
    expect(Math.min(...d)).toBeGreaterThanOrEqual(70);
    expect(Math.max(...d)).toBeLessThanOrEqual(130);
    expect(new Set(d).size).toBeGreaterThan(2);
  });

  it('se dissipe au bout de 3 s', () => {
    const s = createFightStarted('aviateur', 'doyen');
    s.f[0].dizzy = DIZZY_STEPS;
    expect(run(s, DIZZY_STEPS).s.f[0].dizzy).toBe(0);
  });

  it('un coup de 25 PV ou plus rend sonné (le coup spécial) ; une grosse gifle, non', () => {
    expect(SPECIAL.damage).toBeGreaterThanOrEqual(DIZZY.threshold);
    const cs = physicsOf('aviateur').chargeSteps;
    let s = run(close(), Math.ceil(0.84 * cs) + 1, press('grosseGifle')).s;
    s = run(s, 40).s;
    expect(s.f[1].dizzy).toBe(0);
    expect(chargePct(0)).toBe(0);
  });
});

describe('déterminisme avec coups spéciaux', () => {
  /** Entrées au hasard, avec de longs appuis sur le bouton du Buzz pour lancer des coups spéciaux. */
  const inputsFor = (seed: number, n: number) => {
    const rng = createRng(seed);
    const list: [number, number][] = [];
    let a = 0;
    let b = 0;
    for (let i = 0; i < n; i++) {
      if (i % 9 === 0) a = Math.floor(rng() * 256);
      if (i % 11 === 0) b = Math.floor(rng() * 256);
      // Tous les 200 pas, le joueur 0 relâche tout, puis maintient le bouton 40 pas ; l'adversaire le laisse faire.
      const w = i % 200;
      if (w < 44) list.push([w < 4 ? 0 : 1 << 5, 0]);
      else list.push([a & ~(1 << 5), b]);
    }
    return list;
  };
  const play = (seed: number, n: number) => {
    let s = createFightStarted('aviateur', 'binocle', 'bar', 5);
    s.f[0].buzz = BUZZ.max;
    let specials = 0;
    for (const [a, b] of inputsFor(seed, n)) {
      // Barre remplie à chaque fois qu'elle est vide : beaucoup de cinématiques.
      if (s.f[0].buzz === 0 && !s.cine) s = { ...s, f: [{ ...s.f[0], buzz: BUZZ.max }, s.f[1]] };
      s = step(s, decodeInput(a), decodeInput(b));
      specials += s.ev.filter((e) => e.t === 'specialHit').length;
    }
    return { s, specials };
  };

  it('10 000 pas rejoués avec les mêmes entrées, coups spéciaux compris : même empreinte', () => {
    const a = play(42, 10_000);
    const b = play(42, 10_000);
    expect(a.specials).toBeGreaterThan(3);
    expect(hashState(a.s)).toBe(hashState(b.s));
    expect(a.s).toEqual(b.s);
  });

  it('l’état en pleine cinématique se copie par JSON et repart à l’identique', () => {
    const { s } = launch(full());
    const mid = run(s, 20).s;
    const copy = JSON.parse(JSON.stringify(mid)) as FightState;
    expect(copy).toEqual(mid);
    expect(hashState(run(copy, 80).s)).toBe(hashState(run(mid, 80).s));
  });

  it('une gifle rapide reste plus rapide que le cercle : on peut toujours le couper', () => {
    expect(MOVES.quick.startupMs).toBeLessThan(BUZZ.holdMs);
  });
});
