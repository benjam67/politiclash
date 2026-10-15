// Campagne présidentielle : enchaînement des matchs du solo, sans Phaser.
// Le joueur doit battre tous les autres candidats ; il peut refaire un match perdu autant de fois qu'il veut.
import { CAMPAIGN } from '../config/balance';
import { PLAYABLE_IDS, type FighterId } from '../config/roster';
import type { Level } from './save';

export interface Campaign {
  /** Le candidat du joueur. */
  fighter: FighterId;
  /** Les adversaires, dans l'ordre où ils seront affrontés. */
  order: FighterId[];
  /** Nombre d'adversaires déjà battus (= rang du prochain match, à partir de 0). */
  beaten: number;
  /** Matchs perdus puis rejoués (« recomptages »), sur toute la campagne. */
  retries: number;
}

/** Niveau de l'IA pour le match de rang `i` (à partir de 0) sur `n`. */
export function levelAt(i: number, n: number): Level {
  const L = CAMPAIGN.levels;
  if (n <= 1) return L[L.length - 1];
  // On étire la liste sur le nombre d'adversaires : le premier match prend le premier niveau, le dernier le dernier.
  return L[Math.round((i * (L.length - 1)) / (n - 1))];
}

/** Nouvelle campagne : tous les autres candidats, mélangés. `rand` rend un nombre entre 0 et 1. */
export function startCampaign(fighter: FighterId, rand: () => number = Math.random, ids: FighterId[] = PLAYABLE_IDS): Campaign {
  const order = ids.filter((id) => id !== fighter);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { fighter, order, beaten: 0, retries: 0 };
}

export const campaignFoe = (c: Campaign): FighterId => c.order[Math.min(c.beaten, c.order.length - 1)];
export const campaignLevel = (c: Campaign): Level => levelAt(c.beaten, c.order.length);
export const campaignDone = (c: Campaign) => c.beaten >= c.order.length;
/** Le prochain match est le dernier. */
export const isFinalMatch = (c: Campaign) => c.beaten === c.order.length - 1;

/** Le joueur a gagné le match en cours. */
export const campaignWin = (c: Campaign): Campaign => ({ ...c, beaten: Math.min(c.order.length, c.beaten + 1) });
/** Le joueur a perdu le match en cours : il le rejouera. */
export const campaignLoss = (c: Campaign): Campaign => ({ ...c, retries: c.retries + 1 });

/** Relit une campagne sauvegardée ; rend `null` si elle est abîmée ou ne correspond plus aux candidats du jeu. */
export function sanitizeCampaign(raw: unknown, ids: FighterId[] = PLAYABLE_IDS): Campaign | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const fighter = r.fighter as FighterId;
  if (!ids.includes(fighter) || !Array.isArray(r.order)) return null;
  const order = r.order as FighterId[];
  // Exactement les autres candidats, chacun une fois (un candidat ajouté ou retiré depuis : on repart de zéro).
  const others = ids.filter((id) => id !== fighter);
  if (order.length !== others.length || new Set(order).size !== order.length || !order.every((id) => others.includes(id))) return null;
  const int = (n: unknown, max: number) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.min(max, Math.floor(n)) : 0);
  const beaten = int(r.beaten, order.length);
  // Une campagne finie n'est plus « en cours ».
  if (beaten >= order.length) return null;
  return { fighter, order: [...order], beaten, retries: int(r.retries, 1e6) };
}

/** Palmarès d'un candidat : campagnes gagnées, et le moins de recomptages sur une campagne gagnée. */
export interface Laurels {
  wins: number;
  bestRetries: number;
}
export type Palmares = Partial<Record<FighterId, Laurels>>;

export function withVictory(p: Palmares, c: Campaign): Palmares {
  const old = p[c.fighter];
  return { ...p, [c.fighter]: { wins: (old?.wins ?? 0) + 1, bestRetries: old ? Math.min(old.bestRetries, c.retries) : c.retries } };
}

export function sanitizePalmares(raw: unknown, ids: FighterId[] = PLAYABLE_IDS): Palmares {
  const out: Palmares = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const id of ids) {
    const x = (raw as Record<string, unknown>)[id];
    if (!x || typeof x !== 'object') continue;
    const { wins, bestRetries } = x as Record<string, unknown>;
    if (typeof wins !== 'number' || !(wins >= 1) || typeof bestRetries !== 'number' || !(bestRetries >= 0)) continue;
    out[id] = { wins: Math.min(1e6, Math.floor(wins)), bestRetries: Math.min(1e6, Math.floor(bestRetries)) };
  }
  return out;
}
