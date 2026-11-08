// Statistiques de jeu, anonymes : une petite fiche envoyée au serveur à la fin de chaque match et aux étapes
// de la campagne (voir server/src/stats.ts). Aucune donnée sur le joueur : ni pseudo, ni identifiant.
//
// Envoyées seulement depuis le jeu publié (france-bagarre.fr), jamais pendant les essais, les tests automatiques
// ou le tutoriel. En ligne, un seul des deux téléphones envoie la fiche du match (voir FightScene).
import type { AiLevel } from '../ai/ai';
import type { FighterId } from '../config/roster';
import { SIM } from '../config/balance';
import type { FightState } from '../logic/fight';
import { serverUrl } from '../config/server';
import type { SessionStats } from './rollback';

export type StatsMode = 'libre' | 'campagne' | 'ia' | 'amis' | 'primaire';

export interface MatchCardInfo {
  mode: StatsMode;
  /** Côtés joués par une personne. */
  human: [boolean, boolean];
  /** Niveau de l'IA, pour un match contre l'IA. */
  level: AiLevel | null;
  forfeit: boolean;
  /** Match en ligne arrêté : désynchronisations répétées, ou connexion perdue (Entre amis). */
  aborted?: 'desync' | 'lost';
  /** Match en ligne : santé de la connexion (désynchronisations, recalages, attentes). */
  net?: Pick<SessionStats, 'desyncs' | 'resyncs' | 'stalls'>;
}

/** Fiche de fin de match, d'après l'état final du combat. */
export function matchCard(s: FightState, info: MatchCardInfo) {
  return {
    mode: info.mode,
    f: [s.f[0].id, s.f[1].id] as [FighterId, FighterId],
    human: info.human,
    winner: s.winner === 0 || s.winner === 1 ? s.winner : 2,
    stage: s.stage,
    level: info.level,
    secs: Math.round(s.step / SIM.stepsPerSecond),
    rounds: Math.max(1, s.round),
    dealt: [s.dealt[0].map((v) => Math.max(0, Math.round(v))), s.dealt[1].map((v) => Math.max(0, Math.round(v)))],
    forfeit: info.forfeit,
    ...(info.aborted ? { aborted: info.aborted } : {}),
    ...(info.net ? { net: { desyncs: info.net.desyncs, resyncs: info.net.resyncs, stalls: info.net.stalls } } : {}),
  };
}

/** Seulement depuis le jeu publié, joué par une personne. */
function enabled(): boolean {
  if (typeof location === 'undefined' || typeof navigator === 'undefined') return false;
  if (navigator.webdriver) return false;
  const h = location.hostname;
  return h === 'france-bagarre.fr' || h === 'www.france-bagarre.fr';
}

function send(path: string, body: unknown) {
  if (!enabled()) return;
  const base = serverUrl();
  if (!base) return;
  // keepalive : la fiche part même si on quitte la page juste après. Une erreur est sans conséquence.
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
}

export function sendMatchStats(s: FightState, info: MatchCardInfo) {
  try {
    send('/stats/match', matchCard(s, info));
  } catch {
    // Les statistiques ne doivent jamais gêner le jeu.
  }
}

/** Primaire ouverte : fin d'une recherche d'adversaire (trouvé, IA en attendant, ou annulée) et sa durée. */
export function sendWaitStats(outcome: 'match' | 'ai' | 'cancel', secs: number) {
  try {
    send('/stats/wait', { outcome, secs: Math.max(0, Math.min(3600, Math.round(secs))) });
  } catch {
    // idem
  }
}

export function sendCampaignStats(event: 'start' | 'done' | 'quit', fighter: FighterId, retries = 0) {
  try {
    send('/stats/campaign', { event, fighter, retries });
  } catch {
    // idem
  }
}
