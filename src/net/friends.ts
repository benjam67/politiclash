// Mode Entre amis : l'état du salon, partagé par les écrans (salon, combat, résultat) tant que les deux
// téléphones sont reliés. L'hôte fait foi pour le lieu, le départ du match et le retard d'entrée.
import { PLAYABLE_IDS, type FighterId } from '../config/roster';
import { STAGE_IDS, type StageId } from '../config/stages';
import { PeerLink, type LinkStatus } from './peer';
import { delayForPing } from './rollback';
import { RULES_VERSION, cleanPseudo, indexOf, type CtlMsg, type GameMsg, type MatchStart, type Role } from './room';

export interface PlayerInfo {
  pseudo: string;
  fighter: FighterId | null;
  ready: boolean;
}

/** Pourquoi le salon s'est fermé. */
export type LeaveReason = 'bye' | 'lost' | 'version' | 'self';

/** Ce que les écrans écoutent. */
export interface RoomListener {
  change?(): void;
  start?(s: MatchStart): void;
  leave?(why: LeaveReason): void;
  react?(i: number): void;
  game?(m: GameMsg): void;
  room?(): void;
  link?(s: LinkStatus): void;
  /** Nouvelle mesure du ping (sans autre changement). */
  ping?(): void;
}

const PING_EVERY = 500;
const PING_KEEP = 9;

export class FriendRoom {
  readonly me: PlayerInfo;
  them: PlayerInfo | null = null;
  stage: StageId;
  /** Aller-retour médian mesuré (ms), null tant qu'on n'a pas de mesure. */
  ping: number | null = null;
  /** Le match en cours ou le dernier joué. */
  match: MatchStart | null = null;
  /** Revanche demandée, par moi et par l'autre. */
  again = { me: false, them: false };
  closed: LeaveReason | null = null;
  private listeners = new Set<RoomListener>();
  private pings = new Map<number, number>();
  private samples: number[] = [];
  private pingId = 0;
  private timer: ReturnType<typeof setInterval>;
  private matchNo = 0;

  constructor(
    readonly link: PeerLink,
    pseudo: string,
    fighter: FighterId | null,
    stage: StageId | null,
  ) {
    this.me = { pseudo: cleanPseudo(pseudo) || 'Joueur', fighter, ready: false };
    this.stage = stage ?? STAGE_IDS[0];
    link.onCtl = (m) => this.onCtl(m);
    link.onGame = (m) => this.emit((l) => l.game?.(m));
    link.onStatus = (s) => {
      if (s === 'connected') this.hello();
      this.emit((l) => l.link?.(s));
      this.emit((l) => l.change?.());
    };
    this.timer = setInterval(() => this.sendPing(), PING_EVERY);
    if (link.connected) this.hello();
  }

  get role(): Role {
    return this.link.role;
  }
  get index() {
    return indexOf(this.role);
  }
  get isHost() {
    return this.role === 'host';
  }
  get code() {
    return this.link.code;
  }

