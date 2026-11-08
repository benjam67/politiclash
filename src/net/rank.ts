// Classement de la Primaire ouverte, côté jeu : identité du téléphone, déclaration des résultats, nom affiché,
// lecture du tableau, signalement. Tout passe par le serveur du jeu (voir server/src/rankDO.ts).
import { serverUrl } from '../config/server';
import { loadSave, updateSave } from '../logic/save';
import { nameAllowed, tidyName } from '../../server/src/names';

export type Period = 'day' | 'week' | 'all';
export interface BoardRow {
  rank: number;
  id: string;
  name: string;
  wins: number;
}
export interface Board {
  period: Period;
  top: BoardRow[];
  me: { rank: number | null; wins: number } | null;
}

const hex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Identifiant et secret de ce téléphone, créés la première fois. Sans comptes : effacer les données du site, c'est repartir de zéro. */
export function rankIdentity(): { id: string; secret: string } {
  const s = loadSave();
  if (s.rank) return s.rank;
  const rank = { id: hex(16), secret: hex(32) };
  updateSave((sv) => ({ ...sv, rank }));
  return rank;
}

async function post(path: string, body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const base = serverUrl();
  if (!base) return { status: 0, data: null };
  try {
    const r = await fetch(`${base}/rank/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...rankIdentity(), rid: rankIdentity().id, ...body }) });
    return { status: r.status, data: (await r.json().catch(() => null)) as Record<string, unknown> | null };
  } catch {
    return { status: 0, data: null };
  }
}

/**
 * Résultat du n-ième match d'un salon de Primaire ouverte, vu par ce téléphone. Il ne compte que si l'adversaire
 * déclare l'inverse. Une seconde tentative si le réseau a manqué.
 */
export async function reportResult(match: string, n: number, won: boolean) {
  const r = await post('result', { match, n, won });
  if (r.status === 0) {
    await new Promise((res) => setTimeout(res, 3000));
    await post('result', { match, n, won });
  }
}

/** Le nom est-il acceptable ? (le serveur vérifie aussi). */
export const rankNameOk = (name: string) => nameAllowed(tidyName(name));

/** Nom affiché dans le classement. Rend 'ok', 'refused' (filtre), 'too-many' (trop de changements aujourd'hui) ou 'offline'. */
export async function setRankName(name: string): Promise<'ok' | 'refused' | 'too-many' | 'offline'> {
  if (!rankNameOk(name)) return 'refused';
  const r = await post('name', { name: tidyName(name) });
  if (r.status === 200) return 'ok';
  if (r.status === 422) return 'refused';
  if (r.status === 429) return 'too-many';
  return 'offline';
}

export async function fetchBoard(period: Period): Promise<Board | null> {
  const base = serverUrl();
  if (!base) return null;
  try {
    const r = await fetch(`${base}/rank/board?period=${period}&rid=${rankIdentity().id}`);
    return r.ok ? ((await r.json()) as Board) : null;
  } catch {
    return null;
  }
}

export async function flagName(target: string): Promise<boolean> {
  return (await post('flag', { target })).status === 200;
}
