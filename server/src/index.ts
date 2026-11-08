// Serveur de France Bagarre (Cloudflare Worker).
//   GET  / et /health → état du serveur
//   POST /ice         → accès temporaires au relais (phase 7c)
//   GET  /queue       → WebSocket de la file d'attente de la Partie rapide (phase 7d), tenue par un Durable Object
import { corsFor, handle, type Env } from './http';

export { QueueDO } from './queueDO';

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
    return handle(request, env);
  },
};
