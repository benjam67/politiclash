// Phase 7e : limites d'usage de la file, contrôle de version, suivi (fiches de 50 matchs en ligne d'essai).
import { describe, expect, it } from 'vitest';
import { DeviceLimits, MAX_CONNS_PER_DEVICE, MAX_MSGS_PER_WINDOW, MAX_OPENS_PER_MINUTE, MessageRate, WINDOW_MS } from '../../server/src/limits';
import { matchCounters, parseMatch, parseWait, waitCounters } from '../../server/src/stats';
import { FIGHTER_IDS } from '../../src/config/roster';
import { playNetMatch } from '../../src/net/bench';
import { matchCard } from '../../src/net/stats';
import { buildId, isOutdated } from '../../src/net/version';
import { summarize, type Row } from '../../src/stats/summary';
import { createFight } from '../../src/logic/fight';

describe('limites d’usage de la file d’attente', () => {
  it('connexions simultanées par appareil, libérées à la fermeture', () => {
    const l = new DeviceLimits();
    for (let i = 0; i < MAX_CONNS_PER_DEVICE; i++) expect(l.open('a', i)).toBe(true);
    expect(l.open('a', 10)).toBe(false);
    expect(l.open('b', 10)).toBe(true);
    l.close('a');
    expect(l.open('a', 20)).toBe(true);
  });

  it('reconnexions en boucle : refusées au-delà de la limite par minute, puis acceptées une minute après', () => {
    const l = new DeviceLimits();
    for (let i = 0; i < MAX_OPENS_PER_MINUTE; i++) {
      expect(l.open('a', i * 100)).toBe(true);
      l.close('a');
    }
    expect(l.open('a', 5000)).toBe(false);
    expect(l.open('a', 61_000)).toBe(true);
  });

  it('débit de messages d’une connexion', () => {
    const r = new MessageRate();
    for (let i = 0; i < MAX_MSGS_PER_WINDOW; i++) expect(r.hit(i)).toBe(true);
    expect(r.hit(100)).toBe(false);
    const slow = new MessageRate();
    for (let i = 0; i < 200; i++) expect(slow.hit((i * WINDOW_MS) / 10)).toBe(true);
  });
});

describe('contrôle de version', () => {
  const answer = (body: string, ok = true) => (async () => new Response(body, { status: ok ? 200 : 404 })) as unknown as typeof fetch;
  it('hors build publié : jamais « ancienne version »', async () => {
    expect(buildId('')).toBe('dev');
    expect(await isOutdated(answer('abcdef1234567'))).toBe(false);
  });

  it('build publié : ancienne version seulement si le site annonce une autre empreinte valide', async () => {
    const real = globalThis.location;
    Object.defineProperty(globalThis, 'location', { value: { search: '?build=aaaaaaa1111111' }, configurable: true });
    try {
      expect(await isOutdated(answer('aaaaaaa1111111\n'))).toBe(false);
      expect(await isOutdated(answer('bbbbbbb2222222'))).toBe(true);
      expect(await isOutdated(answer('<html>page introuvable</html>'))).toBe(false);
      expect(await isOutdated(answer('', false))).toBe(false);
      expect(await isOutdated((async () => Promise.reject(new Error('réseau'))) as unknown as typeof fetch)).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'location', { value: real, configurable: true });
    }
  });
});

describe('suivi du jeu en ligne', () => {
  it('fiches d’attente : vérifiées, comptées', () => {
    expect(waitCounters(parseWait({ outcome: 'match', secs: 12 })!)).toEqual([
      ['wait|n|match', 1],
      ['wait|secs|match', 12],
    ]);
    expect(parseWait({ outcome: 'autre', secs: 1 })).toBeNull();
    expect(parseWait({ outcome: 'ai', secs: -1 })).toBeNull();
  });

  it('match arrêté : seulement l’arrêt et la connexion, ni victoire ni dégâts', () => {
    const s = { ...createFight('aviateur', 'doyen'), step: 600, winner: 2 as const, dealt: [[5, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]] as [number[], number[]] };
    const c = parseMatch(JSON.parse(JSON.stringify(matchCard(s, { mode: 'primaire', human: [true, true], level: null, forfeit: false, aborted: 'desync', net: { desyncs: 3, resyncs: 2, stalls: 4 } }))));
    expect(new Map(matchCounters(c!))).toEqual(
      new Map([
        ['abort|primaire|desync', 1],
        ['net|primaire|n', 1],
        ['net|primaire|desyncs', 3],
        ['net|primaire|resyncs', 2],
        ['net|primaire|stalls', 4],
      ]),
    );
    expect(parseMatch({ ...JSON.parse(JSON.stringify(c)), aborted: 'autre' })).toBeNull();
    expect(parseMatch({ ...JSON.parse(JSON.stringify(c)), net: { desyncs: -1, resyncs: 0, stalls: 0 } })).toBeNull();
  });

  it('50 matchs en ligne d’essai (dont 5 avec un tricheur) : la page affiche des chiffres cohérents', () => {
    const rows: Row[] = [];
    let wins = 0;
    let finished = 0;
    for (let i = 0; i < 50; i++) {
      const cheat = i % 10 === 0;
      const left = FIGHTER_IDS[i % FIGHTER_IDS.length];
      const right = FIGHTER_IDS[(i + 1) % FIGHTER_IDS.length];
      const r = playNetMatch({ pipe: { latency: 60, jitter: 10 }, seed: 300 + i, left, right, stopOnDesyncs: true, ...(cheat ? { cheat: { who: 1 as const, every: 60 } } : {}), maxMs: 6 * 60 * 1000 });
      const s = { ...createFight(left, right), step: r.steps, winner: (r.finished ? r.winner : 2) as 0 | 1 | 2, round: 2 };
      const aborted = r.aborted.some(Boolean) ? ('desync' as const) : undefined;
      if (!aborted) {
        finished += 1;
        if (r.winner === 0 || r.winner === 1) wins += 1;
      }
      // La fiche part du téléphone qui a arrêté le match (celui qui a compté le plus de désynchronisations).
      const by = r.stats[1].desyncs > r.stats[0].desyncs ? 1 : 0;
      const card = matchCard(s, { mode: 'primaire', human: [true, true], level: null, forfeit: false, aborted, net: r.stats[by] });
      for (const [k, n] of matchCounters(parseMatch(JSON.parse(JSON.stringify(card)))!)) rows.push(['2026-11-08', k, n]);
    }
    const sum = summarize(rows, FIGHTER_IDS);
    expect(sum.online.primaire.measured).toBe(50);
    expect(sum.online.primaire.abortDesync).toBe(5);
    expect(sum.byMode.primaire.matches).toBe(finished);
    expect(finished).toBe(45);
    // Chaque match allé au bout compte deux présences et au plus une victoire.
    const plays = sum.fighters.reduce((t, f) => t + f.plays, 0);
    const won = sum.fighters.reduce((t, f) => t + f.wins, 0);
    expect(plays).toBe(2 * finished);
    expect(won).toBe(wins);
    // Sans triche, pas de désynchronisation : toutes viennent des 5 matchs du tricheur.
    expect(sum.online.primaire.desyncs).toBeGreaterThanOrEqual(5 * 3);
  }, 120_000);
});
