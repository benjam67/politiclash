// La file d'attente de la Partie rapide : un seul Durable Object pour tout le monde (Cloudflare garantit qu'il
// n'en existe qu'un exemplaire). Chaque joueur qui ouvre la Partie rapide s'y connecte en WebSocket.
//
// Messages du jeu : hello {v, pseudo}, search, cancel, accept {match}, decline {match}.
// Messages du serveur : count {online, searching}, found, match, requeued, dropped (voir queue.ts).
import { DeviceLimits, MessageRate } from './limits';
import { MatchQueue, type QueueEvent } from './queue';

/** Délai entre deux vérifications (acceptations dépassées, nouvelles associations possibles). */
const TICK_MS = 1000;
/** Pseudo : un numéro dans la liste du jeu. */
const MAX_PSEUDO = 999;

interface Conn {
  ws: WebSocket;
  v: string | null;
  pseudo: number;
  region: string;
  /** Identifiant du classement (facultatif). */
  rid: string | null;
  /** Appareil (empreinte de l'adresse IP, pour les limites d'usage) et débit de ses messages. */
  device: string;
  rate: MessageRate;
}

interface QueueEnv {
  RANK?: { idFromName(name: string): unknown; get(id: unknown): { fetch(r: Request | string, init?: RequestInit): Promise<Response> } };
}

export class QueueDO {
  private conns = new Map<string, Conn>();
  private queue = new MatchQueue(
    () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32,
    () => crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase(),
  );
  private timer: ReturnType<typeof setInterval> | null = null;
  private limits = new DeviceLimits();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: QueueEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') return new Response('websocket attendu', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    // Appareil inconnu (essai local) : pas de limite par appareil, seulement le débit de messages.
    const device = request.headers.get('x-device') ?? '';
    // Limites d'usage : trop de connexions de cet appareil, la nouvelle est fermée tout de suite.
    if (device && !this.limits.open(device, Date.now())) {
      server.close(1008, 'too-many');
      return new Response(null, { status: 101, webSocket: client });
    }
    const id = crypto.randomUUID();
    const conn: Conn = { ws: server, v: null, pseudo: 0, region: request.headers.get('x-region') ?? 'XX', rid: null, device, rate: new MessageRate() };
    this.conns.set(id, conn);
    server.addEventListener('message', (e) => this.onMessage(id, e.data));
    const gone = () => this.onClose(id);
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);
    this.ensureTimer();
    this.broadcastCount();
    return new Response(null, { status: 101, webSocket: client });
  }

  private onMessage(id: string, raw: unknown) {
    const conn = this.conns.get(id);
    if (!conn || typeof raw !== 'string' || raw.length > 512) return;
    // Trop de messages : la connexion est fermée (le jeu n'en envoie que quelques-uns par recherche).
    if (!conn.rate.hit(Date.now())) {
      try {
        conn.ws.close(1008, 'rate');
      } catch {
        /* déjà fermée */
      }
      this.onClose(id);
      return;
    }
    let m: { t?: string; v?: unknown; pseudo?: unknown; match?: unknown; rid?: unknown };
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    const now = Date.now();
    switch (m.t) {
      case 'hello':
        conn.v = typeof m.v === 'string' ? m.v.slice(0, 32) : null;
        conn.rid = typeof m.rid === 'string' && /^[a-f0-9]{16,64}$/.test(m.rid) ? m.rid : null;
        conn.pseudo = Number.isInteger(m.pseudo) && (m.pseudo as number) >= 0 && (m.pseudo as number) <= MAX_PSEUDO ? (m.pseudo as number) : 0;
        break;
      case 'search':
        if (conn.v) this.send(this.queue.join({ id, v: conn.v, region: conn.region, pseudo: conn.pseudo, rid: conn.rid ?? undefined }, now));
        break;
      case 'cancel':
        this.send(this.queue.leave(id, now));
        break;
      case 'accept':
        if (typeof m.match === 'string') this.send(this.queue.accept(id, m.match, now));
        break;
      case 'decline':
        if (typeof m.match === 'string') this.send(this.queue.decline(id, m.match, now));
        break;
      case 'ping':
        this.post(conn, { t: 'pong' });
        return;
    }
    this.broadcastCount();
  }

  private onClose(id: string) {
    const conn = this.conns.get(id);
    if (!conn) return;
    this.conns.delete(id);
    if (conn.device) this.limits.close(conn.device);
    this.send(this.queue.leave(id, Date.now()));
    this.broadcastCount();
    if (!this.conns.size && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private ensureTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = Date.now();
      if (now % 60_000 < TICK_MS) this.limits.prune(now);
      const ev = this.queue.tick(now);
      if (ev.length) {
        this.send(ev);
        this.broadcastCount();
      }
    }, TICK_MS);
  }

  private send(events: QueueEvent[]) {
    for (const e of events) {
      // Match organisé : le classement apprend qui joue contre qui (seuls ces matchs-là pourront compter).
      if (e.t === 'match' && e.role === 'host' && e.rid && e.foeRid && this.env.RANK) {
        const stub = this.env.RANK.get(this.env.RANK.idFromName('global'));
        void stub.fetch('https://rank/pair', { method: 'POST', body: JSON.stringify({ match: e.match, a: e.rid, b: e.foeRid }) }).catch(() => {});
      }
      const conn = this.conns.get(e.to);
      if (!conn) continue;
      // On n'envoie pas aux joueurs l'identifiant de classement de l'autre.
      const { to: _to, ...rest } = e;
      const msg = 'foeRid' in rest ? { ...rest, foeRid: undefined, rid: undefined } : rest;
      this.post(conn, msg);
    }
  }

  private lastCount = '';
  private broadcastCount() {
    const msg = { t: 'count', online: this.conns.size, searching: this.queue.searching };
    const key = JSON.stringify(msg);
    if (key === this.lastCount) return;
    this.lastCount = key;
    for (const c of this.conns.values()) this.post(c, msg);
  }

  private post(c: Conn, msg: unknown) {
    try {
      c.ws.send(JSON.stringify(msg));
    } catch {
      /* fermée entre-temps */
    }
  }
}
