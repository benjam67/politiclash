import { describe, expect, it } from 'vitest';
import { AI_LEVELS } from '../../src/ai/ai';
import { FIGHTER_IDS } from '../../src/config/roster';
import { STAGE_IDS } from '../../src/config/stages';
import { DEALT_MOVES } from '../../src/logic/fight';
import { matchCard } from '../../src/net/stats';
import { createFight } from '../../src/logic/fight';
import { campaignCounters, FIGHTERS, LEVELS, matchCounters, MOVES, parseCampaign, parseMatch, sameKey, STAGES } from '../../server/src/stats';

const card = {
  mode: 'libre',
  f: ['aviateur', 'doyen'],
  human: [true, false],
  winner: 0,
  stage: 'bar',
  level: 'normal',
  secs: 95,
  rounds: 2,
  dealt: [
    [100, 0, 70, 0, 260, 350],
    [50, 70, 0, 60, 0, 0],
  ],
  forfeit: false,
};

describe('statistiques de jeu (serveur)', () => {
  it('le serveur connaît les mêmes persos, lieux, niveaux et coups que le jeu', () => {
    expect([...FIGHTERS].sort()).toEqual([...FIGHTER_IDS].sort());
    expect([...STAGES].sort()).toEqual([...STAGE_IDS].sort());
    expect([...LEVELS]).toEqual([...AI_LEVELS]);
    expect([...MOVES]).toEqual([...DEALT_MOVES]);
  });

  it('accepte une fiche correcte et en tire les compteurs', () => {
    const c = parseMatch(card);
    expect(c).not.toBeNull();
    const m = new Map(matchCounters(c!));
    expect(m.get('match|libre')).toBe(1);
    expect(m.get('secs|libre')).toBe(95);
    expect(m.get('pick|libre|aviateur')).toBe(1);
    expect(m.get('hwin|libre|aviateur')).toBe(1);
    expect(m.has('pick|libre|doyen')).toBe(false);
    expect(m.get('play|libre|doyen')).toBe(1);
    expect(m.has('win|libre|doyen')).toBe(false);
    expect(m.get('dmg|aviateur|special')).toBe(350);
    expect(m.get('dmg|doyen|air')).toBe(70);
    expect(m.has('dmg|aviateur|air')).toBe(false);
    expect(m.get('level|normal')).toBe(1);
    expect(m.get('stage|bar')).toBe(1);
  });

  it('refuse les fiches incorrectes', () => {
    const bad = [
      null,
      'x',
      { ...card, mode: 'autre' },
      { ...card, f: ['aviateur', 'inconnu'] },
      { ...card, f: ['aviateur'] },
      { ...card, human: [true, 'oui'] },
      { ...card, winner: 3 },
      { ...card, stage: 'lune' },
      { ...card, level: 'expert' },
      { ...card, secs: -1 },
      { ...card, secs: 1.5 },
      { ...card, rounds: 0 },
      { ...card, dealt: [[1, 2, 3], [0, 0, 0, 0, 0, 0]] },
      { ...card, dealt: [[0, 0, 0, 0, 0, 1e9], [0, 0, 0, 0, 0, 0]] },
      { ...card, dealt: [['a', 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]] },
    ];
    for (const b of bad) expect(parseMatch(b), JSON.stringify(b)).toBeNull();
    expect(parseMatch({ ...card, level: null })?.level).toBeNull();
  });

  it('campagne : début, fin (avec les recomptages), abandon', () => {
    expect(campaignCounters(parseCampaign({ event: 'start', fighter: 'cadet' })!)).toEqual([['camp|start|cadet', 1]]);
    expect(campaignCounters(parseCampaign({ event: 'done', fighter: 'cadet', retries: 4 })!)).toEqual([
      ['camp|done|cadet', 1],
      ['camp|retries|cadet', 4],
    ]);
    expect(parseCampaign({ event: 'win', fighter: 'cadet' })).toBeNull();
    expect(parseCampaign({ event: 'done', fighter: 'cadet', retries: -2 })).toBeNull();
  });

  it('clé de la page : égalité exacte seulement', () => {
    expect(sameKey('abc', 'abc')).toBe(true);
    expect(sameKey('abc', 'abd')).toBe(false);
    expect(sameKey('', '')).toBe(false);
    expect(sameKey('abc', 'abcd')).toBe(false);
  });
});

describe('statistiques de jeu (fiche envoyée par le jeu)', () => {
  it('la fiche construite d’après l’état du combat est acceptée par le serveur', () => {
    const s = { ...createFight('tailleur', 'binocle', 'assemblee'), step: 60 * 80, round: 3, winner: 1 as const, dealt: [[1, 2, 3, 4, 5, 6], [6, 5, 4, 3, 2, 1]] as [number[], number[]] };
    const c = matchCard(s, { mode: 'amis', human: [true, true], level: null, forfeit: false });
    expect(parseMatch(JSON.parse(JSON.stringify(c)))).toEqual({ ...c, secs: 80 });
  });
});

describe('page des statistiques (calculs)', () => {
  it('additionne les jours, trouve le coup de prédilection et le rival le plus dur', async () => {
    const { summarize } = await import('../../src/stats/summary');
    const rows: [string, string, number][] = [];
    const add = (day: string, c: unknown) => {
      for (const [k, n] of matchCounters(parseMatch(c)!)) rows.push([day, k, n]);
    };
    add('2026-11-07', card);
    add('2026-11-08', { ...card, mode: 'campagne', winner: 1, dealt: [[0, 0, 0, 0, 900, 0], [10, 0, 0, 0, 0, 0]] });
    for (const [k, n] of campaignCounters({ event: 'done', fighter: 'aviateur', retries: 3 })) rows.push(['2026-11-08', k, n]);
    const s = summarize(rows, ['aviateur', 'doyen']);
    expect(s.matches).toBe(2);
    expect(s.perDay).toEqual([['2026-11-07', 1], ['2026-11-08', 1]]);
    const av = s.fighters.find((f) => f.id === 'aviateur')!;
    expect(av.picks).toBe(2);
    expect(av.pickWins).toBe(1);
    expect(av.dmg.big).toBe(260 + 900);
    expect(av.favorite).toBe('big');
    expect(av.campDone).toBe(1);
    expect(av.campRetries).toBe(3);
    const doyen = s.fighters.find((f) => f.id === 'doyen')!;
    expect(doyen.rivalPlays).toBe(1);
    expect(doyen.rivalWins).toBe(1);
    expect(doyen.favorite).toBe('air');
    expect(s.byMode.libre.secs).toBe(95);
  });

  it('aucun dégât : pas de coup de prédilection', async () => {
    const { summarize } = await import('../../src/stats/summary');
    expect(summarize([], ['aviateur']).fighters[0].favorite).toBeNull();
  });
});
