import { describe, expect, it } from 'vitest';
import { AI_LEVELS, AI_PROFILES, AiSource } from '../../src/ai/ai';
import { playMatch } from '../../src/ai/simulate';
import { BUZZ } from '../../src/config/balance';
import { BUZZ_STEPS, createFight, createFightStarted, hashState, step, SUB, type FightState } from '../../src/logic/fight';
import { noInput, type InputFrame } from '../../src/logic/input';
import type { InputSource } from '../../src/input/sources';

const any = (i: InputFrame) => Object.values(i).some(Boolean);

/** Un « joueur » très simple : il avance au contact, puis appuie sur Gifle sans arrêt. */
class Masher implements InputSource {
  private n = 0;
  read(s?: FightState, me: 0 | 1 = 0): InputFrame {
    const i = noInput();
    if (!s || s.phase !== 'fight') return i;
    const self = s.f[me];
    const foe = s.f[me === 0 ? 1 : 0];
    const dist = Math.abs(foe.x - self.x) / SUB;
    if (dist > 100) i[foe.x > self.x ? 'droite' : 'gauche'] = true;
    else i.gifle = this.n++ % 4 < 2;
    return i;
  }
}

describe('IA', () => {
  it('ne fait rien pendant l’annonce du round', () => {
    const ai = new AiSource('hard', 1);
    expect(any(ai.read(createFight('aviateur', 'doyen'), 1))).toBe(false);
  });

  it('loin de l’adversaire, elle finit par s’approcher', () => {
    const ai = new AiSource('normal', 1);
    const s = createFightStarted('aviateur', 'doyen');
    let toward = 0;
    for (let i = 0; i < 120; i++) if (ai.read(s, 1).gauche) toward++;
    expect(toward).toBeGreaterThan(30);
  });

  it('les trois niveaux sont de plus en plus vifs et précis', () => {
    const [e, n, h] = AI_LEVELS.map((l) => AI_PROFILES[l]);
    expect(e.reaction).toBeGreaterThan(n.reaction);
    expect(n.reaction).toBeGreaterThan(h.reaction);
    expect(e.defend).toBeLessThan(n.defend);
    expect(n.defend).toBeLessThan(h.defend);
    expect(e.aimError).toBeGreaterThan(n.aimError);
    expect(n.aimError).toBeGreaterThan(h.aimError);
    // Même la plus vive ne réagit pas à l'instant : elle voit l'adversaire avec du retard.
    expect(h.reaction).toBeGreaterThanOrEqual(6);
  });

  it('ne se gifle jamais elle-même par surchauffe', () => {
    for (const level of AI_LEVELS) {
      const m = playMatch('aviateur', 'doyen', new AiSource(level, 3), new AiSource(level, 4), 9);
      expect(m.winner).toBeGreaterThanOrEqual(0);
    }
    let selfSlaps = 0;
    const a = new AiSource('easy', 5);
    const b = new AiSource('easy', 6);
    let s = createFight('aviateur', 'doyen', 'bar', 2);
    // On rejoue un match en comptant les autogifles.
    return import('../../src/logic/fight').then(({ step }) => {
      while (s.phase !== 'matchEnd' && s.step < 60 * 60 * 10) {
        s = step(s, a.read(s, 0), b.read(s, 1));
        selfSlaps += s.ev.filter((e) => e.t === 'self').length;
      }
      expect(selfSlaps).toBe(0);
    });
  });

  it('un match IA contre IA rejoué avec les mêmes graines est identique', () => {
    const play = () => playMatch('aviateur', 'doyen', new AiSource('hard', 11), new AiSource('normal', 12), 7);
    expect(hashState(play().final)).toBe(hashState(play().final));
  });

  /** Nombre de matchs gagnés par l'IA sur 20 contre le joueur qui gifle sans arrêt. */
  const versusMasher = (level: (typeof AI_LEVELS)[number]) => {
    let wins = 0;
    for (let seed = 1; seed <= 10; seed++) {
      for (const [l, r] of [['aviateur', 'doyen'], ['doyen', 'aviateur']] as const) {
        if (playMatch(l, r, new Masher(), new AiSource(level, seed), seed).winner === 1) wins++;
      }
    }
    return wins;
  };

  it('contre un joueur qui se contente de coller et de gifler : la Facile perd, la Difficile gagne', () => {
    const [easy, normal, hard] = AI_LEVELS.map(versusMasher);
    console.log(`contre le gifleur fou, victoires de l'IA sur 20 : facile ${easy}, normal ${normal}, difficile ${hard}`);
    expect(easy).toBeLessThanOrEqual(3);
    expect(hard).toBeGreaterThanOrEqual(17);
    expect(normal).toBeGreaterThanOrEqual(easy);
    expect(hard).toBeGreaterThanOrEqual(normal);
  });

  it('barre Buzz pleine : elle lance son coup spécial', () => {
    for (const level of AI_LEVELS) {
      const ai = new AiSource(level, 21);
      let s = createFightStarted('aviateur', 'doyen');
      s.f[1].buzz = BUZZ.max;
      let launched = false;
      for (let i = 0; i < 900 && !launched; i++) {
        s = step(s, noInput(), ai.read(s, 1));
        launched = s.ev.some((e) => e.t === 'special' && e.who === 1);
      }
      expect(launched, level).toBe(true);
    }
  });

  it('elle coupe le cercle de l’adversaire quand elle le voit se remplir (Difficile)', () => {
    let cut = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const ai = new AiSource('hard', seed);
      let s = createFightStarted('aviateur', 'doyen');
      const mid = (s.f[0].x + s.f[1].x) / 2;
      s.f[0].x = mid - 60 * SUB;
      s.f[1].x = mid + 60 * SUB;
      s.f[0].buzz = BUZZ.max;
      for (let i = 0; i < BUZZ_STEPS + 2; i++) {
        const hold = noInput();
        hold.grosseGifle = true;
        s = step(s, hold, ai.read(s, 1));
        if (s.ev.some((e) => e.t === 'buzzCancel')) {
          cut++;
          break;
        }
      }
    }
    expect(cut).toBeGreaterThanOrEqual(10);
  });

  it('pendant le coup spécial adverse, la Difficile pare bien plus souvent que la Facile', () => {
    const parries = (level: (typeof AI_LEVELS)[number]) => {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const ai = new AiSource(level, seed);
        let s = createFightStarted('aviateur', 'doyen');
        s.f[0].buzz = BUZZ.max;
        const hold = noInput();
        hold.grosseGifle = true;
        for (let i = 0; i < 400; i++) {
          s = step(s, s.cine ? noInput() : hold, ai.read(s, 1));
          const hit = s.ev.find((e) => e.t === 'specialHit');
          if (hit && hit.t === 'specialHit') {
            if (hit.parried) n++;
            break;
          }
        }
      }
      return n;
    };
    const [easy, normal, hard] = AI_LEVELS.map(parries);
    expect(hard).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(easy);
    expect(hard).toBeGreaterThanOrEqual(18);
  });
});
