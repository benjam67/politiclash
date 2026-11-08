// Serveur de France Bagarre (Cloudflare Worker).
//   GET  / et /health → état du serveur
//   POST /ice         → accès temporaires au relais (phase 7c)
//   GET  /queue       → WebSocket de la file d'attente de la Partie rapide (phase 7d), tenue par un Durable Object
//   /rank/…           → classement (résultats, nom, signalement, tableau), tenu par un autre Durable Object
//   POST /stats/match, /stats/campaign → fiches anonymes de fin de match et de campagne (statistiques de jeu)
//   GET  /stats/data?key=…&days=N      → totaux par jour, pour la page privée des statistiques (clé STATS_KEY)
import { corsFor, handle, type Env } from './http';
import { sameKey } from './stats';

export { QueueDO } from './queueDO';
export { RankDO } from './rankDO';
export { StatsDO } from './statsDO';

async function deviceTag(ip: string): Promise<string> {
  // Empreinte de l'adresse IP, pour la limite d'usage seulement (gardée une minute en mémoire, jamais enregistrée).
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`stats:${ip}`));
  return [...new Uint8Array(d).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/queue') {
      // Seulement depuis les pages du jeu.
      if (!corsFor(request, env)) return new Response('origin', { status: 403 });
      if (!env.QUEUE) return new Response('queue-not-configured', { status: 503 });
      const cf = (request as unknown as { cf?: { continent?: string } }).cf;
      const headers = new Headers(request.headers);
      headers.set('x-region', cf?.continent ?? 'XX');
      const stub = env.QUEUE.get(env.QUEUE.idFromName('global'));
      return stub.fetch(new Request(request, { headers }));
    }
    if (url.pathname.startsWith('/rank/') && url.pathname !== '/rank/pair') {
      const cors = corsFor(request, env);
      if (request.method === 'OPTIONS') return cors ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
      // Déclarer un résultat, changer de nom, signaler : seulement depuis les pages du jeu. Le tableau se lit librement.
      if (request.method !== 'GET' && !cors) return new Response('origin', { status: 403 });
      if (!env.RANK) return new Response('rank-not-configured', { status: 503 });
      const r = await env.RANK.get(env.RANK.idFromName('global')).fetch(request);
      const out = new Response(r.body, r);
      for (const [k, v] of Object.entries(cors ?? {})) out.headers.set(k, v);
      return out;
    }
    if (url.pathname.startsWith('/stats/')) {
      if (!env.STATS) return new Response('stats-not-configured', { status: 503 });
      const stub = env.STATS.get(env.STATS.idFromName('global'));
      if (request.method === 'GET' && url.pathname === '/stats/data') {
        // Lecture : avec la clé, depuis n'importe où (la page des statistiques est sur le site du jeu).
        const key = url.searchParams.get('key') ?? '';
        const cors = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
        if (!env.STATS_KEY || !sameKey(key, env.STATS_KEY)) return new Response('key', { status: 403, headers: cors });
        const r = await stub.fetch(request);
        const out = new Response(r.body, r);
        for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
        return out;
      }
      const cors = corsFor(request, env);
      if (request.method === 'OPTIONS') return cors ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
      // Fiches : seulement depuis les pages du jeu.
      if (request.method !== 'POST' || !cors) return new Response('origin', { status: 403 });
      const headers = new Headers(request.headers);
      headers.set('x-device', await deviceTag(request.headers.get('cf-connecting-ip') ?? '?'));
      const r = await stub.fetch(new Request(request, { headers }));
      const out = new Response(r.body, r);
      for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
      return out;
    }
    return handle(request, env);
  },
};
