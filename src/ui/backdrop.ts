import type Phaser from 'phaser';
import { STAGES } from '../config/stages';

/** Décor des menus (accueil, choix du personnage, du lieu, salon en ligne) : l'Élysée. */
export const MENU_STAGE = STAGES.elysee;

/**
 * Pose le décor des menus pour qu'il couvre tout l'écran, centré, sans déformation, assombri par `tint`.
 * Le décor de l'Élysée est très large : on le cale sur la hauteur et on coupe les bords.
 */
export function menuBackdrop(scene: Phaser.Scene, tint: number) {
  const { width, height } = scene.scale;
  const s = Math.max(width / MENU_STAGE.width, height / MENU_STAGE.height);
  return scene.add.image(width / 2, height / 2, MENU_STAGE.image).setScale(s).setTint(tint).setName('menu-backdrop');
}
