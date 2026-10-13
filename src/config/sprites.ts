// Repères mesurés sur les sprites (pose idle), en px de la texture optimisée,
// relatifs au point d'ancrage (x vers l'avant du perso, y au-dessus des pieds).
import { FIGHTER_IDS, type FighterId } from './roster';
import assets from './assets.json';

/** Joue visible (côté spectateur), là où s'accumulent les traces de main : en retrait de l'avant du visage mesuré par `npm run assets`. */
export const CHEEK = Object.fromEntries(FIGHTER_IDS.map((id) => [id, { x: assets.fighters[id].face.x - 28, y: assets.fighters[id].face.y - 8 }])) as Record<FighterId, { x: number; y: number }>;
