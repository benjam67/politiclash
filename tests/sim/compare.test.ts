import { expect, it } from 'vitest';
import { AI_PROFILES, AiSource, type AiProfile, type AiLevel } from '../../src/ai/ai';
import { playMatch } from '../../src/ai/simulate';
import { FIGHTER_IDS } from '../../src/config/roster';

/** Réglages d'avant le renforcement du 15 octobre : le nouveau Normal et le nouveau Difficile doivent les battre nettement. */
const OLD: Record<AiLevel, AiProfile> = {
  easy: { reaction: 26, think: [26, 60], defend: 0.12, duck: 0, punish: 0.25, combo: 0.3, mix: 0.1, interrupt: 0.15, breakGuard: 0.05, bigShare: 0.3, aimError: 22, buzzUse: 0.4, buzzSafe: false, parry: 0.1 },
  normal: { reaction: 15, think: [12, 32], defend: 0.45, duck: 0.15, punish: 0.6, combo: 0.7, mix: 0.25, interrupt: 0.5, breakGuard: 0.3, bigShare: 0.22, aimError: 9, buzzUse: 0.6, buzzSafe: true, parry: 0.35 },
  hard: { reaction: 8, think: [4, 16], defend: 0.8, duck: 0.4, punish: 0.95, combo: 0.9, mix: 0.4, interrupt: 0.85, breakGuard: 0.6, bigShare: 0.2, aimError: 3.5, buzzUse: 0.85, buzzSafe: true, parry: 0.65 },
};

function versus(newLv: AiLevel, oldLv: AiLevel, n: number) {
  let w = 0;
  for (let i = 0; i < n; i++) {
    const ids = FIGHTER_IDS.filter((id) => !['bernard', 'lola'].includes(id));
    const a = ids[i % ids.length], b = ids[(i * 7 + 3) % ids.length];
    const swap = i % 2 === 1;
    const nw = new AiSource(newLv, 100 + i * 2, AI_PROFILES[newLv]);
    const od = new AiSource(oldLv, 101 + i * 2, OLD[oldLv]);
    const m = playMatch(swap ? b : a, swap ? a : b, swap ? od : nw, swap ? nw : od, 50 + i);
    if (m.winner === (swap ? 1 : 0)) w++;
  }
  return w / n;
}

it('Normal et Difficile renforcés, Facile inchangé', () => {
  const n = 200;
  const r = (a: AiLevel, b: AiLevel) => {
    const p = versus(a, b, n);
    process.stderr.write(`nouveau ${a} contre ancien ${b} : ${Math.round(100 * p)} %\n`);
    return p;
  };
  expect(r('normal', 'normal')).toBeGreaterThanOrEqual(0.65);
  expect(r('hard', 'hard')).toBeGreaterThanOrEqual(0.65);
  expect(r('hard', 'normal')).toBeGreaterThanOrEqual(0.85);
  expect(AI_PROFILES.easy).toEqual(OLD.easy);
});
