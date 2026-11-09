// Statistiques de jeu, anonymes : règles pures (vérification des fiches, compteurs), sans Cloudflare,
// pour être testées avec le jeu. Le stockage est dans statsDO.ts.
//
// Le jeu envoie une fiche à la fin de chaque match et aux étapes de la campagne. Le serveur ne garde
// que des totaux par jour (« compteurs ») : ni pseudo, ni identifiant, ni adresse IP, ni appareil.

/** Mêmes listes que le jeu (src/config/roster.ts, stages.ts, ai/ai.ts) ; un test vérifie qu'elles restent égales. */
export const FIGHTERS = ['aviateur', 'tailleur', 'cadet', 'barbe', 'doyen', 'binocle', 'kimono', 'rose', 'manteau', 'baskets'] as const;
export const STAGES = ['bar', 'elysee', 'republique', 'assemblee', 'bastille'] as const;
export const LEVELS = ['easy', 'normal', 'hard'] as const;
/** Coups, dans l'ordre de `DEALT_MOVES` (src/logic/fight.ts). */
export const MOVES = ['quick', 'air', 'kick', 'sweep', 'big', 'special'] as const;
/** libre : combat libre ; campagne ; ia : contre l'IA en attendant un adversaire (Primaire ouverte) ; amis ; primaire. */
export const MODES = ['libre', 'campagne', 'ia', 'amis', 'primaire'] as const;
export const CAMPAIGN_EVENTS = ['start', 'done', 'quit'] as const;

type Fighter = (typeof FIGHTERS)[number];
export type Mode = (typeof MODES)[number];

export interface MatchCard {
  mode: Mode;
  /** Combattants de gauche et de droite. */
  f: [Fighter, Fighter];
  /** Côtés joués par une personne (les autres par l'IA). */
  human: [boolean, boolean];
  /** Vainqueur du match ; 2 : égalité. */
  winner: 0 | 1 | 2;
  stage: (typeof STAGES)[number];
  /** Niveau de l'IA (matchs contre l'IA seulement). */
  level: (typeof LEVELS)[number] | null;
  /** Durée du match, en secondes. */
  secs: number;
  rounds: number;
  /** Dégâts infligés par chaque combattant, par coup (ordre de MOVES), en dixièmes de PV. */
  dealt: [number[], number[]];
  /** Match gagné par abandon de l'adversaire (en ligne). */
  forfeit: boolean;
  /** Match en ligne arrêté : désynchronisations répétées (Primaire ouverte), ou connexion perdue (Entre amis). */
  aborted: 'desync' | 'lost' | null;
  /** Match en ligne : désynchronisations, recalages et attentes de la connexion. */
  net: { desyncs: number; resyncs: number; stalls: number } | null;
}

export const WAIT_OUTCOMES = ['match', 'ai', 'cancel'] as const;
/** Primaire ouverte : une recherche d'adversaire qui se termine (adversaire trouvé, IA en attendant, annulée). */
export interface WaitCard {
  outcome: (typeof WAIT_OUTCOMES)[number];
  secs: number;
}

export interface CampaignCard {
  event: (typeof CAMPAIGN_EVENTS)[number];
  fighter: Fighter;
  /** Recomptages (défaites) sur toute la campagne, pour `done`. */
  retries: number;
}

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);
const int = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null);

/** Fiche de match reçue, vérifiée champ par champ ; null si quoi que ce soit cloche. */
export function parseMatch(raw: unknown): MatchCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!oneOf(MODES, r.mode) || !oneOf(STAGES, r.stage)) return null;
  if (!Array.isArray(r.f) || r.f.length !== 2 || !oneOf(FIGHTERS, r.f[0]) || !oneOf(FIGHTERS, r.f[1])) return null;
  if (!Array.isArray(r.human) || r.human.length !== 2 || r.human.some((h) => typeof h !== 'boolean')) return null;
  if (r.winner !== 0 && r.winner !== 1 && r.winner !== 2) return null;
  const level = r.level === null || r.level === undefined ? null : oneOf(LEVELS, r.level) ? r.level : undefined;
  if (level === undefined) return null;
  const secs = int(r.secs, 3600);
  const rounds = int(r.rounds, 9);
  if (secs === null || rounds === null || rounds < 1) return null;
  // Un round : 100 PV ; au plus 3 rounds par match, avec de la marge (dixièmes de PV).
  const MAX_DMG = 100 * 10 * 9;
  if (!Array.isArray(r.dealt) || r.dealt.length !== 2) return null;
  const dealt: number[][] = [];
  for (const side of r.dealt) {
    if (!Array.isArray(side) || side.length !== MOVES.length) return null;
    const row = side.map((v) => int(v, MAX_DMG));
    if (row.some((v) => v === null)) return null;
    dealt.push(row as number[]);
  }
  const aborted = r.aborted === undefined || r.aborted === null ? null : r.aborted === 'desync' || r.aborted === 'lost' ? r.aborted : undefined;
  if (aborted === undefined) return null;
  let net: MatchCard['net'] = null;
  if (r.net !== undefined && r.net !== null) {
    const n = r.net as Record<string, unknown>;
    const desyncs = int(n.desyncs, 10000);
    const resyncs = int(n.resyncs, 10000);
    const stalls = int(n.stalls, 100000);
    if (typeof r.net !== 'object' || desyncs === null || resyncs === null || stalls === null) return null;
    net = { desyncs, resyncs, stalls };
  }
  return {
    mode: r.mode,
    f: [r.f[0], r.f[1]],
    human: [r.human[0] as boolean, r.human[1] as boolean],
    winner: r.winner,
    stage: r.stage,
    level,
    secs,
    rounds,
    dealt: [dealt[0], dealt[1]],
    forfeit: r.forfeit === true,
    aborted,
    net,
  };
}

