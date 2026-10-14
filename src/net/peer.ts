// Liaison entre les deux téléphones (PeerJS / WebRTC). L'hôte s'enregistre sous l'identifiant du salon,
// l'invité s'y connecte avec le code. Deux canaux : `ctl` (fiable et ordonné : le salon) et `game` (non
// ordonné : les entrées du match ; un paquet perdu ne retient pas les suivants, la session sait les remettre
// dans l'ordre). Seule la mise en relation passe par un serveur (celui, public, de PeerJS).
import type { DataConnection, Peer, PeerOptions } from 'peerjs';
import { peerIdFor, type CtlMsg, type GameMsg, type Role } from './room';

export type LinkStatus = 'connecting' | 'waiting' | 'connected' | 'reconnecting' | 'closed';
/** `p2p-failed` : les téléphones se sont trouvés, mais la connexion directe n'a pas pu s'établir (réseau mobile). */
export type LinkError = 'room-not-found' | 'room-taken' | 'network' | 'p2p-failed';

const PING_MS = 1000;
/** Sans aucun message pendant ce délai, la liaison est considérée comme coupée et on la refait. */
const DEAD_MS = 4000;
const RETRY_MS = 1500;
/** Les téléphones se sont trouvés mais la connexion directe ne s'ouvre pas : abandon après ce délai. */
const P2P_TIMEOUT_MS = 15_000;

export interface LinkOptions {
  peer: PeerOptions;
  /** Latence ajoutée à chaque message reçu (ms) : essais avec un réseau lent (`?lag=100`). */
  lag: number;
}

/** Réglages lus dans l'adresse : serveur de mise en relation local (`?peer=hôte:port`, tests) et latence simulée. */
export function linkOptionsFromUrl(search: string): LinkOptions {
  const q = new URLSearchParams(search);
  const p = q.get('peer');
  let peer: PeerOptions = {};
  if (p) {
    const [host, port] = p.split(':');
    peer = { host, port: Number(port) || 9000, path: '/politiclash', secure: false };
  }
  return { peer, lag: Math.max(0, Math.min(1000, Number(q.get('lag')) || 0)) };
}

export class PeerLink {
  status: LinkStatus = 'connecting';
  /**
   * Messages du salon reçus avant que quelqu'un les écoute (l'invité parle dès que la liaison s'ouvre,
   * parfois avant que l'hôte ait créé son salon) : gardés, puis remis dès qu'on branche `onCtl`.
   */
  private ctlQueue: CtlMsg[] = [];
  private ctlHandler: ((msg: CtlMsg) => void) | null = null;
  get onCtl() {
    return (m: CtlMsg) => (this.ctlHandler ? this.ctlHandler(m) : this.ctlQueue.push(m));
  }
  set onCtl(fn: (msg: CtlMsg) => void) {
    this.ctlHandler = fn;
    const q = this.ctlQueue;
    this.ctlQueue = [];
    for (const m of q) fn(m);
  }
  onGame: (msg: GameMsg) => void = () => {};
  /** À chaque changement ; `connected` revient aussi après une reconnexion. */
  onStatus: (s: LinkStatus) => void = () => {};
  private peer!: Peer;
  private ctl: DataConnection | null = null;
  private game: DataConnection | null = null;
  /** Dernier message reçu sur chaque canal : un canal muet sans être fermé est détecté aussi. */
  private seen = { ctl: 0, game: 0 };
  private timers: number[] = [];
  private everConnected = false;
  private destroyed = false;

  private constructor(
    readonly role: Role,
    readonly code: string,
    private readonly opts: LinkOptions,
  ) {}