  listen(l: RoomListener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  // ── Actions des écrans ─────────────────────────────────────────────────

  pick(f: FighterId) {
    this.me.fighter = f;
    this.setReady(false);
    this.link.sendCtl({ t: 'pick', fighter: f });
    this.emit((l) => l.change?.());
  }

  /** Lieu : l'hôte seulement. Change le lieu remet les deux « Prêt » à zéro. */
  setStage(s: StageId) {
    if (!this.isHost) return;
    this.stage = s;
    this.setReady(false);
    // L'invité remet son « Prêt » à zéro en recevant le nouveau lieu.
    if (this.them) this.them.ready = false;
    this.link.sendCtl({ t: 'stage', stage: s });
    this.emit((l) => l.change?.());
  }

  setReady(on: boolean) {
    if (on && !this.me.fighter) return;
    if (this.me.ready === on) return;
    this.me.ready = on;
    this.link.sendCtl({ t: 'ready', on });
    this.emit((l) => l.change?.());
    this.maybeStart();
  }

  react(i: number) {
    this.link.sendCtl({ t: 'react', i });
  }

  /** Revanche demandée ; le match repart quand les deux l'ont demandée. */
  askAgain() {
    this.again.me = true;
    this.link.sendCtl({ t: 'again' });
    this.emit((l) => l.change?.());
    this.maybeStart();
  }

  /** Retour au salon (changer de perso) : l'autre y revient aussi. */
  backToRoom() {
    this.resetForRoom();
    this.link.sendCtl({ t: 'room' });
  }

  leave() {
    if (this.closed) return;
    this.link.sendCtl({ t: 'bye' });
    // Laisse partir le message avant de couper.
    setTimeout(() => this.close('self'), 150);
  }

  sendGame(m: GameMsg) {
    this.link.sendGame(m);
  }

  /** Avertissement « connexion faible » au-delà de 150 ms d'aller-retour. */
  get weak() {
    return this.ping !== null && this.ping > 150;
  }

  // ── Interne ─────────────────────────────────────────────────────────────

  private hello(re = false) {
    this.link.sendCtl({ t: 'hello', pseudo: this.me.pseudo, v: RULES_VERSION, re });
    if (this.me.fighter) this.link.sendCtl({ t: 'pick', fighter: this.me.fighter });
    if (this.isHost) this.link.sendCtl({ t: 'stage', stage: this.stage });
    if (this.me.ready) this.link.sendCtl({ t: 'ready', on: true });
  }

  private onCtl(m: CtlMsg) {
    if (this.closed) return;
    switch (m.t) {
      case 'hello':
        if (m.v !== RULES_VERSION) {
          this.close('version');
          return;
        }
        this.them = { pseudo: cleanPseudo(m.pseudo) || 'Joueur', fighter: this.them?.fighter ?? null, ready: this.them?.ready ?? false };
        // On répond par notre propre présentation : chacun a ainsi l'état de l'autre, quel que soit l'ordre d'arrivée.
        if (!m.re) this.hello(true);
        break;
      case 'pick': {
        if (!(PLAYABLE_IDS as string[]).includes(m.fighter)) return;
        // Un changement de perso annule son « Prêt » (il le renverra) ; une simple répétition, non.
        const them = this.ensureThem();
        if (them.fighter !== m.fighter) them.ready = false;
        them.fighter = m.fighter;
        break;
      }
      case 'stage':
        if (this.isHost || !(STAGE_IDS as string[]).includes(m.stage)) return;
        if (m.stage !== this.stage) {
          this.stage = m.stage;
          // Nouveau lieu : on n'est plus prêt, et on le dit à l'hôte.
          this.setReady(false);
        }
        break;
      case 'ready':
        this.ensureThem().ready = m.on;
        this.maybeStart();
        break;
      case 'start':
        if (this.isHost) return;
        this.begin(m.start);
        return;
      case 'ping':
        this.link.sendCtl({ t: 'pong', id: m.id });
        return;
      case 'pong': {
        const t0 = this.pings.get(m.id);
        if (t0 === undefined) return;
        this.pings.delete(m.id);
        this.samples.push(performance.now() - t0);
        if (this.samples.length > PING_KEEP) this.samples.shift();
        const sorted = [...this.samples].sort((a, b) => a - b);
        this.ping = Math.round(sorted[Math.floor(sorted.length / 2)]);
        this.emit((l) => l.ping?.());
        return;
      }
      case 'react':
        if (Number.isInteger(m.i)) this.emit((l) => l.react?.(m.i));
        return;
      case 'again':
        this.again.them = true;
        this.maybeStart();
        break;
      case 'room':
        this.resetForRoom();
        this.emit((l) => l.room?.());
        break;
      case 'bye':
        this.close('bye');
        return;
    }
    this.emit((l) => l.change?.());
  }

  private ensureThem() {
    if (!this.them) this.them = { pseudo: 'Joueur', fighter: null, ready: false };
    return this.them;
  }

  /** L'hôte lance le match : les deux sont prêts (salon), ou les deux veulent la revanche. */
  private maybeStart() {
    if (!this.isHost || !this.them) return;
    const fromRoom = this.me.ready && this.them.ready && this.me.fighter && this.them.fighter;
    const rematch = this.match && this.again.me && this.again.them;
    if (!fromRoom && !rematch) return;
    this.matchNo += 1;
    const start: MatchStart = {
      n: this.matchNo,
      seed: Math.floor(Math.random() * 2 ** 31),
      stage: this.stage,
      fighters: [this.me.fighter as FighterId, this.them.fighter as FighterId],
      delay: delayForPing(this.ping ?? 0),
    };
    this.link.sendCtl({ t: 'start', start });
    this.begin(start);
  }

  private begin(start: MatchStart) {
    this.match = start;
    this.matchNo = start.n;
    this.me.ready = false;
    if (this.them) this.them.ready = false;
    this.again = { me: false, them: false };
    this.emit((l) => l.start?.(start));
  }

  private resetForRoom() {
    this.me.ready = false;
    if (this.them) this.them.ready = false;
    this.again = { me: false, them: false };
  }

  private sendPing() {
    if (!this.link.connected) return;
    this.pingId += 1;
    this.pings.set(this.pingId, performance.now());
    if (this.pings.size > 20) this.pings.delete(Math.min(...this.pings.keys()));
    this.link.sendCtl({ t: 'ping', id: this.pingId });
  }

  close(why: LeaveReason) {
    if (this.closed) return;
    this.closed = why;
    clearInterval(this.timer);
    this.link.destroy();
    this.emit((l) => l.leave?.(why));
    if (current === this) current = null;
  }

  private emit(fn: (l: RoomListener) => void) {
    for (const l of [...this.listeners]) fn(l);
  }
}

/** Le salon en cours (un seul à la fois). */
let current: FriendRoom | null = null;
export const currentRoom = () => current;
export function setCurrentRoom(r: FriendRoom | null) {
  if (current && current !== r) current.close('self');
  current = r;
}
