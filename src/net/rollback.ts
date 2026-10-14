// Session de jeu en ligne : les deux téléphones font tourner la même simulation et ne s'échangent que
// leurs entrées. Indépendant du transport (PeerJS, relais, faux tuyau des tests) et de l'horloge :
// l'appelant fournit l'heure (`now`, en ms) et une fonction `send`. Rien ici ne touche à Phaser.
//
// Principe :
// - retard d'entrée : l'appui fait au pas F s'applique au pas F + delay, ce qui laisse le temps de l'envoyer ;
// - prédiction : tant que l'entrée de l'adversaire n'est pas arrivée, on suppose qu'il garde la même ;
// - retour en arrière : quand elle arrive et diffère de la prédiction, on reprend l'état gardé à ce pas et on
//   rejoue jusqu'au pas actuel (au plus `maxRollback` pas ; au-delà, le jeu attend) ;
// - redondance : chaque paquet renvoie toutes les entrées que l'autre n'a pas encore confirmées,
//   une perte ou un désordre ne demande donc aucune réémission ;
// - contrôle : toutes les `hashEvery` images confirmées, chacun envoie l'empreinte de son état ; en cas
//   d'écart, l'hôte (joueur 0) envoie son état et l'invité s'y recale.
import { hashState, step, type FightEvent, type FightState } from '../logic/fight';
import { decodeInput, encodeInput, type InputFrame } from '../logic/input';

export type NetMsg =
  /** Entrées de l'expéditeur à partir du pas `from` ; `ack` : dernier pas où il a reçu toutes les nôtres. */
  | { t: 'in'; from: number; in: number[]; ack: number; frame: number; adv: number }
  | { t: 'hash'; frame: number; hash: number }
  | { t: 'sync'; frame: number; state: FightState };

export type NetStatus = 'ok' | 'unstable' | 'paused' | 'lost';

export interface SessionOptions {
  /** Retard d'entrée, en pas (3 à 4 : 50 à 67 ms). */
  delay?: number;
  /** Retour en arrière maximal, en pas. */
  maxRollback?: number;
  /** Contrôle d'empreinte toutes les N images confirmées. */
  hashEvery?: number;
  /** Garder toutes les entrées du match (tests : rejouer le match hors réseau). */
  keepLog?: boolean;
}

/** Seuils des coupures (ms). */
export const NET_TIMING = {
  /** Sans nouvelles depuis ce délai, ou jeu figé depuis ce délai : « Connexion instable… ». */
  unstableMs: 250,
  /** Au-delà : pause et tentative de reconnexion. */
  pauseMs: 3000,
  /** Au-delà : fin du match. */
  lostMs: 15000,
};

/**
 * Annonces qui changent le cours du match : elles attendent que leur pas soit confirmé, pour ne jamais
 * annoncer un K.O. qu'une entrée arrivée en retard aurait démenti (au plus la latence de retard).
 */
const HELD = new Set(['round', 'fight', 'ko', 'timeup', 'roundEnd']);

/** Entrées gardées en mémoire (pas) : de quoi rejouer après un recalage. */
const HISTORY = 1200;
/** Au plus tant d'entrées par paquet. */
const MAX_PER_PACKET = 64;

export interface SessionStats {
  /** Retours en arrière effectués, pas rejoués au total, plus long retour. */
  rollbacks: number;
  replayed: number;
  maxDepth: number;
  /** Images où le jeu a dû attendre l'adversaire. */
  stalls: number;
  /** Images sautées pour laisser l'adversaire rattraper son retard d'horloge. */
  waits: number;
  /** Empreintes comparées, écarts constatés, recalages reçus (invité). */
  checks: number;
  desyncs: number;
  resyncs: number;
  /** Paquets et octets envoyés (taille JSON). */
  packets: number;
  bytes: number;
}

export class NetSession {
  readonly them: 0 | 1;
  private readonly delay: number;
  private readonly maxRollback: number;
  private readonly hashEvery: number;

  /** Nombre de pas joués : `state` est l'état après `frame` pas. */
  frame = 0;
  private states = new Map<number, FightState>();
  private local = new Map<number, number>();
  private remote = new Map<number, number>();
  /** Entrée adverse utilisée pour chaque pas joué sans la connaître encore. */
  private used = new Map<number, number>();
  private localLast: number;
  /** Dernier pas pour lequel on a toutes les entrées adverses depuis le début. */
  private remoteContig = -1;
  /** Dernier pas pour lequel l'adversaire a toutes les nôtres. */
  private ackedByRemote = -1;
  /** Premier pas à rejouer (Infinity : rien à rejouer). */
  private rollbackFrom = Infinity;

