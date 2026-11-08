// Serveur de France Bagarre (Cloudflare Worker).
//   GET  / et /health → état du serveur
//   POST /ice         → accès temporaires au relais (phase 7c)
//   GET  /queue       → WebSocket de la file d'attente de la Partie rapide (phase 7d), tenue par un Durable Object
//   /rank/…           → classement (résultats, nom, signalement, tableau), tenu par un autre Durable Object
import { corsFor, handle, type Env } from './http';

export { QueueDO } from './queueDO';
export { RankDO } from './rankDO';

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
    return handle(request, env);
  },
};
