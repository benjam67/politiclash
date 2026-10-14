// Banc d'essai : deux sessions reliées par deux faux tuyaux, chaque côté joué par une IA qui ne voit que
// son propre écran (l'état avec prédictions). Sert aux tests et à `npm run sim`.
import { SIM } from '../config/balance';
import type { FighterId } from '../config/roster';
import { AiSource, type AiLevel } from '../ai/ai';
import { createFight, hashState, step, STEP_MS, type FightState } from '../logic/fight';
import { decodeInput, noInput } from '../logic/input';
import { FakePipe, type PipeOptions } from './fakePipe';
import { NetSession, type NetMsg, type NetStatus, type SessionOptions, type SessionStats } from './rollback';

export interface NetMatchOptions {
  left?: FighterId;
  right?: FighterId;
  levels?: [AiLevel, AiLevel];
  seed?: number;
  pipe: PipeOptions;
  session?: SessionOptions;
  /** Coupures du tuyau (ms de jeu), dans les deux sens. */
  cuts?: [number, number][];
  /** L'horloge du second téléphone va un peu plus vite (1,01 : 1 % plus vite). */
  clockDrift?: number;
  /** Fausse un état chez l'invité à ce pas (essai du recalage). */
  corruptAt?: number;
  /** Durée maximale (ms de jeu). */
  maxMs?: number;
}

export interface NetMatchReport {
  finished: boolean;
  /** Les deux téléphones ont le même état final, identique au match rejoué hors réseau avec les mêmes entrées. */
  same: boolean;
  replaySame: boolean;
  winner: number;
  steps: number;
  ms: number;
  stats: [SessionStats, SessionStats];
  /** États de connexion vus (côté hôte), avec leur durée cumulée (ms). */
  statusMs: Record<NetStatus, number>;
  /** Un côté a déclaré le match perdu (coupure trop longue). */
  lost: boolean;
  bytesPerSecond: number;
  /** Événements annoncés à chaque téléphone, par type (après retours en arrière : chacun une seule fois). */
  events: [Record<string, number>, Record<string, number>];
  /** Les mêmes, comptés sur le match rejoué hors réseau. */
  replayEvents: Record<string, number>;
}

const count = (into: Record<string, number>, list: { t: string }[]) => {
  for (const e of list) into[e.t] = (into[e.t] ?? 0) + 1;
};

export function playNetMatch(o: NetMatchOptions): NetMatchReport {
  const seed = o.seed ?? 1;
  const left = o.left ?? 'aviateur';
  const right = o.right ?? 'doyen';
  const [la, lb] = o.levels ?? ['hard', 'hard'];
  const init = createFight(left, right, 'bar', seed);
  const ab = new FakePipe<NetMsg>({ ...o.pipe, seed: seed * 7 + 1 });
  const ba = new FakePipe<NetMsg>({ ...o.pipe, seed: seed * 7 + 2 });
  for (const [x, y] of o.cuts ?? []) {
    ab.cut(x, y);
    ba.cut(x, y);
  }
  let now = 0;
  const sa = new NetSession(0, init, (m) => ab.send(now, m), { ...o.session, keepLog: true });
  const sb = new NetSession(1, init, (m) => ba.send(now, m), { ...o.session, keepLog: true });
  const ai: [AiSource, AiSource] = [new AiSource(la, seed * 1000), new AiSource(lb, seed * 1000 + 1)];
  const maxMs = o.maxMs ?? 25 * 60 * 1000;
  const drift = o.clockDrift ?? 1;
  const statusMs: Record<NetStatus, number> = { ok: 0, unstable: 0, paused: 0, lost: 0 };
  // Chaque téléphone a sa propre horloge d'images.
  let nextA = 0;
  let nextB = 0;
  let lost = false;
  let corrupted = false;
  const events: [Record<string, number>, Record<string, number>] = [{}, {}];
  const dt = 1;
  for (; now < maxMs; now += dt) {
    for (const m of ab.deliver(now)) sb.receive(now, m);
    for (const m of ba.deliver(now)) sa.receive(now, m);
    if (now >= nextA) {
      nextA += STEP_MS;
      sa.tick(now, sa.frame >= 0 ? ai[0].read(sa.state, 0) : noInput());
      count(events[0], sa.drainEvents());
      const st = sa.status(now);
      statusMs[st] += STEP_MS;
    }
    if (now >= nextB) {
      nextB += STEP_MS / drift;
      sb.tick(now, ai[1].read(sb.state, 1));
      count(events[1], sb.drainEvents());
      if (o.corruptAt !== undefined && !corrupted && sb.frame >= o.corruptAt) {
        corrupted = true;
        corrupt(sb);
      }
    }
    if (sa.status(now) === 'lost' || sb.status(now) === 'lost') {
      lost = true;
      break;
    }
    if (sa.finished && sb.finished) break;
  }
  const finished = sa.finished && sb.finished;
  const ha = hashState(sa.confirmedState);
  const hb = hashState(sb.confirmedState);
  // Le même match, rejoué hors réseau avec les entrées confirmées.
  let replaySame = false;
  const replayEvents: Record<string, number> = {};
  if (finished && sa.log) {
    let s: FightState = init;
    const n = sa.confirmedFrame;
    for (let f = 0; f < n; f++) {
      s = step(s, decodeInput(sa.log.local[f]), decodeInput(sa.log.remote[f]));
      count(replayEvents, s.ev.filter((e) => e.t !== 'matchEnd'));
    }
    replaySame = hashState(s) === ha;
  }
  return {
    finished,
    same: ha === hb && sa.confirmedFrame === sb.confirmedFrame,
    replaySame,
    winner: sa.confirmedState.winner,
    steps: sa.confirmedFrame,
    ms: now,
    stats: [sa.stats, sb.stats],
    statusMs,
    lost,
    bytesPerSecond: ((ab.bytes + ba.bytes) / 2 / Math.max(1, now)) * 1000,
    events,
    replayEvents,
  };
}

/**
 * Fausse l'état de l'invité (comme un bug de calcul ou une triche) : ses PV remontent. On fausse le dernier
 * état confirmé, qu'aucun retour en arrière ne recalcule, puis on rejoue jusqu'au pas actuel.
 */
function corrupt(s: NetSession) {
  const any = s as unknown as { states: Map<number, FightState>; frame: number; simulate(f: number): void };
  const c = s.confirmedFrame;
  const st = any.states.get(c) as FightState;
  any.states.set(c, { ...st, f: [st.f[0], { ...st.f[1], hp: st.f[1].hp + 37 }] });
  for (let f = c; f < any.frame; f++) any.simulate(f);
}

/** Pas par seconde (pour les rapports). */
export const STEPS_PER_S = SIM.stepsPerSecond;
