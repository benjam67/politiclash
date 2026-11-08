// Classement de la Primaire ouverte : un seul Durable Object, avec sa base SQLite.
//
// Identité : sans comptes, chaque téléphone tire au hasard un identifiant (`rid`) et un secret, qu'il garde.
// Le serveur ne garde que l'empreinte du secret ; il faut le secret pour déclarer un résultat ou changer de nom.
// Rien d'autre n'est stocké (ni adresse IP, ni appareil).
//
// Adresses (appelées par le Worker, ou par la file d'attente pour /pair) :
//   POST /pair   {match, a, b}                 la file vient d'associer a et b (identifiants du classement)
//   POST /result {rid, secret, match, n, won}  résultat du n-ième match de ce salon, vu par ce joueur
//   POST /name   {rid, secret, name}           nom affiché dans le classement (filtré, unique : 409 s'il est pris)
//   POST /flag   {rid, secret, target}         signaler un nom
//   GET  /board?period=day|week|all&rid=…     les 100 premiers, et la place de ce joueur
import { anonymousName, nameAllowed, nameKey, tidyName } from './names';
import { dayKey, isPeriod, MAX_REMATCH, SAME_FOE_PER_DAY, settle, weekKey, type Period } from './rank';

export const TOP = 100;
/** Signalements de joueurs différents à partir desquels un nom est masqué. */
export const FLAGS_TO_HIDE = 3;
const NAME_CHANGES_PER_DAY = 5;
const FLAGS_PER_DAY = 20;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const ID = /^[a-f0-9]{16,64}$/;

