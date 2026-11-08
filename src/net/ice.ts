// Accès au relais (TURN), demandés au serveur du jeu. Gardés en mémoire jusqu'à peu avant leur expiration.
// Si le serveur ne répond pas, on continue sans relais : la connexion directe marche dans la plupart des cas.
import { serverUrl } from '../config/server';

export interface IceConfig {
  iceServers: RTCIceServer[];
  /** Fin de validité (ms, horloge du téléphone). */
  until: number;
}

let cached: IceConfig | null = null;

/** Marge avant expiration : un match commencé doit pouvoir finir avec les mêmes accès. */
const MARGIN_MS = 30 * 60 * 1000;

export async function getIceServers(opts: { timeoutMs?: number; fetchImpl?: typeof fetch; now?: () => number; base?: string } = {}): Promise<RTCIceServer[] | null> {
  const now = opts.now ?? Date.now;
  if (cached && cached.until - MARGIN_MS > now()) return cached.iceServers;
  const base = opts.base ?? serverUrl();
  if (!base) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 4000);
  try {
    const r = await (opts.fetchImpl ?? fetch)(`${base}/ice`, { method: 'POST', signal: ctrl.signal });
    if (!r.ok) return null;
    const data = (await r.json()) as { iceServers?: RTCIceServer[]; ttl?: number };
    if (!Array.isArray(data.iceServers) || !data.iceServers.length) return null;
    cached = { iceServers: data.iceServers, until: now() + (data.ttl ?? 3600) * 1000 };
    return cached.iceServers;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Pour les tests. */
export function resetIceCache() {
  cached = null;
}

/** Vrai si la liste contient au moins un relais. */
export const hasRelay = (servers: RTCIceServer[] | null) =>
  !!servers?.some((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => /^turns?:/.test(u)));
