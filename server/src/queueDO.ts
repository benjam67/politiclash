// La file d'attente de la Partie rapide : un seul Durable Object pour tout le monde (Cloudflare garantit qu'il
// n'en existe qu'un exemplaire). Chaque joueur qui ouvre la Partie rapide s'y connecte en WebSocket.
//
// Messages du jeu : hello {v, pseudo}, search, cancel, accept {match}, decline {match}.
// Messages du serveur : count {online, searching}, found, match, requeued, dropped (voir queue.ts).
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
}

export class QueueDO {
  private conns = new Map<string, Conn>();
  private queue = new MatchQueue(
    () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32,
    () => crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase(),
  );
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: unknown,
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') return new Response('websocket attendu', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    const id = crypto.randomUUID();
    const conn: Conn = { ws: server, v: null, pseudo: 0, region: request.headers.get('x-region') ?? 'XX' };
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
    let m: { t?: string; v?: unknown; pseudo?: unknown; match?: unknown };
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    const now = Date.now();
    switch (m.t) {
      case 'hello':
        conn.v = typeof m.v === 'string' ? m.v.slice(0, 32) : null;
        conn.pseudo = Number.isInteger(m.pseudo) && (m.pseudo as number) >= 0 && (m.pseudo as number) <= MAX_PSEUDO ? (m.pseudo as number) : 0;
        break;
      case 'search':
        if (conn.v) this.send(this.queue.join({ id, v: conn.v, region: conn.region, pseudo: conn.pseudo }, now));
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
    if (!this.conns.has(id)) return;
    this.conns.delete(id);
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
      const ev = this.queue.tick(Date.now());
      if (ev.length) {
        this.send(ev);
        this.broadcastCount();
      }
    }, TICK_MS);
  }

  private send(events: QueueEvent[]) {
    for (const e of events) {
      const conn = this.conns.get(e.to);
      if (!conn) continue;
      const { to: _to, ...msg } = e;
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
