// Ce qui est commun au jeu en ligne, sans réseau : code de salon, lien d'invitation, pseudo, messages,
// et l'empreinte des règles du jeu (deux téléphones aux règles différentes se désynchroniseraient).
import * as BALANCE from '../config/balance';
import { ROSTER, type FighterId } from '../config/roster';
import { SPECIALS } from '../config/specials';
import type { StageId } from '../config/stages';
import type { NetMsg } from './rollback';

/** Version du protocole : à changer quand les messages changent. */
export const PROTOCOL_VERSION = 3;

/** Empreinte des règles (balance, combattants, coups spéciaux) : deux jeux qui diffèrent ne peuvent pas jouer ensemble. */
export const RULES_VERSION = (() => {
  const text = JSON.stringify({ p: PROTOCOL_VERSION, b: BALANCE, r: ROSTER, s: SPECIALS });
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
})();

/** Lettres du code de salon : sans I ni O (trop proches de 1 et 0 quand on dicte le code), et pas de chiffres. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;

export function makeCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}

/** Nettoie un code saisi (minuscules, espaces, tirets) ; null s'il n'est pas valide. */
export function normalizeCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

/** Identifiant PeerJS de l'hôte d'un salon. */
export const peerIdFor = (code: string) => `politiclash-v${PROTOCOL_VERSION}-${code}`;

/** Lien à partager : il ouvre directement le salon. On garde seulement les réglages de test (`peer`, `lag`). */
export function inviteLink(code: string, href: string = location.href): string {
  const u = new URL(href);
  const keep = ['peer', 'lag'].map((k) => [k, u.searchParams.get(k)] as const);
  u.search = '';
  u.hash = '';
  u.searchParams.set('salon', code);
  for (const [k, v] of keep) if (v) u.searchParams.set(k, v);
  return u.toString();
}

export const PSEUDO_MAX = 14;

/** Pseudo libre (mode Entre amis) : sans caractères de contrôle ni espaces en trop, 14 caractères au plus. */
export function cleanPseudo(input: string): string {
  return [...input.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮]/g, '').replace(/\s+/g, ' ').trim()]
    .slice(0, PSEUDO_MAX)
    .join('')
    .trim();
}

export type Role = 'host' | 'guest';
/** L'hôte joue à gauche (joueur 0), l'invité à droite (joueur 1). */
export const indexOf = (role: Role): 0 | 1 => (role === 'host' ? 0 : 1);

export interface MatchStart {
  /** Numéro du match dans ce salon (revanches comprises) : les paquets d'un ancien match sont ignorés. */
  n: number;
  seed: number;
  stage: StageId;
  fighters: [FighterId, FighterId];
  /** Retard d'entrée choisi par l'hôte selon le ping mesuré. */
  delay: number;
}

/** Messages du salon (canal fiable et ordonné). */
export type CtlMsg =
  /** Présentation ; `re` : c'est une réponse (on ne répond pas à une réponse). */
  | { t: 'hello'; pseudo: string; v: string; re?: boolean }
  | { t: 'pick'; fighter: FighterId }
  | { t: 'stage'; stage: StageId }
  | { t: 'ready'; on: boolean }
  | { t: 'start'; start: MatchStart }
  | { t: 'ping'; id: number }
  | { t: 'pong'; id: number }
  | { t: 'react'; i: number }
  /** Il veut la revanche. */
  | { t: 'again' }
  /** Retour au salon (changer de perso). */
  | { t: 'room' }
  | { t: 'bye' };

/** Messages du match (canal non ordonné) : ceux de la session, avec le numéro du match. */
export interface GameMsg {
  n: number;
  m: NetMsg;
}
