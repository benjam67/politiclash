// Limites d'usage de la file d'attente (phase 7e) : logique pure, testée à part.
// Un appareil est reconnu par une empreinte de son adresse IP (calculée par le Worker, jamais enregistrée).

/** Connexions simultanées à la file par appareil (plusieurs onglets, une famille derrière la même box). */
export const MAX_CONNS_PER_DEVICE = 4;
/** Messages par connexion sur une fenêtre glissante de `WINDOW_MS` ; au-delà, la connexion est fermée. */
export const MAX_MSGS_PER_WINDOW = 30;
export const WINDOW_MS = 10_000;
/** Nouvelles connexions par appareil et par minute (un robot qui se reconnecte en boucle). */
export const MAX_OPENS_PER_MINUTE = 20;

export class DeviceLimits {
  private conns = new Map<string, number>();
  private opens = new Map<string, number[]>();

  /** Une connexion de plus pour cet appareil : refusée (false) au-delà des limites. */
  open(device: string, now: number): boolean {
    const recent = (this.opens.get(device) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= MAX_OPENS_PER_MINUTE || (this.conns.get(device) ?? 0) >= MAX_CONNS_PER_DEVICE) {
      this.opens.set(device, recent);
      return false;
    }
    recent.push(now);
    this.opens.set(device, recent);
    this.conns.set(device, (this.conns.get(device) ?? 0) + 1);
    return true;
  }

  close(device: string) {
    const n = (this.conns.get(device) ?? 0) - 1;
    if (n > 0) this.conns.set(device, n);
    else this.conns.delete(device);
  }

  /** Ménage des appareils sans connexion récente. */
  prune(now: number) {
    for (const [d, list] of this.opens) {
      const kept = list.filter((t) => now - t < 60_000);
      if (kept.length) this.opens.set(d, kept);
      else this.opens.delete(d);
    }
  }
}

/** Débit de messages d'une connexion. */
export class MessageRate {
  private times: number[] = [];

  /** Un message de plus : faux s'il dépasse la limite (la connexion doit être fermée). */
  hit(now: number): boolean {
    while (this.times.length && now - this.times[0] >= WINDOW_MS) this.times.shift();
    this.times.push(now);
    return this.times.length <= MAX_MSGS_PER_WINDOW;
  }
}
