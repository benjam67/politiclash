// Page des statistiques : calculs à partir des totaux par jour renvoyés par le serveur (GET /stats/data).
// Pur, sans affichage, pour être testé.
import type { FighterId } from '../config/roster';
import { DEALT_MOVES, type DealtMove } from '../logic/fight';

export type Row = [day: string, key: string, n: number];
export const MODES = ['libre', 'campagne', 'ia', 'amis', 'primaire'] as const;
export type Mode = (typeof MODES)[number];

export interface FighterLine {
  id: FighterId;
  /** Choisi par une personne, tous modes confondus. */
  picks: number;
  /** Victoires de ceux qui l'ont choisi. */
  pickWins: number;
  /** Présent dans un match (personne ou IA), et victoires. */
  plays: number;
  wins: number;
  /** En campagne, joué par l'IA comme rival : matchs et victoires contre le joueur. */
  rivalPlays: number;
  rivalWins: number;
  /** Dégâts infligés par coup (dixièmes de PV). */
  dmg: Record<DealtMove, number>;
  /** Coup de prédilection : celui qui a fait le plus de dégâts en cumulé (null : aucun dégât). */
  favorite: DealtMove | null;
  /** Part de ce coup dans tous ses dégâts (0 à 1). */
  favoriteShare: number;
  /** Campagnes commencées, gagnées, abandonnées avec ce candidat, et recomptages des campagnes gagnées. */
  campStart: number;
  campDone: number;
  campQuit: number;
  campRetries: number;
}

export interface Summary {
  matches: number;
  byMode: Record<Mode, { matches: number; secs: number; rounds: number; forfeits: number }>;
  fighters: FighterLine[];
  /** Tous persos confondus. */
  dmgAll: Record<DealtMove, number>;
  stages: [string, number][];
  levels: [string, number][];
  /** Matchs par jour, dans l'ordre. */
  perDay: [string, number][];
}

const zeroDmg = () => Object.fromEntries(DEALT_MOVES.map((m) => [m, 0])) as Record<DealtMove, number>;

export function summarize(rows: Row[], fighterIds: readonly FighterId[]): Summary {
  const tot = new Map<string, number>();
  const perDay = new Map<string, number>();
  for (const [day, key, n] of rows) {
    tot.set(key, (tot.get(key) ?? 0) + n);
    if (key.startsWith('match|')) perDay.set(day, (perDay.get(day) ?? 0) + n);
  }
  const g = (k: string) => tot.get(k) ?? 0;
  const sumModes = (f: (m: Mode) => string) => MODES.reduce((t, m) => t + g(f(m)), 0);

  const byMode = Object.fromEntries(
    MODES.map((m) => [m, { matches: g(`match|${m}`), secs: g(`secs|${m}`), rounds: g(`rounds|${m}`), forfeits: g(`forfeit|${m}`) }]),
  ) as Summary['byMode'];

  const dmgAll = zeroDmg();
  const fighters = fighterIds.map((id): FighterLine => {
    const dmg = zeroDmg();
    for (const m of DEALT_MOVES) {
      dmg[m] = g(`dmg|${id}|${m}`);
      dmgAll[m] += dmg[m];
    }
    const total = DEALT_MOVES.reduce((t, m) => t + dmg[m], 0);
    const favorite = total > 0 ? DEALT_MOVES.reduce((best, m) => (dmg[m] > dmg[best] ? m : best), DEALT_MOVES[0]) : null;
    return {
      id,
      picks: sumModes((m) => `pick|${m}|${id}`),
      pickWins: sumModes((m) => `hwin|${m}|${id}`),
      plays: sumModes((m) => `play|${m}|${id}`),
      wins: sumModes((m) => `win|${m}|${id}`),
      rivalPlays: g(`play|campagne|${id}`) - g(`pick|campagne|${id}`),
      rivalWins: g(`win|campagne|${id}`) - g(`hwin|campagne|${id}`),
      dmg,
      favorite,
      favoriteShare: favorite ? dmg[favorite] / total : 0,
      campStart: g(`camp|start|${id}`),
      campDone: g(`camp|done|${id}`),
      campQuit: g(`camp|quit|${id}`),
      campRetries: g(`camp|retries|${id}`),
    };
  });

  const prefixed = (p: string) =>
    [...tot.entries()]
      .filter(([k]) => k.startsWith(p))
      .map(([k, n]): [string, number] => [k.slice(p.length), n])
      .sort((a, b) => b[1] - a[1]);

  return {
    matches: MODES.reduce((t, m) => t + byMode[m].matches, 0),
    byMode,
    fighters,
    dmgAll,
    stages: prefixed('stage|'),
    levels: prefixed('level|'),
    perDay: [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  };
}
