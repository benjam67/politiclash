// Faux tuyau réseau, pour les tests : latence, gigue (donc désordre), pertes et coupures, sur une horloge
// virtuelle. Chaque message passe par du JSON, comme sur le vrai réseau.
import { createRng } from '../logic/rng';

export interface PipeOptions {
  /** Latence d'un sens, ms. */
  latency: number;
  /** Variation aléatoire de la latence, ± ms : deux paquets proches peuvent arriver dans le désordre. */
  jitter?: number;
  /** Part des paquets perdus (0 à 1). */
  loss?: number;
  seed?: number;
}

export class FakePipe<T> {
  private queue: { at: number; data: string }[] = [];
  private rng: () => number;
  private cuts: [number, number][] = [];
  sent = 0;
  lost = 0;
  bytes = 0;

  constructor(private opts: PipeOptions) {
    this.rng = createRng(opts.seed ?? 1);
  }

  /** Plus rien ne passe entre `from` et `to` (ms). */
  cut(from: number, to: number) {
    this.cuts.push([from, to]);
  }

  send(now: number, msg: T) {
    this.sent += 1;
    const data = JSON.stringify(msg);
    this.bytes += data.length;
    if (this.cuts.some(([a, b]) => now >= a && now < b) || this.rng() < (this.opts.loss ?? 0)) {
      this.lost += 1;
      return;
    }
    const j = this.opts.jitter ?? 0;
    this.queue.push({ at: now + this.opts.latency + (this.rng() * 2 - 1) * j, data });
  }

  /** Messages arrivés à l'heure `now`, dans l'ordre d'arrivée. */
  deliver(now: number): T[] {
    const due = this.queue.filter((p) => p.at <= now).sort((a, b) => a.at - b.at);
    if (!due.length) return [];
    this.queue = this.queue.filter((p) => p.at > now);
    return due.map((p) => JSON.parse(p.data) as T);
  }
}
