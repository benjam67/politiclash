import { it } from 'vitest';
import { AiSource } from '../../src/ai/ai';
import { FIGHTER_IDS } from '../../src/config/roster';
import { createFight, step } from '../../src/logic/fight';

it('probe', () => {
  for (const level of ['easy', 'normal', 'hard'] as const) {
    let rounds = 0, specials = 0, parried = 0, dur = 0, wins: Record<string, number> = {}, dodges = 0, hits = 0, kos = 0;
    for (let i = 0; i < 60; i++) {
      const l = FIGHTER_IDS[i % 6], r = FIGHTER_IDS[(i * 5 + 1) % 6 === i % 6 ? (i + 1) % 6 : (i * 5 + 1) % 6];
      let s = createFight(l, r, 'bar', i + 1);
      const a = new AiSource(level, i * 2 + 1), b = new AiSource(level, i * 2 + 2);
      let start = 0;
      while (s.phase !== 'matchEnd' && s.step < 72000) {
        const prev = s.phase;
        s = step(s, a.read(s, 0), b.read(s, 1));
        for (const e of s.ev) {
          if (e.t === 'specialHit') { specials++; if (e.parried) parried++; }
          if (e.t === 'dodge') dodges++;
          if (e.t === 'hit') hits++;
          if (e.t === 'ko') kos++;
        }
        if (prev !== 'fight' && s.phase === 'fight') start = s.step;
        if (prev === 'fight' && s.phase === 'roundEnd') { rounds++; dur += (s.step - start) / 60; }
      }
      const w = s.winner === 0 ? l : r;
      wins[w] = (wins[w] ?? 0) + 1;
    }
    process.stderr.write([level, 'rounds', rounds, 'mean', (dur / rounds).toFixed(1), 'specials/round', (specials / rounds).toFixed(2), 'parried', parried, 'dodges/round', (dodges / rounds).toFixed(1), 'hits/round', (hits / rounds).toFixed(1), 'ko', kos, JSON.stringify(wins)].join(' ') + '\n');
  }
}, 600000);
