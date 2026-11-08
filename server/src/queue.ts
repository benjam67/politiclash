// File d'attente de la Partie rapide : logique pure (sans réseau ni Cloudflare), testée à part.
//
// - On associe d'abord les deux joueurs qui attendent depuis le plus longtemps, en préférant la même région
//   (continent, d'après Cloudflare) : la latence entre eux sera plus faible. Au-delà de 20 s d'attente, on
//   accepte n'importe quelle région.
// - Deux jeux de versions différentes ne sont jamais associés (un réglage différent désynchroniserait tout).
// - Une association est d'abord proposée : chacun doit l'accepter dans les 10 s (le jeu accepte tout seul,
//   sauf pendant un match contre l'IA, où le joueur choisit). Si l'un refuse ou ne répond pas, il sort de la
//   file, et l'autre y retourne à sa place.

export const REGION_WAIT_MS = 20_000;
export const ACCEPT_MS = 10_000;

export interface Player {
  id: string;
  /** Version des règles du jeu. */
  v: string;
  /** Région (continent). */
  region: string;
  /** Pseudo tiré au hasard : un numéro dans la liste du jeu (jamais de texte libre). */
  pseudo: number;
}

interface Waiting extends Player {
  since: number;
}

export interface Proposal {
  id: string;
  a: Waiting;
  b: Waiting;
  until: number;
  accepted: Set<string>;
}

/** Ce que la file demande d'envoyer aux joueurs. */
export type QueueEvent =
  | { to: string; t: 'found'; match: string; foe: number; ttl: number }
  | { to: string; t: 'match'; match: string; role: 'host' | 'guest'; seed: number; foe: number }
  /** L'autre a refusé ou n'a pas répondu : on est remis dans la file, à sa place. */
  | { to: string; t: 'requeued' }
  /** On n'a pas accepté à temps (ou on a refusé) : on sort de la file. */
  | { to: string; t: 'dropped' };

export class MatchQueue {
  private waiting = new Map<string, Waiting>();
  private proposals = new Map<string, Proposal>();
  /** Joueur → association proposée en cours. */
  private pending = new Map<string, string>();
  private n = 0;

  constructor(
    private readonly rand: () => number = Math.random,
    private readonly makeId: () => string = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`,
  ) {}

  get searching() {
    return this.waiting.size + this.pending.size;
  }

  isWaiting(id: string) {
    return this.waiting.has(id) || this.pending.has(id);
  }

  /** Entre dans la file (rien si déjà dedans). */
  join(p: Player, now: number): QueueEvent[] {
    if (this.isWaiting(p.id)) return [];
    this.waiting.set(p.id, { ...p, since: now });
    return this.tick(now);
  }

  /** Sort de la file (annulation, départ, déconnexion). Si une association était proposée, l'autre y retourne. */
  leave(id: string, now: number): QueueEvent[] {
    this.waiting.delete(id);
    const pid = this.pending.get(id);
    if (!pid) return [];
    const pr = this.proposals.get(pid) as Proposal;
    const other = pr.a.id === id ? pr.b : pr.a;
    this.close(pr);
    this.waiting.set(other.id, other);
    return [{ to: other.id, t: 'requeued' }, ...this.tick(now)];
  }

  accept(id: string, match: string, now: number): QueueEvent[] {
    const pr = this.proposals.get(match);
    if (!pr || (pr.a.id !== id && pr.b.id !== id)) return [];
    pr.accepted.add(id);
    if (pr.accepted.size < 2) return [];
    this.close(pr);
    // Le joueur qui attend depuis le plus longtemps est l'hôte (gauche).
    const seed = Math.floor(this.rand() * 2 ** 31);
    const [host, guest] = pr.a.since <= pr.b.since ? [pr.a, pr.b] : [pr.b, pr.a];
    return [
      { to: host.id, t: 'match', match: pr.id, role: 'host', seed, foe: guest.pseudo },
      { to: guest.id, t: 'match', match: pr.id, role: 'guest', seed, foe: host.pseudo },
      ...this.tick(now),
    ];
  }

  decline(id: string, match: string, now: number): QueueEvent[] {
    const pr = this.proposals.get(match);
    if (!pr || (pr.a.id !== id && pr.b.id !== id)) return [];
    return this.refuse(pr, [id], now);
  }

  /** À appeler régulièrement : délais d'acceptation dépassés, et nouvelles associations. */
  tick(now: number): QueueEvent[] {
    const out: QueueEvent[] = [];
    for (const pr of [...this.proposals.values()]) {
      if (now >= pr.until) out.push(...this.refuse(pr, [pr.a.id, pr.b.id].filter((x) => !pr.accepted.has(x)), now, false));
    }
    // Les plus anciens d'abord.
    const list = [...this.waiting.values()].sort((x, y) => x.since - y.since);
    const taken = new Set<string>();
    for (const a of list) {
      if (taken.has(a.id)) continue;
      const others = list.filter((b) => b.id !== a.id && !taken.has(b.id) && b.v === a.v);
      if (!others.length) continue;
      const near = others.find((b) => b.region === a.region);
      const b = near ?? (now - a.since >= REGION_WAIT_MS ? others.find((x) => now - x.since >= REGION_WAIT_MS) ?? others[0] : others.find((x) => now - x.since >= REGION_WAIT_MS));
      if (!b) continue;
      taken.add(a.id);
      taken.add(b.id);
      this.n += 1;
      const pr: Proposal = { id: this.makeId(), a, b, until: now + ACCEPT_MS, accepted: new Set() };
      this.waiting.delete(a.id);
      this.waiting.delete(b.id);
      this.proposals.set(pr.id, pr);
      this.pending.set(a.id, pr.id);
      this.pending.set(b.id, pr.id);
      out.push({ to: a.id, t: 'found', match: pr.id, foe: b.pseudo, ttl: ACCEPT_MS / 1000 });
      out.push({ to: b.id, t: 'found', match: pr.id, foe: a.pseudo, ttl: ACCEPT_MS / 1000 });
    }
    return out;
  }

  /** Ceux qui refusent sortent ; les autres retournent dans la file, à leur place. */
  private refuse(pr: Proposal, refusers: string[], now: number, rematch = true): QueueEvent[] {
    this.close(pr);
    const out: QueueEvent[] = [];
    for (const p of [pr.a, pr.b]) {
      if (refusers.includes(p.id)) out.push({ to: p.id, t: 'dropped' });
      else {
        this.waiting.set(p.id, p);
        out.push({ to: p.id, t: 'requeued' });
      }
    }
    return rematch ? [...out, ...this.tick(now)] : out;
  }

  private close(pr: Proposal) {
    this.proposals.delete(pr.id);
    this.pending.delete(pr.a.id);
    this.pending.delete(pr.b.id);
  }
}
