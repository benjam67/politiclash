// Sauvegarde locale, sur le téléphone : tutoriel vu, difficulté choisie, dernier combattant, victoires.
// Une sauvegarde absente, abîmée ou d'une autre version est remise d'aplomb sans planter.
import { PLAYABLE_IDS, type FighterId } from '../config/roster';
import { STAGE_IDS, type StageId } from '../config/stages';

export type Level = 'easy' | 'normal' | 'hard';
const LEVELS: Level[] = ['easy', 'normal', 'hard'];

export interface Record2 {
  w: number;
  l: number;
}

export interface SaveData {
  v: 1;
  /** Le tutoriel a été fini ou passé. */
  tutorialDone: boolean;
  level: Level;
  lastFighter: FighterId | null;
  lastStage: StageId | null;
  /** Matchs gagnés et perdus contre l'IA, par niveau. */
  record: Record<Level, Record2>;
}

export const STORAGE_KEY = 'politiclash.save';

export function defaultSave(): SaveData {
  return { v: 1, tutorialDone: false, level: 'normal', lastFighter: null, lastStage: null, record: { easy: { w: 0, l: 0 }, normal: { w: 0, l: 0 }, hard: { w: 0, l: 0 } } };
}

const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.min(1e6, Math.floor(n)) : 0);

/** Lit n'importe quoi (JSON abîmé, ancienne version, valeurs inventées) et rend une sauvegarde valide. */
export function sanitize(raw: unknown): SaveData {
  const out = defaultSave();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  out.tutorialDone = r.tutorialDone === true;
  if (LEVELS.includes(r.level as Level)) out.level = r.level as Level;
  if ((PLAYABLE_IDS as string[]).includes(r.lastFighter as string)) out.lastFighter = r.lastFighter as FighterId;
  if ((STAGE_IDS as string[]).includes(r.lastStage as string)) out.lastStage = r.lastStage as StageId;
  const rec = r.record && typeof r.record === 'object' ? (r.record as Record<string, unknown>) : {};
  for (const lv of LEVELS) {
    const x = rec[lv] && typeof rec[lv] === 'object' ? (rec[lv] as Record<string, unknown>) : {};
    out.record[lv] = { w: count(x.w), l: count(x.l) };
  }
  return out;
}

export function parseSave(text: string | null): SaveData {
  if (!text) return defaultSave();
  try {
    return sanitize(JSON.parse(text));
  } catch {
    return defaultSave();
  }
}

/** Résultat d'un match contre l'IA. */
export function withResult(s: SaveData, level: Level, won: boolean): SaveData {
  const r = s.record[level];
  return { ...s, record: { ...s.record, [level]: won ? { w: r.w + 1, l: r.l } : { w: r.w, l: r.l + 1 } } };
}

export const totalWins = (s: SaveData) => LEVELS.reduce((n, lv) => n + s.record[lv].w, 0);

// ── Lecture et écriture sur l'appareil ─────────────────────────────────────
// localStorage peut être absent ou refuser d'écrire (navigation privée) : le jeu continue sans.

export function loadSave(): SaveData {
  try {
    return parseSave(localStorage.getItem(STORAGE_KEY));
  } catch {
    return defaultSave();
  }
}

export function storeSave(s: SaveData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* rien : la partie continue sans sauvegarde */
  }
}

/** Modifie la sauvegarde et l'enregistre. */
export function updateSave(fn: (s: SaveData) => SaveData): SaveData {
  const next = sanitize(fn(loadSave()));
  storeSave(next);
  return next;
}
