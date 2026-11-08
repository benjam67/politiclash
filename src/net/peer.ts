// Liaison entre les deux téléphones (PeerJS / WebRTC). L'hôte s'enregistre sous l'identifiant du salon,
// l'invité s'y connecte avec le code. Deux canaux : `ctl` (fiable et ordonné : le salon) et `game` (non
// ordonné : les entrées du match ; un paquet perdu ne retient pas les suivants, la session sait les remettre
// dans l'ordre). La mise en relation passe par le service public de PeerJS. Quand la connexion directe est
// impossible (certains réseaux mobiles), WebRTC passe par le relais de Cloudflare, dont le serveur du jeu
// fournit les accès (`ice.ts`).
import type { DataConnection, Peer, PeerOptions } from 'peerjs';
import { getIceServers } from './ice';
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
  /**
   * `auto` : connexion directe si possible, relais sinon (Entre amis). `only` : toujours par le relais
   * (Partie rapide : l'adresse IP de l'un n'est jamais transmise à l'autre ; essais : `?relay=1`).
   */
  relay: 'auto' | 'only';
}

/** Chemin pris par la connexion : directe, ou par le relais. */
export type Route = 'direct' | 'relay';

/** Réglages lus dans l'adresse : serveur de mise en relation local (`?peer=hôte:port`, tests) et latence simulée. */
export function linkOptionsFromUrl(search: string): LinkOptions {
  const q = new URLSearchParams(search);
  const p = q.get('peer');
  let peer: PeerOptions = {};
  if (p) {
    const [host, port] = p.split(':');
    peer = { host, port: Number(port) || 9000, path: '/politiclash', secure: false };
  }
  return { peer, lag: Math.max(0, Math.min(1000, Number(q.get('lag')) || 0)), relay: q.get('relay') === '1' ? 'only' : 'auto' };
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
  /** Le service de mise en relation ne connaît pas (ou plus) le salon : l'hôte est peut-être sorti du jeu un instant. */
  private hostMissing = false;
  private onVisible = () => {
    // Retour sur le jeu (après le partage du lien, par exemple) : le téléphone a pu couper la liaison avec le
    // service de mise en relation pendant que le jeu était en arrière-plan. On la rétablit tout de suite.
    if (document.visibilityState !== 'visible' || this.destroyed || !this.peer || this.peer.destroyed) return;
    if (this.peer.disconnected) {
      this.step('retour, reconnexion');
      this.peer.reconnect();
    }
  };
  /** Le serveur a fourni un relais. */
  relayAvailable = false;
  /** Étapes de la connexion, avec le temps écoulé : affichées sous un message d'erreur, pour comprendre où ça bloque. */
  readonly trace: string[] = [];
  private t0 = performance.now();
  private step(what: string) {
    if (this.trace.length < 24) this.trace.push(`${what} ${((performance.now() - this.t0) / 1000).toFixed(1)} s`);
  }

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
    // Accès au relais : demandés en même temps que PeerJS se charge. Sans serveur, on part sans relais.
    const [{ Peer }, ice] = await Promise.all([import('peerjs'), getIceServers()]);
    const peerOpts: PeerOptions = { ...opts.peer };
    if (ice) peerOpts.config = { iceServers: ice, iceTransportPolicy: opts.relay === 'only' ? 'relay' : 'all' };
    s.relayAvailable = !!ice;
    s.step(ice ? (opts.relay === 'only' ? 'relais seul' : 'relais ok') : 'sans relais');
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
        s.step(`échec ${e}`);
        s.destroy();
        reject(Object.assign(new Error(e), { trace: s.trace }));
      };
      const peer = role === 'host' ? new Peer(peerIdFor(code), peerOpts) : new Peer(peerOpts);
      s.peer = peer;
      peer.on('open', () => {
        s.step('mise en relation');
        if (role === 'host') {
          s.setStatus('waiting');
          ok();
        } else {
          s.dial(ok);
          // Rien d'ouvert au bout de 5 s : on rappelle (la première tentative se perd parfois), deux fois.
          for (const t of [5000, 10_000]) s.later(() => !s.connected && !s.hostMissing && s.redial(ok), t);
          // Au bout du délai : si le salon n'a jamais été trouvé, il est introuvable ; sinon, les deux téléphones se
          // sont trouvés mais rien ne s'ouvre : connexion directe impossible (et pas de relais).
          s.later(() => fail(s.hostMissing ? 'room-not-found' : 'p2p-failed'), P2P_TIMEOUT_MS);
        }
      });
      document.addEventListener('visibilitychange', s.onVisible);
      peer.on('connection', (c) => {
        if (role === 'host') s.attach(c);
      });
      peer.on('disconnected', () => {
        // Lien avec le serveur de mise en relation perdu : on le rétablit (la partie en cours continue).
        if (!s.destroyed && !peer.destroyed) s.later(() => !peer.destroyed && peer.reconnect(), RETRY_MS);
      });
      peer.on('error', (err) => {
        const type = (err as { type?: string }).type;
        s.step(`erreur ${type}`);
        if (type === 'unavailable-id') fail('room-taken');
        else if (type === 'peer-unavailable') {
          // Salon pas (ou plus) enregistré : l'hôte est peut-être sorti du jeu un instant (pour partager le lien).
          // On insiste toutes les 1,5 s ; au bout du délai, « salon introuvable ».
          s.hostMissing = true;
          s.later(() => (s.everConnected ? s.dial() : s.redial(ok)), RETRY_MS);
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

  /** Chemin pris par le canal du match (statistiques WebRTC), null si inconnu. */
  async route(): Promise<Route | null> {
    const pc = (this.game as unknown as { peerConnection?: RTCPeerConnection } | null)?.peerConnection;
    if (!pc) return null;
    try {
      const stats = await pc.getStats();
      let pairId: string | undefined;
      stats.forEach((r) => {
        if (r.type === 'transport' && r.selectedCandidatePairId) pairId = r.selectedCandidatePairId;
      });
      let pair: { localCandidateId?: string; remoteCandidateId?: string } | undefined;
      stats.forEach((r) => {
        if (r.type !== 'candidate-pair') return;
        if (pairId ? r.id === pairId : r.state === 'succeeded' && r.nominated) pair = r;
      });
      if (!pair) return null;
      const types = [pair.localCandidateId, pair.remoteCandidateId].map((id) => (id ? stats.get(id)?.candidateType : undefined));
      return types.includes('relay') ? 'relay' : 'direct';
    } catch {
      return null;
    }
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
    document.removeEventListener('visibilitychange', this.onVisible);
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
    this.step('rappel');
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
    this.step('appel');
    this.attach(this.peer.connect(id, { label: 'ctl', reliable: true, serialization: 'json' }), onOpen);
    this.attach(this.peer.connect(id, { label: 'game', reliable: false, serialization: 'json' }), onOpen);
  }

  private attach(c: DataConnection, onOpen?: () => void) {
    const kind = c.label === 'game' ? 'game' : 'ctl';
    c.on('open', () => {
      const old = this[kind];
      if (old && old !== c) old.close();
      this[kind] = c;
      this.hostMissing = false;
      this.seen[kind] = performance.now();
      this.step(`${kind} ouvert`);
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
