import { describe, expect, it } from 'vitest';
import { ARENA, GABARITS, MOVEMENT, SIM } from '../../src/config/balance';
import { ROSTER } from '../../src/config/roster';
import { actionOf, createFightStarted as createFight, hashState, physicsOf, stageWidth, step, SUB, type FightState } from '../../src/logic/fight';
import { decodeInput, encodeInput, mergeInputs, noInput, type InputFrame } from '../../src/logic/input';
import { createRng } from '../../src/logic/rng';

const none = noInput();
const press = (...keys: (keyof InputFrame)[]): InputFrame => mergeInputs(Object.fromEntries(keys.map((k) => [k, true])));
const run = (s: FightState, n: number, a: InputFrame = none, b: InputFrame = none) => {
  for (let i = 0; i < n; i++) s = step(s, a, b);
  return s;
};
const px = (v: number) => v / SUB;

describe('entrées', () => {
  it('se compactent en un entier et se retrouvent à l’identique', () => {
    for (let n = 0; n < 256; n++) expect(encodeInput(decodeInput(n))).toBe(n);
    expect(encodeInput(none)).toBe(0);
  });

  it('se réunissent : une touche est enfoncée si elle l’est quelque part', () => {
    expect(mergeInputs({ gauche: true }, { gifle: true })).toEqual({ ...none, gauche: true, gifle: true });
  });
});

describe('début du combat', () => {
  const s = createFight('bernard', 'lola');
  it('place les combattants face à face, de part et d’autre du centre', () => {
    const center = px(stageWidth('bar')) / 2;
    expect(px(s.f[0].x)).toBe(center - ARENA.startDistance / 2);
    expect(px(s.f[1].x)).toBe(center + ARENA.startDistance / 2);
    expect(s.f[0].facing).toBe(1);
    expect(s.f[1].facing).toBe(-1);
  });

  it('ne bouge pas sans entrée', () => {
    const t = run(s, 120);
    expect(t.f).toEqual(s.f);
    expect(t.step).toBe(120);
  });

  it('ne modifie jamais l’état reçu', () => {
    const copy = JSON.stringify(s);
    run(s, 30, press('droite'), press('haut', 'gauche'));
    expect(JSON.stringify(s)).toBe(copy);
  });
});

describe('marche', () => {
  it('avance à la vitesse du gabarit, à 2 % près', () => {
    for (const [id, other] of [['bernard', 'lola'], ['lola', 'bernard']] as const) {
      const s = createFight(id, other);
      const t = run(s, 30, press('gauche'));
      // Vers la gauche = en reculant pour le joueur de gauche.
      const speed = GABARITS[ROSTER[id].gabarit].walkSpeed * MOVEMENT.backWalkFactor;
      expect(px(s.f[0].x - t.f[0].x) * 2).toBeCloseTo(speed, -1);
      expect(Math.abs(px(s.f[0].x - t.f[0].x) * 2 - speed) / speed).toBeLessThan(0.02);
    }
  });

  it('recule moins vite qu’elle n’avance', () => {
    const s = createFight('bernard', 'lola');
    const fwd = run(s, 20, press('droite')).f[0].x - s.f[0].x;
    const back = s.f[0].x - run(s, 20, press('gauche')).f[0].x;
    expect(back).toBeLessThan(fwd);
    expect(actionOf(run(s, 1, press('droite')).f[0])).toBe('walk');
  });

  it('gauche et droite ensemble : on ne bouge pas', () => {
    const s = createFight('bernard', 'lola');
    expect(run(s, 20, press('gauche', 'droite')).f[0].x).toBe(s.f[0].x);
  });

  it('s’arrête au bord du niveau', () => {
    let s = createFight('lola', 'bernard');
    // Les deux marchent vers la gauche assez longtemps pour atteindre le mur.
    s = run(s, 900, press('gauche'), press('gauche'));
    expect(px(s.f[0].x)).toBe(ARENA.wallMargin);
    const right = run(createFight('lola', 'bernard'), 900, press('droite'), press('droite'));
    expect(px(right.f[1].x)).toBe(px(stageWidth('bar')) - ARENA.wallMargin);
  });

  it('ne peut pas s’éloigner de plus que la distance maximale', () => {
    let s = createFight('lola', 'bernard');
    for (let i = 0; i < 600; i++) {
      s = step(s, press('gauche'), press('droite'));
      expect(px(s.f[1].x - s.f[0].x)).toBeLessThanOrEqual(ARENA.maxSeparation);
    }
    expect(px(s.f[1].x - s.f[0].x)).toBe(ARENA.maxSeparation);
    // Celui qui ne s'écarte pas n'est pas tiré par l'autre.
    const before = s.f[1].x;
    s = run(s, 30, press('gauche'));
    expect(s.f[1].x).toBe(before);
  });

  it('deux combattants au sol ne se traversent pas', () => {
    let s = createFight('bernard', 'lola');
    const minDist = ROSTER.bernard.body.stand.halfW + ROSTER.lola.body.stand.halfW;
    for (let i = 0; i < 300; i++) {
      s = step(s, press('droite'), press('gauche'));
      expect(s.f[0].x).toBeLessThan(s.f[1].x);
    }
    expect(px(s.f[1].x - s.f[0].x)).toBeCloseTo(minDist, 0);
  });

  it('celui qui pousse fait reculer l’autre, jusqu’au mur', () => {
    let s = createFight('bernard', 'lola');
    s = run(s, 1500, press('droite'));
    const minDist = ROSTER.bernard.body.stand.halfW + ROSTER.lola.body.stand.halfW;
    expect(px(s.f[1].x)).toBe(px(stageWidth('bar')) - ARENA.wallMargin);
    expect(px(s.f[1].x - s.f[0].x)).toBeCloseTo(minDist, 0);
  });
});

