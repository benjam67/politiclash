// Repères mesurés à la main sur les sprites (pose idle), en px de la texture optimisée,
// relatifs au point d'ancrage (x vers l'avant du perso, y au-dessus des pieds).
import type { FighterId } from './roster';
import assets from './assets.json';

const S = assets.fighterScale;

/** Joue visible (côté spectateur), là où s'accumulent les traces de main. */
export const CHEEK: Record<FighterId, { x: number; y: number }> = {
  // Bernard : joue gauche sous l'œil, source (515, 160) ; ancrage (650, 813).
  bernard: { x: Math.round((515 - 650) * S), y: Math.round((813 - 160) * S) },
  // Lola : joue gauche sous l'œil, source (368, 150) ; ancrage (454, 762).
  lola: { x: Math.round((368 - 454) * S), y: Math.round((762 - 150) * S) },
  // Jeux complets : joue estimée en retrait de l'avant du visage mesuré par `npm run assets`.
  aviateur: { x: assets.fighters.aviateur.face.x - 28, y: assets.fighters.aviateur.face.y - 8 },
  tailleur: { x: assets.fighters.tailleur.face.x - 28, y: assets.fighters.tailleur.face.y - 8 },
};
