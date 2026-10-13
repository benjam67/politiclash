import { describe, expect, it } from 'vitest';
import { SIM } from '../../src/config/balance';
import { DummySource } from '../../src/input/sources';
import { createFight, hashState, step, type FightState } from '../../src/logic/fight';
import type { FighterId } from '../../src/config/roster';

/** Un match complet entre deux mannequins. */
function playMatch(seed: number, left: FighterId = 'aviateur', right: FighterId = 'doyen') {
  const a = new DummySource(seed);
  const b = new DummySource(seed + 1000);
  let s: FightState = createFight(left, right, 'bar', seed);
  const rounds: number[] = [];
  let start = 0;
  let hits = 0;
  while (s.phase !== 'matchEnd' && s.step < 60 * 60 * 20) {
    const prev = s.phase;
    s = step(s, a.read(s, 0), b.read(s, 1));
    hits += s.ev.filter((e) => e.t === 'hit').length;
    if (prev !== 'fight' && s.phase === 'fight') start = s.step;
    if (prev === 'fight' && s.phase === 'roundEnd') rounds.push((s.step - start) / SIM.stepsPerSecond);
  }
  return { s, rounds, hits };
}

describe('mannequin', () => {
  it('ne fait rien avant le début du combat', () => {
    const d = new DummySource(1);
    const s = createFight('aviateur', 'doyen');
    expect(Object.values(d.read(s, 1)).some(Boolean)).toBe(false);
  });

  it('20 matchs mannequin contre mannequin se terminent tous, avec des coups portés', () => {
    const all: number[] = [];
    const wins = [0, 0];
    for (let seed = 1; seed <= 20; seed++) {
      const { s, rounds, hits } = playMatch(seed);
      expect(s.phase, `match ${seed}`).toBe('matchEnd');
      expect(hits).toBeGreaterThan(10);
      wins[s.winner as 0 | 1] += 1;
      all.push(...rounds);
    }
    const mean = all.reduce((x, y) => x + y, 0) / all.length;
    console.log(`mannequins : ${all.length} rounds, durée moyenne ${mean.toFixed(1)} s, victoires gauche/droite ${wins.join('/')}`);
    expect(mean).toBeGreaterThan(8);
    expect(mean).toBeLessThanOrEqual(60);
  });

  it('un match rejoué avec les mêmes graines donne exactement le même état', () => {
    expect(hashState(playMatch(5).s)).toBe(hashState(playMatch(5).s));
  });
});
