import { describe, expect, it } from 'vitest';
import { createFight, createFightStarted, hashState, STEP_MS } from '../../src/logic/fight';
import { noInput } from '../../src/logic/input';
import { playNetMatch } from '../../src/net/bench';
import { FakePipe } from '../../src/net/fakePipe';
import { delayForPing, NET_TIMING, NetSession, type NetMsg } from '../../src/net/rollback';

const MID = { latency: 100, jitter: 15 };
const BAD = { latency: 200, jitter: 25, loss: 0.05 };

describe('faux tuyau', () => {
  it('retarde, mélange, perd et coupe', () => {
    const p = new FakePipe<number>({ latency: 100, jitter: 30, loss: 0.1, seed: 4 });
    for (let t = 0; t < 1000; t++) p.send(t, t);
    p.cut(2000, 2100);
    p.send(2050, -1);
    const got = p.deliver(5000);
    expect(p.lost).toBeGreaterThan(70);
    expect(p.lost).toBeLessThan(140);
    expect(got).not.toContain(-1);
    // Gigue : des paquets arrivent dans le désordre.
    expect(got.some((v, i) => i > 0 && v < got[i - 1])).toBe(true);
    expect(p.deliver(0)).toEqual([]);
  });
});

describe('session en ligne', () => {
  it('réseau parfait : aucun retour en arrière, même match des deux côtés', () => {
    const r = playNetMatch({ pipe: { latency: 0 }, seed: 1 });
    expect(r).toMatchObject({ finished: true, same: true, replaySame: true, lost: false });
    expect(r.stats[0].rollbacks).toBe(0);
    expect(r.stats[0].checks).toBeGreaterThan(30);
    expect(r.stats[0].desyncs).toBe(0);
  });

  for (const [name, pipe] of [
    ['100 ms', MID],
    ['200 ms et 5 % de pertes', BAD],
  ] as const) {
    it(`${name} : même état final des deux côtés, identique au match rejoué hors réseau`, () => {
      for (const seed of [2, 3]) {
        const r = playNetMatch({ pipe, seed });
        expect(r).toMatchObject({ finished: true, same: true, replaySame: true, lost: false });
        for (const st of r.stats) {
          expect(st.rollbacks).toBeGreaterThan(20);
          expect(st.maxDepth).toBeLessThanOrEqual(8);
          expect(st.desyncs).toBe(0);
        }
      }
    });
  }

  it('les annonces (round, K.O., fin de round) passent une seule fois, et seulement si elles ont eu lieu', () => {
    for (const seed of [1, 2, 3, 4]) {
      const r = playNetMatch({ pipe: BAD, seed });
      for (const ev of r.events) {
        for (const t of ['round', 'fight', 'ko', 'roundEnd', 'timeup']) expect(ev[t] ?? 0).toBe(r.replayEvents[t] ?? 0);
        // Les effets prédits puis démentis restent rares.
        expect(Math.abs((ev.hit ?? 0) - (r.replayEvents.hit ?? 0))).toBeLessThanOrEqual(3);
      }
    }
  });

  it('un état faussé chez l’invité est détecté, et l’invité se recale sur l’hôte', () => {
    const r = playNetMatch({ pipe: MID, seed: 5, corruptAt: 900 });
    expect(r.stats[0].desyncs).toBeGreaterThanOrEqual(1);
    expect(r.stats[1].resyncs).toBeGreaterThanOrEqual(1);
    expect(r).toMatchObject({ finished: true, same: true, replaySame: true });
  });

  it('horloge d’un téléphone 2 % plus rapide : il attend de temps en temps, le match se finit', () => {
    const r = playNetMatch({ pipe: MID, seed: 6, clockDrift: 1.02 });
    expect(r).toMatchObject({ finished: true, same: true, replaySame: true });
    expect(r.stats[1].waits).toBeGreaterThan(10);
  });

  it('coupure de 2 s : « instable », puis reprise', () => {
    const r = playNetMatch({ pipe: MID, seed: 7, cuts: [[20_000, 22_000]] });
    expect(r).toMatchObject({ finished: true, same: true, lost: false });
    expect(r.statusMs.unstable).toBeGreaterThan(1500);
    expect(r.statusMs.paused).toBe(0);
  });

  it('coupure de 8 s : pause, puis reprise', () => {
    const r = playNetMatch({ pipe: MID, seed: 8, cuts: [[20_000, 28_000]] });
    expect(r).toMatchObject({ finished: true, same: true, lost: false });
    expect(r.statusMs.paused).toBeGreaterThan(4000);
  });

  it('coupure de plus de 15 s : match perdu', () => {
    const r = playNetMatch({ pipe: MID, seed: 9, cuts: [[20_000, 60_000]] });
    expect(r.lost).toBe(true);
    expect(r.finished).toBe(false);
    expect(r.ms).toBeLessThan(20_000 + NET_TIMING.lostMs + 1000);
  });

  it('l’adversaire ne répond pas : le jeu avance de 8 pas au plus, puis attend', () => {
    const sent: NetMsg[] = [];
    const s = new NetSession(0, createFightStarted('aviateur', 'doyen', 'bar', 1), (m) => sent.push(m));
    let t = 0;
    for (let i = 0; i < 30; i++) s.tick((t += STEP_MS), noInput());
    expect(s.frame).toBe(8);
    expect(s.stats.stalls).toBe(22);
    expect(s.status(t)).toBe('unstable');
    // Chaque paquet renvoie toutes les entrées pas encore confirmées par l'autre.
    const last = sent.filter((m) => m.t === 'in').pop() as Extract<NetMsg, { t: 'in' }>;
    expect(last.from).toBe(0);
    // Pas 0 à 11 : les 8 joués, plus le retard de 3 et l'entrée en attente.
    expect(last.in.length).toBe(s.frame + 3 + 1);
  });

  it('les entrées sont appliquées avec le retard prévu', () => {
    const init = createFight('aviateur', 'doyen', 'bar', 1);
    const a = new NetSession(0, init, () => {}, { delay: 4 });
    a.tick(0, { ...noInput(), droite: true });
    const log = (a as unknown as { local: Map<number, number> }).local;
    expect([...log.entries()].filter(([, v]) => v !== 0).map(([f]) => f)).toEqual([4]);
    expect(hashState(a.state)).toBe(hashState(a.state));
  });

  it('retard conseillé selon le ping : 3 pas en temps normal, jusqu’à 6 sur un réseau lent', () => {
    expect(delayForPing(40)).toBe(3);
    expect(delayForPing(200)).toBe(3);
    expect(delayForPing(300)).toBe(3);
    expect(delayForPing(320)).toBe(4);
    expect(delayForPing(400)).toBe(6);
    expect(delayForPing(2000)).toBe(6);
  });
});
