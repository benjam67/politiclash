// Caméra du combat (calcul pur) : elle suit le milieu entre les deux combattants
// et recule un peu sur les écrans étroits pour que les deux restent visibles.
import { ARENA } from '../config/balance';

export interface Camera {
  /** Centre de la vue, en px de l'écran logique depuis le bord gauche du niveau. */
  x: number;
  /** 1 = taille normale ; moins de 1 = vue reculée. */
  zoom: number;
}

/** Recul maximal possible pour une largeur de vue donnée (px logiques). */
export const minZoom = (viewW: number) => Math.min(1, viewW / (ARENA.maxSeparation + 2 * ARENA.wallMargin));

export function computeCamera(viewW: number, x0: number, x1: number, stageW: number): Camera {
  const sep = Math.abs(x1 - x0);
  const zoom = Math.min(1, viewW / (sep + 2 * ARENA.wallMargin));
  const half = viewW / (2 * zoom);
  const mid = (x0 + x1) / 2;
  const x = stageW <= 2 * half ? stageW / 2 : Math.min(stageW - half, Math.max(half, mid));
  return { x, zoom };
}