  private myHashes = new Map<number, number>();
  private theirHashes = new Map<number, number>();
  /** États confirmés aux pas contrôlés, pour pouvoir les envoyer en cas d'écart (hôte). */
  private checkpoints = new Map<number, FightState>();
  private confirmed = 0;

  /** Événements déjà annoncés : identité → pas où ils l'ont été. */
  private reported = new Map<string, number[]>();
  private outbox: FightEvent[] = [];
  /** Annonces en attente de confirmation, par pas. */
  private held = new Map<number, FightEvent[]>();

  private lastRecv: number | null = null;
  private stalledSince: number | null = null;
  private remoteFrame = -1;
  private remoteAdv = 0;
  private lastWait = -100;

  /** Toutes les entrées du match, si `keepLog`. */
  readonly log: { local: number[]; remote: number[] } | null;
  readonly stats: SessionStats = { rollbacks: 0, replayed: 0, maxDepth: 0, stalls: 0, waits: 0, checks: 0, desyncs: 0, resyncs: 0, packets: 0, bytes: 0 };

  constructor(
    readonly me: 0 | 1,
    initial: FightState,
    private readonly send: (m: NetMsg) => void,
    opts: SessionOptions = {},
  ) {
    this.them = me === 0 ? 1 : 0;
    this.delay = opts.delay ?? 3;
    this.maxRollback = opts.maxRollback ?? 8;
    this.hashEvery = opts.hashEvery ?? 60;
    this.log = opts.keepLog ? { local: [], remote: [] } : null;
    this.states.set(0, initial);
    // Les premiers pas, avant que le premier appui ne soit appliqué : aucune touche.
    for (let f = 0; f < this.delay; f++) this.local.set(f, 0);
    this.localLast = this.delay - 1;
  }

  /** État le plus récent (avec les prédictions) : c'est lui qu'on affiche. */
  get state(): FightState {
    return this.states.get(this.frame) as FightState;
  }

  /** Dernier pas dont on connaît toutes les entrées des deux joueurs : cet état ne changera plus. */
  get confirmedFrame() {
    return this.confirmed;
  }

  get confirmedState(): FightState {
    return (this.states.get(this.confirmed) ?? this.checkpoints.get(this.confirmed)) as FightState;
  }

  /** Le match est fini pour de bon (état confirmé). */
  get finished() {
    return this.confirmed === this.frame && this.state.phase === 'matchEnd';
  }

  /** Avance des horloges : positif, on est en avance sur l'adversaire. */
  get advantage() {
    // Tant qu'on n'a rien reçu, on ne sait pas où en est l'autre.
    if (this.remoteFrame < 0) return 0;
    return (this.frame - this.remoteFrame - this.remoteAdv) / 2;
  }

  status(now: number): NetStatus {
    const silence = this.lastRecv === null ? 0 : now - this.lastRecv;
    if (silence >= NET_TIMING.lostMs) return 'lost';
    if (silence >= NET_TIMING.pauseMs) return 'paused';
    if (silence >= NET_TIMING.unstableMs) return 'unstable';
    if (this.stalledSince !== null && now - this.stalledSince >= NET_TIMING.unstableMs) return 'unstable';
    return 'ok';
  }

  /**
   * Une image : enregistre l'entrée locale, rejoue si une entrée adverse a contredit une prédiction,
   * avance d'un pas si possible, envoie un paquet. Rend vrai si la simulation a avancé.
   */
  tick(now: number, input: InputFrame): boolean {
    if (this.lastRecv === null) this.lastRecv = now;
    const st = this.status(now);
    let advanced = false;
    if (st !== 'paused' && st !== 'lost' && this.state.phase !== 'matchEnd') {
      if (this.localLast < this.frame + this.delay) {
        this.localLast += 1;
        this.local.set(this.localLast, encodeInput(input));
      }
      this.applyRollback();
      // Horloges : si on est nettement en avance, on attend une image (pas plus d'une fois sur 8).
      if (this.advantage > 1.5 && this.frame - this.lastWait > 8) {
        this.lastWait = this.frame;
        this.stats.waits += 1;
      } else if (this.canAdvance()) {
        this.simulate(this.frame);
        this.frame += 1;
        advanced = true;
      } else {
        this.stats.stalls += 1;
      }
      this.stalledSince = advanced ? null : (this.stalledSince ?? now);
      this.advanceConfirmed();
      this.prune();
    } else if (this.state.phase === 'matchEnd') {
      this.applyRollback();
      this.stalledSince = null;
    }
    this.sendInputs();
    return advanced;
  }