export class RankDO {
  private sql: SqlStorage;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: unknown,
  ) {
    this.sql = state.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS players (rid TEXT PRIMARY KEY, secret TEXT NOT NULL, name TEXT, hidden INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, name_day TEXT, name_changes INTEGER NOT NULL DEFAULT 0, flag_day TEXT, flags_sent INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS pairs (match TEXT PRIMARY KEY, a TEXT NOT NULL, b TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS reports (match TEXT NOT NULL, n INTEGER NOT NULL, rid TEXT NOT NULL, won INTEGER NOT NULL, PRIMARY KEY (match, n, rid));
      CREATE TABLE IF NOT EXISTS wins (match TEXT NOT NULL, n INTEGER NOT NULL, winner TEXT NOT NULL, loser TEXT NOT NULL, day TEXT NOT NULL, week TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (match, n));
      CREATE INDEX IF NOT EXISTS wins_day ON wins (day, winner);
      CREATE INDEX IF NOT EXISTS wins_week ON wins (week, winner);
      CREATE INDEX IF NOT EXISTS wins_winner ON wins (winner);
      CREATE TABLE IF NOT EXISTS flags (target TEXT NOT NULL, reporter TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (target, reporter));
    `);
    // Noms uniques (ajouté le 8 novembre) : colonne de clé, remplie pour les noms déjà enregistrés ; en cas de
    // doublon ancien, le plus ancien garde le nom, les autres redeviennent « Joueur #… ».
    const cols = this.sql.exec('PRAGMA table_info(players)').toArray() as { name: string }[];
    if (!cols.some((c) => c.name === 'name_key')) {
      this.sql.exec('ALTER TABLE players ADD COLUMN name_key TEXT');
      const rows = this.sql.exec('SELECT rid, name FROM players WHERE name IS NOT NULL ORDER BY created ASC').toArray() as { rid: string; name: string }[];
      const seen = new Set<string>();
      for (const r of rows) {
        const k = nameKey(r.name);
        if (seen.has(k)) this.sql.exec('UPDATE players SET name = NULL WHERE rid = ?', r.rid);
        else {
          seen.add(k);
          this.sql.exec('UPDATE players SET name_key = ? WHERE rid = ?', k, r.rid);
        }
      }
    }
    this.sql.exec('CREATE UNIQUE INDEX IF NOT EXISTS players_name_key ON players (name_key) WHERE name_key IS NOT NULL');
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/rank/, '');
    try {
      if (request.method === 'GET' && path === '/board') return this.board(url.searchParams.get('period'), url.searchParams.get('rid'));
      if (request.method !== 'POST') return json({ error: 'not-found' }, 404);
      const body = (await request.json()) as Record<string, unknown>;
      if (path === '/pair') return this.pair(body);
      if (path === '/result') return this.result(body);
      if (path === '/name') return this.name(body);
      if (path === '/flag') return this.flag(body);
      return json({ error: 'not-found' }, 404);
    } catch {
      return json({ error: 'bad-request' }, 400);
    }
  }

  /** Vérifie le secret ; à la première venue, enregistre le joueur. */
  private async auth(body: Record<string, unknown>): Promise<string | null> {
    const rid = body.rid;
    const secret = body.secret;
    if (typeof rid !== 'string' || typeof secret !== 'string' || !ID.test(rid) || secret.length < 16 || secret.length > 128) return null;
    const h = await sha256(secret);
    const row = this.sql.exec('SELECT secret FROM players WHERE rid = ?', rid).toArray()[0] as { secret: string } | undefined;
    if (!row) {
      this.sql.exec('INSERT INTO players (rid, secret, created) VALUES (?, ?, ?)', rid, h, Date.now());
      return rid;
    }
    return row.secret === h ? rid : null;
  }

  private pair(body: Record<string, unknown>) {
    const { match, a, b } = body;
    if (typeof match !== 'string' || typeof a !== 'string' || typeof b !== 'string' || !ID.test(a) || !ID.test(b) || a === b) return json({ error: 'bad-pair' }, 400);
    this.sql.exec('INSERT OR IGNORE INTO pairs (match, a, b, at) VALUES (?, ?, ?, ?)', match, a, b, Date.now());
    return json({ ok: true });
  }

  private async result(body: Record<string, unknown>) {
    const rid = await this.auth(body);
    if (!rid) return json({ error: 'auth' }, 403);
    const { match, n, won } = body;
    if (typeof match !== 'string' || !Number.isInteger(n) || (n as number) < 1 || (n as number) > MAX_REMATCH || typeof won !== 'boolean') return json({ error: 'bad-result' }, 400);
    const pair = this.sql.exec('SELECT a, b FROM pairs WHERE match = ?', match).toArray()[0] as { a: string; b: string } | undefined;
    // Seulement pour un match que la file d'attente a vraiment organisé, entre ces deux joueurs-là.
    if (!pair || (pair.a !== rid && pair.b !== rid)) return json({ error: 'unknown-match' }, 404);
    this.sql.exec('INSERT OR IGNORE INTO reports (match, n, rid, won) VALUES (?, ?, ?, ?)', match, n, rid, won ? 1 : 0);
    const foe = pair.a === rid ? pair.b : pair.a;
    const other = this.sql.exec('SELECT won FROM reports WHERE match = ? AND n = ? AND rid = ?', match, n, foe).toArray()[0] as { won: number } | undefined;
    if (!other) return json({ ok: true, counted: false, waiting: true });
    const s = settle({ rid, won }, { rid: foe, won: other.won === 1 });
    if (!s) return json({ ok: true, counted: false });
    const now = Date.now();
    const day = dayKey(now);
    const already = (this.sql.exec('SELECT COUNT(*) AS c FROM wins WHERE winner = ? AND loser = ? AND day = ?', s.winner, s.loser, day).one() as { c: number }).c;
    if (already >= SAME_FOE_PER_DAY) return json({ ok: true, counted: false, capped: true });
    this.sql.exec('INSERT OR IGNORE INTO wins (match, n, winner, loser, day, week, at) VALUES (?, ?, ?, ?, ?, ?, ?)', match, n, s.winner, s.loser, day, weekKey(now), now);
    return json({ ok: true, counted: true, winner: s.winner === rid });
  }

  private async name(body: Record<string, unknown>) {
    const rid = await this.auth(body);
    if (!rid) return json({ error: 'auth' }, 403);
    const name = typeof body.name === 'string' ? tidyName(body.name) : '';
    if (!name || !nameAllowed(name)) return json({ error: 'name-refused' }, 422);
    const day = dayKey(Date.now());
    const p = this.sql.exec('SELECT name, name_day, name_changes FROM players WHERE rid = ?', rid).one() as { name: string | null; name_day: string | null; name_changes: number };
    if (p.name === name) return json({ ok: true, name });
    // Nom déjà porté par un autre joueur (en ignorant majuscules, accents, chiffres déguisés, espaces) : refusé.
    const key = nameKey(name);
    const owner = this.sql.exec('SELECT rid FROM players WHERE name_key = ? AND rid != ?', key, rid).toArray()[0];
    if (owner) return json({ error: 'name-taken' }, 409);
    const changes = p.name_day === day ? p.name_changes : 0;
    if (changes >= NAME_CHANGES_PER_DAY) return json({ error: 'too-many' }, 429);
    // Nouveau nom : les signalements de l'ancien ne comptent plus.
    this.sql.exec('UPDATE players SET name = ?, name_key = ?, hidden = 0, name_day = ?, name_changes = ? WHERE rid = ?', name, key, day, changes + 1, rid);
    this.sql.exec('DELETE FROM flags WHERE target = ?', rid);
    return json({ ok: true, name });
  }

  private async flag(body: Record<string, unknown>) {
    const rid = await this.auth(body);
    if (!rid) return json({ error: 'auth' }, 403);
    const target = body.target;
    if (typeof target !== 'string' || !ID.test(target) || target === rid) return json({ error: 'bad-flag' }, 400);
    const day = dayKey(Date.now());
    const me = this.sql.exec('SELECT flag_day, flags_sent FROM players WHERE rid = ?', rid).one() as { flag_day: string | null; flags_sent: number };
    const sent = me.flag_day === day ? me.flags_sent : 0;
    if (sent >= FLAGS_PER_DAY) return json({ error: 'too-many' }, 429);
    this.sql.exec('UPDATE players SET flag_day = ?, flags_sent = ? WHERE rid = ?', day, sent + 1, rid);
    this.sql.exec('INSERT OR IGNORE INTO flags (target, reporter, at) VALUES (?, ?, ?)', target, rid, Date.now());
    const c = (this.sql.exec('SELECT COUNT(*) AS c FROM flags WHERE target = ?', target).one() as { c: number }).c;
    if (c >= FLAGS_TO_HIDE) this.sql.exec('UPDATE players SET hidden = 1 WHERE rid = ?', target);
    return json({ ok: true });
  }

  private board(periodRaw: string | null, rid: string | null) {
    const period: Period = isPeriod(periodRaw) ? periodRaw : 'all';
    const now = Date.now();
    const where = period === 'day' ? 'WHERE w.day = ?' : period === 'week' ? 'WHERE w.week = ?' : '';
    const args = period === 'day' ? [dayKey(now)] : period === 'week' ? [weekKey(now)] : [];
    const rows = this.sql
      .exec(
        `SELECT w.winner AS rid, COUNT(*) AS wins, MAX(w.at) AS last, p.name AS name, p.hidden AS hidden
         FROM wins w LEFT JOIN players p ON p.rid = w.winner ${where}
         GROUP BY w.winner ORDER BY wins DESC, last ASC LIMIT ${TOP}`,
        ...args,
      )
      .toArray() as { rid: string; wins: number; name: string | null; hidden: number }[];
    const top = rows.map((r, i) => ({ rank: i + 1, id: r.rid, name: r.name && !r.hidden ? r.name : anonymousName(r.rid), wins: r.wins }));
    let me: { rank: number | null; wins: number } | null = null;
    if (rid && ID.test(rid)) {
      const mine = (this.sql.exec(`SELECT COUNT(*) AS c FROM wins w ${where ? `${where} AND` : 'WHERE'} w.winner = ?`, ...args, rid).one() as { c: number }).c;
      if (mine === 0) me = { rank: null, wins: 0 };
      else {
        const better = (this.sql.exec(`SELECT COUNT(*) AS c FROM (SELECT w.winner, COUNT(*) AS n FROM wins w ${where} GROUP BY w.winner HAVING n > ?)`, ...args, mine).one() as { c: number }).c;
        me = { rank: better + 1, wins: mine };
      }
    }
    return json({ period, top, me });
  }
}
