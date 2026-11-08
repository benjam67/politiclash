// Statistiques de jeu : un seul Durable Object, avec sa base SQLite. Il ne garde que des totaux par jour.
//
// Adresses (appelées par le Worker) :
//   POST /stats/match     fiche de fin de match (voir stats.ts)
//   POST /stats/campaign  étape de la campagne : start, done, quit
//   POST /stats/wait      Primaire ouverte : fin d'une recherche d'adversaire et sa durée
//   GET  /stats/data?days=N   totaux des N derniers jours (le Worker vérifie la clé avant)
// Limite d'usage : `PER_MINUTE` fiches par appareil et par minute. L'appareil est reconnu par une empreinte
// de son adresse IP calculée par le Worker, gardée en mémoire une minute au plus, jamais enregistrée.
import { dayKey } from './rank';
import { campaignCounters, matchCounters, parseCampaign, parseMatch, parseWait, PER_MINUTE, waitCounters } from './stats';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const PARSERS: Record<string, (body: unknown) => [string, number][] | null> = {
  '/match': (b) => {
    const c = parseMatch(b);
    return c && matchCounters(c);
  },
  '/campaign': (b) => {
    const c = parseCampaign(b);
    return c && campaignCounters(c);
  },
  '/wait': (b) => {
    const c = parseWait(b);
    return c && waitCounters(c);
  },
};

export class StatsDO {
  private sql: SqlStorage;
  private minute = 0;
  private seen = new Map<string, number>();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: unknown,
  ) {
    this.sql = state.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS counters (day TEXT NOT NULL, key TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, key))');
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/stats/, '');
    if (request.method === 'GET' && path === '/data') return this.data(url.searchParams.get('days'));
    if (request.method !== 'POST' || !(path in PARSERS)) return json({ error: 'not-found' }, 404);

    // Limite d'usage, par minute.
    const now = Date.now();
    const m = Math.floor(now / 60000);
    if (m !== this.minute) {
      this.minute = m;
      this.seen.clear();
    }
    const who = request.headers.get('x-device') ?? '?';
    const count = (this.seen.get(who) ?? 0) + 1;
    this.seen.set(who, count);
    if (count > PER_MINUTE) return json({ ok: false, limited: true }, 429);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'bad-json' }, 400);
    }
    const counters = PARSERS[path](body);
    if (!counters) return json({ error: 'bad-card' }, 400);
    const day = dayKey(now);
    for (const [key, n] of counters) {
      this.sql.exec('INSERT INTO counters (day, key, n) VALUES (?, ?, ?) ON CONFLICT (day, key) DO UPDATE SET n = n + excluded.n', day, key, n);
    }
    return json({ ok: true });
  }

  private data(daysRaw: string | null): Response {
    const days = Math.min(3660, Math.max(1, Number.parseInt(daysRaw ?? '30', 10) || 30));
    const from = dayKey(Date.now() - (days - 1) * 86400000);
    const rows = this.sql.exec('SELECT day, key, n FROM counters WHERE day >= ? ORDER BY day', from).toArray() as { day: string; key: string; n: number }[];
    return json({ from, days, rows: rows.map((r) => [r.day, r.key, r.n]) });
  }
}
