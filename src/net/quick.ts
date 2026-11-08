// Primaire ouverte (Partie rapide) : la connexion à la file d'attente du serveur, et la mise en relation avec
// l'adversaire trouvé. Partagée par les écrans (recherche, combat contre l'IA en attendant, fin de match).
//
// Le serveur associe deux joueurs et leur donne un identifiant de match, un rôle (hôte ou invité) et une
// graine. Les deux téléphones se relient alors comme en mode Entre amis, mais toujours par le relais :
// l'adresse IP de l'un n'est jamais transmise à l'autre.
import { PLAYABLE_IDS } from '../config/roster';
import { serverUrl } from '../config/server';
import { QUICK_PSEUDOS } from '../config/texts';
import { loadSave } from '../logic/save';
import { currentRoom, FriendRoom, setCurrentRoom } from './friends';
import { linkOptionsFromUrl, PeerLink } from './peer';
import { RULES_VERSION } from './room';

export type QuickState = 'connecting' | 'searching' | 'found' | 'linking' | 'idle' | 'error';

export interface QuickListener {
  change?(): void;
  /** Adversaire proposé : le jeu doit accepter (tout seul pendant la recherche) ou refuser dans `ttl` s. */
  found?(match: string, foe: string, ttl: number): void;
  /** Les deux téléphones sont reliés : le salon est prêt. */
  ready?(room: FriendRoom): void;
  /** Problème : texte à afficher. */
  error?(msg: string): void;
}

/** Un pseudo tiré au hasard dans la liste du jeu (jamais de texte libre entre inconnus). */
export const randomPseudo = () => Math.floor(Math.random() * QUICK_PSEUDOS.length);
export const pseudoText = (i: number) => QUICK_PSEUDOS[i] ?? QUICK_PSEUDOS[0];

export class QuickSearch {
  state: QuickState = 'connecting';
  online = 0;
  searching = 0;
  /** Depuis quand on cherche (ms, horloge du téléphone). */
  since = 0;
  /** Pseudo de ce téléphone pour cette session (numéro dans la liste). */
  readonly pseudo = randomPseudo();
  private ws: WebSocket | null = null;
  private listeners = new Set<QuickListener>();
  private closed = false;
  private wantSearch = false;
  private retry = 0;
  /** Accepter tout seul les adversaires proposés (faux pendant un match contre l'IA : le joueur choisit). */
  autoAccept = true;
  pendingMatch: string | null = null;

  constructor(private readonly base: string = serverUrl()) {}

  get available() {
    return !!this.base;
  }

  listen(l: QuickListener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Se connecte (si besoin) et entre dans la file. */
  search() {
    this.wantSearch = true;
    this.since = performance.now();
    this.state = 'searching';
    if (!this.ws || this.ws.readyState > 1) this.connect();
    else if (this.ws.readyState === 1) this.send({ t: 'search' });
    this.emit((l) => l.change?.());
  }

  /** Sort de la file, en restant connecté (pour le compteur). */
  cancel() {
    this.wantSearch = false;
    this.pendingMatch = null;
    this.send({ t: 'cancel' });
    this.state = 'idle';
    this.emit((l) => l.change?.());
  }

  accept(match: string) {
    this.send({ t: 'accept', match });
  }

  decline(match: string) {
    this.pendingMatch = null;
    this.send({ t: 'decline', match });
  }

  close() {
    this.closed = true;
    this.wantSearch = false;
    this.ws?.close();
    this.ws = null;
    if (current === this) current = null;
  }

  // ── Interne ─────────────────────────────────────────────────────────────

  private connect() {
    if (this.closed) return;
    const url = `${this.base.replace(/^http/, 'ws')}/queue`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return this.fail();
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.send({ t: 'hello', v: RULES_VERSION, pseudo: this.pseudo });
      if (this.wantSearch) this.send({ t: 'search' });
    };
    ws.onmessage = (e) => {
      let m: { t: string; online?: number; searching?: number; match?: string; foe?: number; ttl?: number; role?: 'host' | 'guest'; seed?: number };
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.t === 'count') {
        this.online = m.online ?? 0;
        this.searching = m.searching ?? 0;
      } else if (m.t === 'found' && m.match) {
        this.state = 'found';
        this.pendingMatch = m.match;
        this.emit((l) => l.found?.(m.match as string, pseudoText(m.foe ?? 0), m.ttl ?? 10));
        if (this.autoAccept) this.accept(m.match);
      } else if (m.t === 'match' && m.match && m.role) {
        this.pendingMatch = null;
        void this.link(m.match, m.role, m.foe ?? 0);
      } else if (m.t === 'requeued') {
        this.pendingMatch = null;
        this.state = 'searching';
      } else if (m.t === 'dropped') {
        this.pendingMatch = null;
        this.wantSearch = false;
        this.state = 'idle';
      }
      this.emit((l) => l.change?.());
    };
    ws.onclose = () => {
      if (this.ws !== ws || this.closed) return;
      this.ws = null;
      // Liaison avec la file perdue : on se reconnecte (et on reprend la recherche si besoin).
      if (this.retry++ > 4) return this.fail();
      setTimeout(() => this.connect(), 1000 * this.retry);
    };
  }

  /** Relie les deux téléphones par le relais, puis ouvre le salon. En cas d'échec, on reprend la recherche. */
  private async link(match: string, role: 'host' | 'guest', foe: number) {
    this.state = 'linking';
    this.emit((l) => l.change?.());
    const opts = { ...linkOptionsFromUrl(location.search), relay: 'only' as const };
    try {
      const link = await PeerLink.open(role, `Q${match}`, opts);
      // Toujours par le relais : sans relais disponible, pas de Primaire ouverte.
      if (!link.relayAvailable) {
        link.destroy();
        throw new Error('no-relay');
      }
      const save = loadSave();
      const room = new FriendRoom(link, pseudoText(this.pseudo), save.lastFighter ?? PLAYABLE_IDS[0], null, { quick: true, foePseudo: pseudoText(foe) });
      setCurrentRoom(room);
      // Hôte : il attend la connexion de l'invité.
      if (!link.connected) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('p2p-failed')), 20_000);
          room.listen({
            link: (s) => {
              if (s === 'connected') {
                clearTimeout(t);
                resolve();
              }
            },
          });
        });
      }
      this.wantSearch = false;
      this.state = 'idle';
      this.emit((l) => l.ready?.(room));
    } catch (e) {
      const msg = (e as Error).message;
      currentRoom()?.close('self');
      this.emit((l) => l.error?.(msg === 'no-relay' ? 'no-relay' : 'link-failed'));
      // On cherche quelqu'un d'autre.
      if (msg !== 'no-relay') this.search();
      else this.state = 'error';
    }
    this.emit((l) => l.change?.());
  }

  private fail() {
    this.state = 'error';
    this.emit((l) => l.error?.('server'));
    this.emit((l) => l.change?.());
  }

  private send(m: unknown) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m));
  }

  private emit(fn: (l: QuickListener) => void) {
    for (const l of [...this.listeners]) fn(l);
  }
}

/** La recherche en cours (une seule à la fois). */
let current: QuickSearch | null = null;
export function quickSearch(): QuickSearch {
  if (!current || (current as unknown as { closed: boolean }).closed) current = new QuickSearch();
  return current;
}
export const currentQuick = () => current;
