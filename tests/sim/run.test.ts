import { describe, expect, it } from 'vitest';
import { AI_LEVELS } from '../../src/ai/ai';
import { playSeries, type SeriesReport } from '../../src/ai/simulate';
import { FIGHTER_IDS } from '../../src/config/roster';

// `npm run sim` : 200 matchs IA contre IA par affiche, sans affichage.
// Critères de la roadmap : un match se termine toujours, un round dure en moyenne entre 20 et 50 s,
// un ou deux coups spéciaux par round en moyenne, aucun combattant au-dessus de 60 % de victoires à niveau d'IA égal.
const MATCHES = 200;
const line = (name: string, r: SeriesReport) =>
  process.stderr.write(
    `${name.padEnd(30)} terminés ${r.finished}/${r.matches}  round moyen ${r.meanRound.toFixed(1)} s  spéciaux/round ${r.specialsPerRound.toFixed(2)}  au chrono ${Math.round((100 * r.timeouts) / r.totalRounds)} %  ` +
      Object.entries(r.wins)
        .map(([k, v]) => `${k} ${Math.round((100 * v) / r.matches)} %`)
        .join('  ') +
      '\n',
  );

describe('équilibre à niveau égal', () => {
  for (const level of AI_LEVELS) {
    for (let i = 0; i < FIGHTER_IDS.length; i++) {
      for (let j = i + 1; j < FIGHTER_IDS.length; j++) {
        const [x, y] = [FIGHTER_IDS[i], FIGHTER_IDS[j]];
        it(`${x} contre ${y}, IA ${level}`, () => {
          const r = playSeries(x, y, level, level, MATCHES, 1);
          line(`${x} / ${y}, ${level}`, r);
          expect(r.finished).toBe(MATCHES);
          expect(r.meanRound).toBeGreaterThanOrEqual(20);
          expect(r.meanRound).toBeLessThanOrEqual(50);
          expect(r.specialsPerRound).toBeGreaterThanOrEqual(1);
          expect(r.specialsPerRound).toBeLessThanOrEqual(2);
          for (const w of Object.values(r.wins)) expect(w / MATCHES).toBeLessThanOrEqual(0.6);
        });
      }
    }
  }
});

describe('combats miroir', () => {
  for (const id of FIGHTER_IDS) {
    it(`${id} contre ${id} : le côté ne donne pas d’avantage`, () => {
      const r = playSeries(id, id, 'normal', 'normal', MATCHES, 2);
      line(`${id} miroir, normal`, r);
      expect(r.finished).toBe(MATCHES);
      for (const w of Object.values(r.wins)) expect(w / MATCHES).toBeLessThanOrEqual(0.6);
    });
  }
});

describe('les niveaux sont bien rangés', () => {
  const [x, y] = [FIGHTER_IDS[0], FIGHTER_IDS[1]];
  for (const [strong, weak] of [['normal', 'easy'], ['hard', 'normal']] as const) {
    it(`${strong} bat ${weak} plus de 3 fois sur 4, quel que soit le combattant`, () => {
      const a = playSeries(x, y, strong, weak, MATCHES, 3);
      const b = playSeries(x, y, weak, strong, MATCHES, 4);
      line(`${x} ${strong} / ${y} ${weak}`, a);
      line(`${x} ${weak} / ${y} ${strong}`, b);
      expect(a.wins[x] / MATCHES).toBeGreaterThan(0.75);
      expect(b.wins[y] / MATCHES).toBeGreaterThan(0.75);
    });
  }
});