describe('accroupi', () => {
  it('on s’accroupit sur place, puis on se relève', () => {
    const s = createFight('bernard', 'lola');
    const t = run(s, 20, press('bas', 'droite'));
    expect(t.f[0].stance).toBe('crouch');
    expect(actionOf(t.f[0])).toBe('crouch');
    expect(t.f[0].x).toBe(s.f[0].x);
    expect(run(t, 1).f[0].stance).toBe('stand');
  });
});

describe('saut', () => {
  for (const id of ['bernard', 'lola'] as const) {
    it(`${id} : dure le temps prévu, monte à la bonne hauteur et retombe au sol`, () => {
      const n = physicsOf(id).jumpSteps;
      expect(n).toBe(Math.round((GABARITS[ROSTER[id].gabarit].jumpMs * SIM.stepsPerSecond) / 1000));
      let s = step(createFight(id, id === 'bernard' ? 'lola' : 'bernard'), press('haut'), none);
      let top = 0;
      let steps = 1;
      while (s.f[0].stance === 'jump') {
        top = Math.max(top, s.f[0].y);
        s = step(s, none, none);
        steps++;
      }
      expect(steps).toBe(n);
      expect(px(top)).toBeGreaterThan(MOVEMENT.jumpHeight * 0.97);
      expect(px(top)).toBeLessThanOrEqual(MOVEMENT.jumpHeight);
      expect(s.f[0].y).toBe(0);
      expect(actionOf(s.f[0])).toBe('idle');
    });
  }

  it('saut vertical : on retombe au même endroit ; la direction ne change pas en l’air', () => {
    const s0 = createFight('bernard', 'lola');
    let s = step(s0, press('haut'), none);
    s = run(s, 10, press('droite'));
    expect(s.f[0].x).toBe(s0.f[0].x);
    let fwd = step(s0, press('haut', 'gauche'), none);
    fwd = run(fwd, 10, press('droite'));
    expect(fwd.f[0].x).toBeLessThan(s0.f[0].x);
  });

  it('en sautant par-dessus l’adversaire, on passe de l’autre côté et les deux se retournent', () => {
    let s = createFight('lola', 'bernard');
    // Lola avance au contact, puis saute vers l'avant.
    s = run(s, 120, press('droite'));
    expect(s.f[0].x).toBeLessThan(s.f[1].x);
    s = step(s, press('haut', 'droite'), none);
    while (s.f[0].stance === 'jump') s = step(s, none, none);
    s = run(s, 30);
    expect(s.f[0].x).toBeGreaterThan(s.f[1].x);
    expect(s.f[0].facing).toBe(-1);
    expect(s.f[1].facing).toBe(1);
    // Une fois retombés, ils ne se chevauchent plus.
    const minDist = ROSTER.bernard.body.stand.halfW + ROSTER.lola.body.stand.halfW;
    expect(px(s.f[0].x - s.f[1].x)).toBeGreaterThanOrEqual(minDist - 1);
  });
});

describe('déterminisme', () => {
  const inputsFor = (seed: number, n: number) => {
    const rng = createRng(seed);
    const list: [number, number][] = [];
    let a = 0;
    let b = 0;
    for (let i = 0; i < n; i++) {
      // Les touches changent de temps en temps, comme avec un vrai joueur.
      if (rng() < 0.08) a = Math.floor(rng() * 256);
      if (rng() < 0.08) b = Math.floor(rng() * 256);
      list.push([a, b]);
    }
    return list;
  };
  const play = (seed: number, n: number) => {
    let s = createFight('bernard', 'lola', 'bar', 5);
    for (const [a, b] of inputsFor(seed, n)) s = step(s, decodeInput(a), decodeInput(b));
    return s;
  };

  it('rejouer 10 000 pas avec les mêmes entrées donne exactement la même empreinte', () => {
    const a = play(42, 10_000);
    const b = play(42, 10_000);
    expect(hashState(a)).toBe(hashState(b));
    expect(a).toEqual(b);
    expect(a.step).toBe(10_000);
  });

  it('des entrées différentes donnent une empreinte différente', () => {
    expect(hashState(play(42, 2000))).not.toBe(hashState(play(43, 2000)));
  });

  it('l’état est un objet simple, copiable par JSON, et ne contient que des entiers', () => {
    const s = play(7, 3000);
    const copy = JSON.parse(JSON.stringify(s)) as FightState;
    expect(copy).toEqual(s);
    expect(hashState(step(copy, none, none))).toBe(hashState(step(s, none, none)));
    for (const f of s.f) for (const v of [f.x, f.y, f.t, f.vx, f.hp, f.guard, f.kb, f.mt, f.left]) expect(Number.isInteger(v)).toBe(true);
  });

  it('les règles de placement tiennent pendant 10 000 pas d’entrées au hasard', () => {
    let s = createFight('bernard', 'lola');
    const min = ARENA.wallMargin * SUB;
    const max = stageWidth('bar') - min;
    for (const [a, b] of inputsFor(99, 10_000)) {
      s = step(s, decodeInput(a), decodeInput(b));
      for (const f of s.f) {
        expect(f.x).toBeGreaterThanOrEqual(min);
        expect(f.x).toBeLessThanOrEqual(max);
        expect(f.y).toBeGreaterThanOrEqual(0);
      }
      expect(Math.abs(s.f[0].x - s.f[1].x)).toBeLessThanOrEqual(ARENA.maxSeparation * SUB);
    }
  });
});
