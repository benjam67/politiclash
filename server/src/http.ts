// Serveur de France Bagarre (Cloudflare Worker) : les adresses HTTP.
//
// Phase 7c : il fournit au jeu des accès temporaires au relais (TURN) de Cloudflare. La clé du relais
// reste ici, côté serveur : le jeu ne reçoit qu'un identifiant valable quelques heures.
// Phase 7d : la file d'attente de la Partie rapide viendra s'ajouter ici.
//
//   GET  /health  → état du serveur (et si le relais est configuré) ; / répond de même
//   POST /ice     → { iceServers } à donner à WebRTC (STUN + relais), pour les pages autorisées

export interface Env {
  ALLOWED_ORIGINS: string;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
  /** Essais en local seulement : liste de serveurs ICE à rendre telle quelle (relais local), au lieu de Cloudflare. */
  TEST_ICE?: string;
  /** File d'attente (Durable Object). Type minimal, pour que ce fichier se compile aussi avec le jeu (tests). */
  QUEUE?: { idFromName(name: string): unknown; get(id: unknown): { fetch(r: Request): Promise<Response> } };
  RANK?: { idFromName(name: string): unknown; get(id: unknown): { fetch(r: Request): Promise<Response> } };
  STATS?: { idFromName(name: string): unknown; get(id: unknown): { fetch(r: Request): Promise<Response> } };
  /** Clé de la page privée des statistiques (secret Cloudflare). */
  STATS_KEY?: string;
}

/** Durée de validité des accès au relais : largement de quoi finir une soirée de revanches. */
export const ICE_TTL_S = 4 * 3600;
export const SERVICE = 'france-bagarre';

type IceServer = { urls: string | string[]; username?: string; credential?: string };

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export function corsFor(request: Request, env: Env): Record<string, string> | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  if (!allowed.includes(origin)) return null;
  return { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' };
}

/**
 * Le port 53 est bloqué par les navigateurs : une adresse de relais sur ce port ferait attendre la connexion
 * jusqu'à son délai d'abandon. On la retire.
 */
export function withoutPort53(servers: IceServer[]): IceServer[] {
  return servers.map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)) })).filter((s) => (s.urls as string[]).length > 0);
}

export async function handle(request: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  const cors = corsFor(request, env);
  if (request.method === 'OPTIONS') return cors ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });

  // La page d'accueil répond comme /health (quelqu'un qui ouvre l'adresse dans un navigateur voit que tout va bien).
  if ((url.pathname === '/health' || url.pathname === '/') && request.method === 'GET') {
    return json({ ok: true, service: SERVICE, turn: !!(env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN) }, 200, cors ?? {});
  }

  if (url.pathname === '/ice' && request.method === 'POST') {
    // Seulement pour les pages du jeu : sinon n'importe quel site pourrait se servir du relais.
    if (!cors) return json({ error: 'origin' }, 403);
    if (env.TEST_ICE) return json({ iceServers: JSON.parse(env.TEST_ICE), ttl: ICE_TTL_S }, 200, cors);
    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return json({ error: 'turn-not-configured' }, 503, cors);
    const r = await fetchImpl(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: ICE_TTL_S }),
    });
    if (!r.ok) return json({ error: 'turn-unavailable', status: r.status }, 502, cors);
    const data = (await r.json()) as { iceServers?: IceServer | IceServer[] };
    const list = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
    return json({ iceServers: withoutPort53(list), ttl: ICE_TTL_S }, 200, cors);
  }

  return json({ error: 'not-found' }, 404, cors ?? {});
}