  receive(now: number, msg: NetMsg) {
    this.lastRecv = now;
    if (msg.t === 'in') this.onInputs(msg);
    else if (msg.t === 'hash') {
      this.theirHashes.set(msg.frame, msg.hash);
      this.compare(msg.frame);
    } else if (msg.t === 'sync') this.onSync(msg);
  }

  /** Événements nouveaux depuis le dernier appel (chacun une seule fois, même après un retour en arrière). */
  drainEvents(): FightEvent[] {
    const out = this.outbox;
    this.outbox = [];
    return out;
  }

  // ── Interne ─────────────────────────────────────────────────────────────

  private canAdvance() {
    // Il faut notre entrée pour ce pas, et ne pas dépasser le retour en arrière permis.
    return this.local.has(this.frame) && this.frame - this.remoteContig <= this.maxRollback;
  }

  private predict(f: number) {
    return this.remote.get(f) ?? this.remote.get(this.remoteContig) ?? 0;
  }

  /** Joue le pas `f` à partir de l'état gardé à `f`. */
  private simulate(f: number) {
    const s = this.states.get(f) as FightState;
    const known = this.remote.has(f);
    const r = known ? (this.remote.get(f) as number) : this.predict(f);
    if (known) this.used.delete(f);
    else this.used.set(f, r);
    const l = this.local.get(f) as number;
    const [in0, in1] = this.me === 0 ? [l, r] : [r, l];
    const n = step(s, decodeInput(in0), decodeInput(in1));
    this.states.set(f + 1, n);
    this.held.delete(f);
    for (const e of n.ev) {
      // La fin du match n'est annoncée qu'une fois confirmée (voir `finished`).
      if (e.t === 'matchEnd') continue;
      if (HELD.has(e.t)) {
        // Pas déjà confirmé (rejoué après un recalage) : l'annonce a déjà été faite.
        if (f < this.confirmed) continue;
        const list = this.held.get(f) ?? [];
        list.push(e);
        this.held.set(f, list);
        continue;
      }
      // Un même événement (même type, même joueur, même coup) rejoué à quelques pas d'écart après une
      // correction est le même : on ne rejoue pas l'effet. Deux vrais coups sont toujours plus espacés.
      const ex = e as { who?: number; by?: number; move?: string; n?: number };
      const key = `${e.t}|${ex.who ?? ex.by ?? ''}|${ex.move ?? ''}|${ex.n ?? ''}`;
      const at = this.reported.get(key) ?? [];
      if (at.some((g) => Math.abs(g - f) <= this.maxRollback + 2)) continue;
      at.push(f);
      this.reported.set(key, at);
      this.outbox.push(e);
    }
  }

  private applyRollback() {
    const from = this.rollbackFrom;
    if (from === Infinity) return;
    this.rollbackFrom = Infinity;
    if (from >= this.frame) return;
    const depth = this.frame - from;
    this.stats.rollbacks += 1;
    this.stats.replayed += depth;
    this.stats.maxDepth = Math.max(this.stats.maxDepth, depth);
    for (let f = from; f < this.frame; f++) this.simulate(f);
  }

  private onInputs(m: Extract<NetMsg, { t: 'in' }>) {
    this.remoteFrame = Math.max(this.remoteFrame, m.frame);
    this.remoteAdv = m.adv;
    this.ackedByRemote = Math.max(this.ackedByRemote, Math.min(m.ack, this.localLast));
    for (let i = 0; i < m.in.length; i++) {
      const f = m.from + i;
      if (f <= this.remoteContig || this.remote.has(f)) continue;
      const v = m.in[i];
      this.remote.set(f, v);
      // Ce pas a déjà été joué avec une autre prédiction : il faudra le rejouer.
      if (f < this.frame && this.used.has(f) && this.used.get(f) !== v) this.rollbackFrom = Math.min(this.rollbackFrom, f);
    }
    const before = this.remoteContig;
    while (this.remote.has(this.remoteContig + 1)) this.remoteContig += 1;
    if (this.log) for (let f = before + 1; f <= this.remoteContig; f++) this.log.remote[f] = this.remote.get(f) as number;
    this.advanceConfirmed();
  }

