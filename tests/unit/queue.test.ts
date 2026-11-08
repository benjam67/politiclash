import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/logic/rng';
import { ACCEPT_MS, MatchQueue, REGION_WAIT_MS, type Player, type QueueEvent } from '../../server/src/queue';

let ids = 0;
const q0 = () => new MatchQueue(() => 0.5, () => `M${++ids}`);
const P = (id: string, region = 'EU', v = 'v1', pseudo = 0): Player => ({ id, v, region, pseudo });
const of = (ev: QueueEvent[], t: QueueEvent['t']) => ev.filter((e) => e.t === t);

/** Accepte toutes les propositions reçues (comme le jeu pendant la recherche). */
function acceptAll(q: MatchQueue, ev: QueueEvent[], now: number): QueueEvent[] {
  const out = [...ev];
  for (const e of ev) if (e.t === 'found') out.push(...q.accept(e.to, e.match, now));
  return out;
}

describe('file d’attente', () => {
  it('deux joueurs : proposition, puis match quand les deux acceptent ; le plus ancien est l’hôte', () => {
    const q = q0();
    expect(q.join(P('a', 'EU', 'v1', 3), 0)).toEqual([]);
    const ev = q.join(P('b', 'EU', 'v1', 7), 1000);
    const found = of(ev, 'found') as Extract<QueueEvent, { t: 'found' }>[];
    expect(found.map((e) => e.to).sort()).toEqual(['a', 'b']);
    expect(found.find((e) => e.to === 'a')!.foe).toBe(7);
    expect(q.accept('a', found[0].match, 1500)).toEqual([]);
    const m = q.accept('b', found[0].match, 1600) as Extract<QueueEvent, { t: 'match' }>[];
    expect(m.find((e) => e.to === 'a')).toMatchObject({ role: 'host', foe: 7 });
    expect(m.find((e) => e.to === 'b')).toMatchObject({ role: 'guest', foe: 3 });
    expect(m[0].seed).toBe(m[1].seed);
    expect(q.searching).toBe(0);
  });

  it('les plus anciens d’abord', () => {
    const q = q0();
    q.join(P('a'), 0);
    // b et c arrivent en même temps : a part avec b (le plus ancien des deux restants), c attend.
    const ev = acceptAll(q, [...q.join(P('b'), 10), ...q.join(P('c'), 20)], 30);
    const matched = of(ev, 'match').map((e) => e.to).sort();
    expect(matched).toEqual(['a', 'b']);
    expect(q.isWaiting('c')).toBe(true);
  });

  it('même région d’abord ; une autre région seulement après 20 s', () => {
    const q = q0();
    q.join(P('eu1', 'EU'), 0);
    q.join(P('na1', 'NA'), 100);
    expect(q.searching).toBe(2);
    expect(of(q.tick(REGION_WAIT_MS - 1), 'found')).toHaveLength(0);
    // Un joueur de la même région arrive avant 20 s : c'est lui qui est choisi.
    const ev = q.join(P('eu2', 'EU'), 5000);
    expect(of(ev, 'found').map((e) => e.to).sort()).toEqual(['eu1', 'eu2']);
    // Le joueur d'Amérique, seul, finit par être associé quand un autre attend depuis 20 s.
    q.join(P('as1', 'AS'), 6000);
    expect(of(q.tick(19_000), 'found')).toHaveLength(0);
    expect(of(q.tick(REGION_WAIT_MS + 100), 'found').map((e) => e.to).sort()).toEqual(['as1', 'na1']);
  });

  it('versions différentes : jamais associées', () => {
    const q = q0();
    q.join(P('a', 'EU', 'v1'), 0);
    expect(of(q.join(P('b', 'EU', 'v2'), 0), 'found')).toHaveLength(0);
    expect(of(q.tick(60_000), 'found')).toHaveLength(0);
  });

  it('refus ou pas de réponse en 10 s : il sort, l’autre retourne dans la file à sa place', () => {
    const q = q0();
    q.join(P('a'), 0);
    const f = of(q.join(P('b'), 0), 'found')[0] as Extract<QueueEvent, { t: 'found' }>;
    q.accept('a', f.match, 100);
    const ev = q.tick(ACCEPT_MS + 1);
    expect(ev).toContainEqual({ to: 'b', t: 'dropped' });
    expect(ev).toContainEqual({ to: 'a', t: 'requeued' });
    expect(q.isWaiting('a')).toBe(true);
    expect(q.isWaiting('b')).toBe(false);
    // Refus explicite.
    const f2 = of(q.join(P('c'), ACCEPT_MS + 2), 'found')[0] as Extract<QueueEvent, { t: 'found' }>;
    const ev2 = q.decline('c', f2.match, ACCEPT_MS + 3);
    expect(ev2).toContainEqual({ to: 'c', t: 'dropped' });
    expect(ev2).toContainEqual({ to: 'a', t: 'requeued' });
  });

  it('départ pendant une proposition : l’autre retourne dans la file', () => {
    const q = q0();
    q.join(P('a'), 0);
    q.join(P('b'), 0);
    expect(q.leave('b', 50)).toContainEqual({ to: 'a', t: 'requeued' });
    expect(q.isWaiting('a')).toBe(true);
  });

  it('20 faux joueurs entrent et sortent au hasard : chacun finit associé ou sorti proprement, personne deux fois', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rnd = createRng(seed);
      const q = new MatchQueue(rnd, () => `S${seed}-${++ids}`);
      const players = Array.from({ length: 20 }, (_, i) => P(`p${i}`, rnd() < 0.7 ? 'EU' : 'AF', rnd() < 0.9 ? 'v1' : 'v2'));
      const state = new Map<string, 'out' | 'in' | 'matched' | 'left'>(players.map((p) => [p.id, 'out']));
      const matchedWith = new Map<string, string>();
      const handle = (ev: QueueEvent[], now: number) => {
        const more: QueueEvent[] = [];
        for (const e of ev) {
          if (e.t === 'found') {
            // 90 % acceptent, 10 % ne répondent pas (ils seront sortis au bout de 10 s).
            if (rnd() < 0.9) more.push(...q.accept(e.to, e.match, now));
          } else if (e.t === 'match') {
            expect(state.get(e.to)).toBe('in');
            expect(matchedWith.has(e.to)).toBe(false);
            matchedWith.set(e.to, e.match);
            state.set(e.to, 'matched');
          } else if (e.t === 'dropped') {
            expect(state.get(e.to)).toBe('in');
            state.set(e.to, 'out');
          }
        }
        if (more.length) handle(more, now);
      };
      let now = 0;
      for (let step = 0; step < 400; step++) {
        now += Math.floor(rnd() * 800);
        const p = players[Math.floor(rnd() * players.length)];
        const st = state.get(p.id);
        if (st === 'out' && rnd() < 0.6) {
          state.set(p.id, 'in');
          handle(q.join(p, now), now);
        } else if (st === 'in' && rnd() < 0.25) {
          state.set(p.id, 'left');
          handle(q.leave(p.id, now), now);
        }
        handle(q.tick(now), now);
      }
      // Fin : plus personne n'arrive. Ceux qui restent dans la file sont associés, ou y attendent un joueur de leur version.
      for (let k = 0; k < 120; k++) {
        now += 1000;
        handle(q.tick(now), now);
      }
      // Chaque match réunit exactement deux joueurs.
      const byMatch = new Map<string, string[]>();
      for (const [pid, m] of matchedWith) byMatch.set(m, [...(byMatch.get(m) ?? []), pid]);
      for (const ps of byMatch.values()) expect(ps).toHaveLength(2);
      // Ceux qui attendent encore : au plus un par version.
      const left = players.filter((p) => state.get(p.id) === 'in');
      for (const p of left) expect(q.isWaiting(p.id)).toBe(true);
      const versions = left.map((p) => p.v);
      expect(new Set(versions).size).toBe(versions.length);
      // Ceux qui sont sortis ne sont plus dans la file.
      for (const p of players) if (state.get(p.id) !== 'in') expect(q.isWaiting(p.id)).toBe(false);
    }
  });
});
