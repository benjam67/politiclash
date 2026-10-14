import { describe, expect, it } from 'vitest';
import { AI_LEVELS } from '../../src/ai/ai';
import { PLAYABLE_IDS } from '../../src/config/roster';
import { playNetMatch } from '../../src/net/bench';
import type { PipeOptions } from '../../src/net/fakePipe';

// Validation de la phase 7a : 200 matchs IA contre IA par condition, reliés par le faux tuyau.
// Critère : tous se terminent, sans désynchronisation, avec le même état des deux côtés et le même
// résultat que le match rejoué hors réseau avec les mêmes entrées.
const MATCHES = 200;

function series(name: string, pipe: PipeOptions, delay: number) {
  let finished = 0;
  let same = 0;
  let replay = 0;
  let desyncs = 0;
  let maxDepth = 0;
  let steps = 0;
  let stalls = 0;
  let rollbacks = 0;
  let replayed = 0;
  let bytes = 0;
  for (let i = 0; i < MATCHES; i++) {
    const n = PLAYABLE_IDS.length;
    const r = playNetMatch({
      pipe,
      seed: 100 + i,
      left: PLAYABLE_IDS[i % n],
      right: PLAYABLE_IDS[Math.floor(i / n) % n],
      levels: [AI_LEVELS[i % 3], AI_LEVELS[(i + 1) % 3]],
      session: { delay },
    });
    finished += Number(r.finished);
    same += Number(r.same);
    replay += Number(r.replaySame);
    for (const st of r.stats) {
      desyncs += st.desyncs;
      maxDepth = Math.max(maxDepth, st.maxDepth);
      stalls += st.stalls;
      rollbacks += st.rollbacks;
      replayed += st.replayed;
    }
    steps += r.steps * 2;
    bytes += r.bytesPerSecond;
  }
  process.stderr.write(
    `${name.padEnd(34)} terminés ${finished}/${MATCHES}  identiques ${same}  = hors réseau ${replay}  désync ${desyncs}  ` +
      `retours/s ${((rollbacks / steps) * 60).toFixed(1)}  pas rejoués/image ${(replayed / steps).toFixed(2)}  plus long ${maxDepth}  ` +
      `images en attente ${((100 * stalls) / steps).toFixed(1)} %  ${(bytes / MATCHES / 1024).toFixed(1)} Ko/s\n`,
  );
  return { finished, same, replay, desyncs, maxDepth };
}

describe('jeu en ligne : 200 matchs par le faux tuyau', () => {
  for (const [name, pipe, delay] of [
    ['100 ms, retard 3', { latency: 100, jitter: 15 }, 3],
    ['200 ms + 5 % pertes, retard 3', { latency: 200, jitter: 25, loss: 0.05 }, 3],
    ['200 ms + 5 % pertes, retard 4', { latency: 200, jitter: 25, loss: 0.05 }, 4],
    ['200 ms + 5 % pertes, retard 6', { latency: 200, jitter: 25, loss: 0.05 }, 6],
    ['150 ms, retard 4', { latency: 150, jitter: 20 }, 4],
  ] as const) {
    it(name, () => {
      const r = series(name, pipe, delay);
      expect(r.finished).toBe(MATCHES);
      expect(r.same).toBe(MATCHES);
      expect(r.replay).toBe(MATCHES);
      expect(r.desyncs).toBe(0);
      expect(r.maxDepth).toBeLessThanOrEqual(8);
    });
  }
});