  /** Le pas confirmé avance avec les entrées adverses ; on contrôle les empreintes au passage. */
  private advanceConfirmed() {
    // On attend d'avoir rejoué ce qui doit l'être : sinon on figerait un état faux.
    this.applyRollback();
    const c = Math.min(this.remoteContig + 1, this.frame);
    for (let k = this.confirmed + 1; k <= c; k++) {
      if (this.log) this.log.local[k - 1] = this.local.get(k - 1) as number;
      const held = this.held.get(k - 1);
      if (held) {
        this.outbox.push(...held);
        this.held.delete(k - 1);
      }
      if (k % this.hashEvery !== 0) continue;
      const s = this.states.get(k) as FightState;
      const h = hashState(s);
      this.myHashes.set(k, h);
      this.checkpoints.set(k, s);
      this.send({ t: 'hash', frame: k, hash: h });
      this.stats.packets += 1;
      this.compare(k);
    }
    this.confirmed = Math.max(this.confirmed, c);
  }

  private compare(k: number) {
    const a = this.myHashes.get(k);
    const b = this.theirHashes.get(k);
    if (a === undefined || b === undefined) return;
    this.stats.checks += 1;
    this.theirHashes.delete(k);
    if (a === b) return;
    this.stats.desyncs += 1;
    // L'hôte fait foi : il envoie son état, l'invité s'y recale.
    if (this.me === 0) {
      const state = this.checkpoints.get(k);
      if (state) this.send({ t: 'sync', frame: k, state });
    }
  }

  private onSync(m: Extract<NetMsg, { t: 'sync' }>) {
    if (this.me !== 1) return;
    const k = m.frame;
    if (k > this.frame) return;
    this.stats.resyncs += 1;
    this.states.set(k, m.state);
    this.checkpoints.set(k, m.state);
    this.myHashes.set(k, hashState(m.state));
    // Rejoue depuis l'état de l'hôte avec les entrées connues (gardées assez longtemps pour ça).
    for (let f = k; f < this.frame; f++) this.simulate(f);
  }

  private sendInputs() {
    const from = this.ackedByRemote + 1;
    const to = Math.min(this.localLast, from + MAX_PER_PACKET - 1);
    const list: number[] = [];
    for (let f = from; f <= to; f++) list.push(this.local.get(f) as number);
    const msg: NetMsg = { t: 'in', from, in: list, ack: this.remoteContig, frame: this.frame, adv: this.frame - this.remoteFrame };
    this.send(msg);
    this.stats.packets += 1;
    this.stats.bytes += 40 + list.length * 2;
  }

  /** Oublie ce qui ne servira plus. */
  private prune() {
    if (this.frame % 30 !== 0) return;
    const keepState = Math.min(this.confirmed, this.frame - this.maxRollback - 1);
    for (const f of this.states.keys()) if (f < keepState) this.states.delete(f);
    const keepInputs = this.frame - HISTORY;
    for (const m of [this.local, this.remote, this.used]) for (const f of m.keys()) if (f < keepInputs && f < this.ackedByRemote && f < this.remoteContig) m.delete(f);
    for (const m of [this.myHashes, this.checkpoints]) for (const f of m.keys()) if (f < keepInputs) m.delete(f);
    for (const f of this.theirHashes.keys()) if (f < keepInputs) this.theirHashes.delete(f);
    const keepKeys = this.confirmed - this.maxRollback - 5;
    for (const [key, at] of this.reported) {
      const kept = at.filter((g) => g >= keepKeys);
      if (kept.length) this.reported.set(key, kept);
      else this.reported.delete(key);
    }
  }
}

/**
 * Retard d'entrée conseillé pour un aller-retour mesuré (ping, ms) : assez pour que l'entrée adverse
 * arrive avant d'avoir à revenir de plus de `maxRollback` pas. Entre 3 (50 ms) et 6 (100 ms).
 * Mesures (200 matchs, faux tuyau) : à 200 ms par sens, 3 pas → 19 % d'images en attente, 6 pas → 0,8 %.
 */
export function delayForPing(pingMs: number, maxRollback = 8) {
  const oneWay = Math.ceil(pingMs / 2 / (1000 / 60)) + 1;
  return Math.max(3, Math.min(6, oneWay - maxRollback + 1));
}