  /**
   * Ouvre un salon (hôte) ou le rejoint (invité). La promesse se résout quand le salon est enregistré (hôte)
   * ou quand les deux canaux sont ouverts (invité). Elle échoue avec une `LinkError`.
   */
  static async open(role: Role, code: string, opts: LinkOptions): Promise<PeerLink> {
    const s = new PeerLink(role, code, opts);
    const { Peer } = await import('peerjs');
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const ok = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const fail = (e: LinkError) => {
        if (settled) return;
        settled = true;
        s.destroy();
        reject(new Error(e));
      };
      const peer = role === 'host' ? new Peer(peerIdFor(code), opts.peer) : new Peer(opts.peer);
      s.peer = peer;
      peer.on('open', () => {
        if (role === 'host') {
          s.setStatus('waiting');
          ok();
        } else {
          s.dial(ok);
          // Rien d'ouvert au bout de 5 s : on rappelle (la première tentative se perd parfois), deux fois.
          for (const t of [5000, 10_000]) s.later(() => !s.connected && s.redial(ok), t);
          // L'hôte existe (sinon `peer-unavailable` arrive vite), mais rien ne s'ouvre : connexion directe impossible.
          s.later(() => fail('p2p-failed'), P2P_TIMEOUT_MS);
        }
      });
      peer.on('connection', (c) => {
        if (role === 'host') s.attach(c);
      });
      peer.on('disconnected', () => {
        // Lien avec le serveur de mise en relation perdu : on le rétablit (la partie en cours continue).
        if (!s.destroyed && !peer.destroyed) s.later(() => !peer.destroyed && peer.reconnect(), RETRY_MS);
      });
      peer.on('error', (err) => {
        const type = (err as { type?: string }).type;
        if (type === 'unavailable-id') fail('room-taken');
        else if (type === 'peer-unavailable') {
          // Pendant une partie, l'hôte est peut-être en train de revenir : on insiste.
          if (s.everConnected) s.later(() => s.dial(), RETRY_MS);
          else fail('room-not-found');
        } else if (type === 'webrtc' || type === 'negotiation-failed') {
          if (!s.everConnected) fail('p2p-failed');
        } else if (!settled && ['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible'].includes(type ?? '')) {
          fail('network');
        }
      });
      s.later(() => fail(role === 'guest' ? 'room-not-found' : 'network'), 25_000);
    });
    s.timers.push(window.setInterval(() => s.heartbeat(), PING_MS));
    return s;
  }

  get connected() {
    return !!this.ctl?.open && !!this.game?.open;
  }

  /** Message du salon. Rend faux si la liaison est coupée (perdu). */
  sendCtl(msg: CtlMsg): boolean {
    if (!this.ctl?.open) return false;
    this.ctl.send(msg);
    return true;
  }

  sendGame(msg: GameMsg) {
    if (this.game?.open) this.game.send(msg);
  }

  /** Pour les tests : coupe la liaison comme le ferait une perte de réseau. */
  simulateDrop() {
    this.ctl?.close();
    this.game?.close();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const t of this.timers) {
      window.clearTimeout(t);
      window.clearInterval(t);
    }
    this.ctl?.close();
    this.game?.close();
    this.peer?.destroy();
    this.setStatus('closed');
  }

  // ── Interne ─────────────────────────────────────────────────────────────

  /** Ferme les canaux à moitié ouverts et rappelle. */
  private redial(onOpen?: () => void) {
    for (const k of ['ctl', 'game'] as const) {
      this[k]?.close();
      this[k] = null;
    }
    this.dial(onOpen);
  }

  private dial(onOpen?: () => void) {
    if (this.destroyed || this.peer.destroyed || this.peer.disconnected) return;
    if (this.connected) return;
    const id = peerIdFor(this.code);
    this.attach(this.peer.connect(id, { label: 'ctl', reliable: true, serialization: 'json' }), onOpen);
    this.attach(this.peer.connect(id, { label: 'game', reliable: false, serialization: 'json' }), onOpen);
  }

  private attach(c: DataConnection, onOpen?: () => void) {
    const kind = c.label === 'game' ? 'game' : 'ctl';
    c.on('open', () => {
      const old = this[kind];
      if (old && old !== c) old.close();
      this[kind] = c;
      this.seen[kind] = performance.now();
      if (this.connected) {
        this.everConnected = true;
        onOpen?.();
        this.setStatus('connected');
      }
    });
    c.on('data', (d) => {
      if (this[kind] === c) this.seen[kind] = performance.now();
      const msg = d as { t?: string };
      if (msg?.t === 'beat') return;
      const deliver = () => {
        if (this.destroyed) return;
        if (kind === 'game') this.onGame(d as GameMsg);
        else this.onCtl(d as CtlMsg);
      };
      if (this.opts.lag > 0) window.setTimeout(deliver, this.opts.lag);
      else deliver();
    });
    const lost = () => {
      if (this[kind] === c) this.drop();
    };
    c.on('close', lost);
    c.on('error', lost);
  }

  /** La liaison est tombée : on prévient et on la refait (c'est l'invité qui rappelle). */
  private drop() {
    if (this.destroyed) return;
    this.ctl?.close();
    this.game?.close();
    this.ctl = null;
    this.game = null;
    this.setStatus('reconnecting');
    if (this.role === 'guest') this.later(() => this.dial(), 300);
  }

  private heartbeat() {
    if (this.destroyed) return;
    if (this.connected) {
      // Battement sur les deux canaux ; si l'un des deux reste muet, on refait toute la liaison.
      this.ctl?.send({ t: 'beat' });
      this.game?.send({ t: 'beat' });
      const now = performance.now();
      if (now - this.seen.ctl > DEAD_MS || now - this.seen.game > DEAD_MS) this.drop();
    } else if (this.role === 'guest' && this.everConnected) {
      this.redial();
    }
  }

  private setStatus(s: LinkStatus) {
    if (this.status === s && s !== 'connected') return;
    this.status = s;
    this.onStatus(s);
  }

  private later(fn: () => void, ms: number) {
    this.timers.push(window.setTimeout(() => !this.destroyed && fn(), ms));
  }
}
