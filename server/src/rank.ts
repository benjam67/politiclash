// Classement : règles pures (sans stockage), testées à part.
//
// - Seules comptent les victoires en Primaire ouverte contre un vrai joueur, quand les deux téléphones
//   déclarent le même résultat (l'un « gagné », l'autre « perdu »). Sinon, rien n'est compté.
// - Contre le même adversaire, au plus 3 victoires comptées par jour (pour qu'on ne puisse pas monter en
//   jouant contre soi-même avec deux téléphones, ou en s'arrangeant avec un ami).
// - Jour et semaine à l'heure de Paris ; la semaine va du lundi au dimanche.

export const SAME_FOE_PER_DAY = 3;
/** Revanches comptées au plus dans un même salon. */
export const MAX_REMATCH = 30;

export type Period = 'day' | 'week' | 'all';

/** Date à Paris, au format AAAA-MM-JJ. */
export function dayKey(t: number): string {
  // « fr-CA » écrit les dates en AAAA-MM-JJ.
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}

/** Lundi de la semaine (à Paris), au format AAAA-MM-JJ. */
export function weekKey(t: number): string {
  const [y, m, d] = dayKey(t).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const back = (date.getUTCDay() + 6) % 7; // lundi → 0, dimanche → 6
  date.setUTCDate(date.getUTCDate() - back);
  return date.toISOString().slice(0, 10);
}

/**
 * Deux déclarations pour un même match : rend le gagnant et le perdant si elles concordent, sinon null.
 * `won` : ce que déclare chaque joueur à propos de lui-même.
 */
export function settle(a: { rid: string; won: boolean }, b: { rid: string; won: boolean }): { winner: string; loser: string } | null {
  if (a.rid === b.rid || a.won === b.won) return null;
  return a.won ? { winner: a.rid, loser: b.rid } : { winner: b.rid, loser: a.rid };
}

export const isPeriod = (p: unknown): p is Period => p === 'day' || p === 'week' || p === 'all';