export function parseWait(raw: unknown): WaitCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const secs = int(r.secs, 3600);
  if (!oneOf(WAIT_OUTCOMES, r.outcome) || secs === null) return null;
  return { outcome: r.outcome, secs };
}

export function waitCounters(c: WaitCard): [string, number][] {
  return [
    [`wait|n|${c.outcome}`, 1],
    [`wait|secs|${c.outcome}`, c.secs],
  ];
}

export function parseCampaign(raw: unknown): CampaignCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!oneOf(CAMPAIGN_EVENTS, r.event) || !oneOf(FIGHTERS, r.fighter)) return null;
  const retries = r.retries === undefined ? 0 : int(r.retries, 999);
  if (retries === null) return null;
  return { event: r.event, fighter: r.fighter, retries };
}

/**
 * Compteurs à ajouter pour une fiche de match. Clés lisibles, séparées par « | » :
 *   match|mode                 nombre de matchs           secs|mode, rounds|mode   pour les moyennes
 *   pick|mode|perso            choisi par une personne     hwin|mode|perso          victoires de ce choix
 *   play|mode|perso            présent (personne ou IA)    win|mode|perso           victoires
 *   dmg|perso|coup             dégâts infligés (dixièmes)  stage|lieu, level|niveau, forfeit|mode
 *   abort|mode|raison          match arrêté (desync, lost) : il ne compte ni victoire ni dégâts
 *   net|mode|n, net|mode|desyncs, resyncs, stalls   santé de la connexion (matchs en ligne)
 */
export function matchCounters(c: MatchCard): [string, number][] {
  const net: [string, number][] = c.net
    ? [
        [`net|${c.mode}|n`, 1],
        [`net|${c.mode}|desyncs`, c.net.desyncs],
        [`net|${c.mode}|resyncs`, c.net.resyncs],
        [`net|${c.mode}|stalls`, c.net.stalls],
      ]
    : [];
  // Match arrêté : seulement l'arrêt et la connexion (le match n'est pas allé au bout).
  if (c.aborted) return [[`abort|${c.mode}|${c.aborted}`, 1], ...net];
  const out: [string, number][] = [...net,
    [`match|${c.mode}`, 1],
    [`secs|${c.mode}`, c.secs],
    [`rounds|${c.mode}`, c.rounds],
    [`stage|${c.stage}`, 1],
  ];
  if (c.level) out.push([`level|${c.level}`, 1]);
  if (c.forfeit) out.push([`forfeit|${c.mode}`, 1]);
  for (const i of [0, 1] as const) {
    const id = c.f[i];
    const won = c.winner === i ? 1 : 0;
    out.push([`play|${c.mode}|${id}`, 1]);
    if (won) out.push([`win|${c.mode}|${id}`, 1]);
    if (c.human[i]) {
      out.push([`pick|${c.mode}|${id}`, 1]);
      if (won) out.push([`hwin|${c.mode}|${id}`, 1]);
    }
    c.dealt[i].forEach((d, m) => {
      if (d > 0) out.push([`dmg|${id}|${MOVES[m]}`, d]);
    });
  }
  return out;
}

export function campaignCounters(c: CampaignCard): [string, number][] {
  const out: [string, number][] = [[`camp|${c.event}|${c.fighter}`, 1]];
  if (c.event === 'done') out.push([`camp|retries|${c.fighter}`, c.retries]);
  return out;
}

/** Fiches acceptées par appareil et par minute (le reste est ignoré, sans erreur). */
export const PER_MINUTE = 20;

/** Comparaison de deux chaînes sans s'arrêter au premier écart (clé de la page des statistiques). */
export function sameKey(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
