// Matchs IA contre IA sans affichage : pour régler l'équilibre et vérifier qu'un match se termine toujours.
import { SIM } from '../config/balance';
import type { FighterId } from '../config/roster';
import { createFight, step, type FightState } from '../logic/fight';
import type { InputSource } from '../input/sources';
import { AiSource, type AiLevel } from './ai';

export interface MatchReport {
  winner: 0 | 1 | -1;
  /** Durée de chaque round, en secondes. */
  rounds: number[];
  hits: number;
  final: FightState;
}

/** Durée maximale d'un match simulé (20 minutes de jeu) : au-delà, il est déclaré non terminé. */
const MAX_STEPS = 20 * 60 * SIM.stepsPerSecond;

export function playMatch(left: FighterId, right: FighterId, a: InputSource, b: InputSource, seed = 1): MatchReport {
  let s = createFight(left, right, 'bar', seed);
  const rounds: number[] = [];
  let start = 0;
  let hits = 0;
  while (s.phase !== 'matchEnd' && s.step < MAX_STEPS) {
    const prev = s.phase;
    s = step(s, a.read(s, 0), b.read(s, 1));
    for (const e of s.ev) if (e.t === 'hit') hits++;
    if (prev !== 'fight' && s.phase === 'fight') start = s.step;
    if (prev === 'fight' && s.phase === 'roundEnd') rounds.push((s.step - start) / SIM.stepsPerSecond);
  }
  return { winner: s.phase === 'matchEnd' ? (s.winner as 0 | 1) : -1, rounds, hits, final: s };
}

export interface SeriesReport {
  matches: number;
  finished: number;
  /** Victoires par combattant (clé : identifiant). */
  wins: Record<string, number>;
  meanRound: number;
  timeouts: number;
  totalRounds: number;
}

/** Série de matchs entre deux combattants, en alternant les côtés pour ne favoriser personne. */
export function playSeries(x: FighterId, y: FighterId, levelX: AiLevel, levelY: AiLevel, matches: number, seed = 1): SeriesReport {
  const wins: Record<string, number> = { [x]: 0, [y]: 0 };
  if (x === y) wins[`${y}#2`] = 0;
  const all: number[] = [];
  let finished = 0;
  let timeouts = 0;
  for (let i = 0; i < matches; i++) {
    const swap = i % 2 === 1;
    const [l, r] = swap ? [y, x] : [x, y];
    const [ll, lr] = swap ? [levelY, levelX] : [levelX, levelY];
    const m = playMatch(l, r, new AiSource(ll, seed * 1000 + i * 2), new AiSource(lr, seed * 1000 + i * 2 + 1), seed + i);
    if (m.winner >= 0) {
      finished++;
      const first = (m.winner === 0) !== swap;
      wins[first ? x : x === y ? `${y}#2` : y] += 1;
    }
    all.push(...m.rounds);
    timeouts += m.rounds.filter((d) => d >= 59.99).length;
  }
  return { matches, finished, wins, meanRound: all.reduce((p, q) => p + q, 0) / Math.max(1, all.length), timeouts, totalRounds: all.length };
}
