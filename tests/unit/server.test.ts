import { afterEach, describe, expect, it, vi } from 'vitest';
import { serverUrl } from '../../src/config/server';
import { getIceServers, hasRelay, resetIceCache } from '../../src/net/ice';
import { linkOptionsFromUrl } from '../../src/net/peer';
import { handle, ICE_TTL_S, withoutPort53, type Env } from '../../server/src/index';

const ENV: Env = { ALLOWED_ORIGINS: 'https://benjam67.github.io,http://localhost:4173', TURN_KEY_ID: 'kid', TURN_KEY_API_TOKEN: 'secret' };
const GAME = 'https://benjam67.github.io';

/** Réponse de Cloudflare telle que la décrit sa documentation. */
const cloudflareAnswer = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    {
      urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turn:turn.cloudflare.com:3478?transport=tcp', 'turns:turn.cloudflare.com:5349?transport=tcp'],
      username: 'u',
      credential: 'c',
    },
  ],
};

const req = (path: string, init: RequestInit & { origin?: string } = {}) =>
  new Request(`https://france-bagarre.example.workers.dev${path}`, { ...init, headers: { ...(init.origin ? { origin: init.origin } : {}), ...(init.headers ?? {}) } });

describe('serveur (Worker)', () => {
  it('/health répond, et dit si le relais est configuré', async () => {
    const r = await handle(req('/health'), ENV);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, service: 'france-bagarre', turn: true });
    expect(await (await handle(req('/'), ENV)).json()).toMatchObject({ ok: true });
    const r2 = await handle(req('/health'), { ALLOWED_ORIGINS: '' });
    expect(await r2.json()).toMatchObject({ turn: false });
  });

  it('/ice : demande des accès à Cloudflare avec la clé, et les rend sans le port 53', async () => {
    const calls: [string, RequestInit][] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify(cloudflareAnswer), { status: 201 });
    }) as unknown as typeof fetch;
    const r = await handle(req('/ice', { method: 'POST', origin: GAME }), ENV, fake);
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBe(GAME);
    const body = (await r.json()) as { iceServers: { urls: string[] }[]; ttl: number };
    expect(body.ttl).toBe(ICE_TTL_S);
    expect(body.iceServers.flatMap((s) => s.urls).some((u) => /:53(\?|$)/.test(u))).toBe(false);
    expect(body.iceServers.flatMap((s) => s.urls)).toContain('turns:turn.cloudflare.com:5349?transport=tcp');
    expect(hasRelay(body.iceServers)).toBe(true);
    expect(calls[0][0]).toBe('https://rtc.live.cloudflare.com/v1/turn/keys/kid/credentials/generate-ice-servers');
    expect((calls[0][1].headers as Record<string, string>).authorization).toBe('Bearer secret');
    expect(JSON.parse(calls[0][1].body as string)).toEqual({ ttl: ICE_TTL_S });
    // La clé ne ressort jamais.
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('/ice refusé aux autres sites, et sans relais configuré', async () => {
    const never = (() => {
      throw new Error('ne doit pas appeler Cloudflare');
    }) as unknown as typeof fetch;
    expect((await handle(req('/ice', { method: 'POST', origin: 'https://ailleurs.example' }), ENV, never)).status).toBe(403);
    expect((await handle(req('/ice', { method: 'POST' }), ENV, never)).status).toBe(403);
    expect((await handle(req('/ice', { method: 'POST', origin: GAME }), { ALLOWED_ORIGINS: GAME }, never)).status).toBe(503);
  });

  it('/ice : Cloudflare en panne → 502 ; préflight CORS ; adresse inconnue → 404', async () => {
    const down = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch;
    expect((await handle(req('/ice', { method: 'POST', origin: GAME }), ENV, down)).status).toBe(502);
    const pre = await handle(req('/ice', { method: 'OPTIONS', origin: GAME }), ENV);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST');
    expect((await handle(req('/ice', { method: 'OPTIONS', origin: 'https://ailleurs.example' }), ENV)).status).toBe(403);
    expect((await handle(req('/nimporte'), ENV)).status).toBe(404);
  });

  it('retire les adresses du port 53, garde les autres', () => {
    expect(withoutPort53([{ urls: 'turn:x:53' }, { urls: ['turn:x:53?transport=udp', 'turn:x:3478', 'turns:x:5349'] }])).toEqual([{ urls: ['turn:x:3478', 'turns:x:5349'] }]);
  });
});

describe('côté jeu', () => {
  afterEach(() => {
    resetIceCache();
    vi.useRealTimers();
  });

  it('adresse du serveur : celle du jeu, ou celle de l’adresse de la page (essais)', () => {
    expect(serverUrl('?server=http://127.0.0.1:8787/')).toBe('http://127.0.0.1:8787');
    expect(serverUrl('?server=')).toBe('');
    expect(serverUrl('?server=&server=http://a')).toBe('http://a');
    expect(serverUrl('')).toBe('https://france-bagarre.ben-aub.workers.dev');
  });

  it('réglage du relais : automatique, ou toujours (`?relay=1`)', () => {
    expect(linkOptionsFromUrl('').relay).toBe('auto');
    expect(linkOptionsFromUrl('?relay=1').relay).toBe('only');
  });

  it('demande les accès une fois, les garde, et les redemande avant expiration', async () => {
    let n = 0;
    let t = 0;
    const fake = (async () => {
      n++;
      return new Response(JSON.stringify({ iceServers: cloudflareAnswer.iceServers, ttl: 3600 }), { status: 200 });
    }) as unknown as typeof fetch;
    const o = { fetchImpl: fake, base: 'https://srv', now: () => t };
    expect(hasRelay(await getIceServers(o))).toBe(true);
    t = 20 * 60 * 1000;
    await getIceServers(o);
    expect(n).toBe(1);
    // À moins de 30 min de l'expiration : nouvelle demande.
    t = 40 * 60 * 1000;
    await getIceServers(o);
    expect(n).toBe(2);
  });

  it('sans serveur, serveur en panne ou trop lent : pas de relais, sans erreur', async () => {
    expect(await getIceServers({ base: '' })).toBeNull();
    const down = (async () => new Response('x', { status: 503 })) as unknown as typeof fetch;
    expect(await getIceServers({ base: 'https://srv', fetchImpl: down })).toBeNull();
    const broken = (async () => {
      throw new TypeError('réseau');
    }) as unknown as typeof fetch;
    expect(await getIceServers({ base: 'https://srv', fetchImpl: broken })).toBeNull();
    const slow = ((_: string, init: RequestInit) =>
      new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new Error('abandon'))))) as unknown as typeof fetch;
    expect(await getIceServers({ base: 'https://srv', fetchImpl: slow, timeoutMs: 50 })).toBeNull();
  });
});
