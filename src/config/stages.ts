// Liste des niveaux (décors). Les noms affichés sont dans `texts.ts`,
// les images dans `raw/stages/<id>/` (puis `npm run assets`).
import type Phaser from 'phaser';
import assets from './assets.json';

export interface StageDef {
  /** Clé de texture et fichier du décor (dans `public/assets/`). */
  image: string;
  file: string;
  width: number;
  height: number;
  /** Ligne du sol (px dans l'image du décor) et position voulue à l'écran (fraction de hauteur). */
  floorY: number;
  floorScreen: number;
  /** Largeur du niveau, en écrans. Décor simple : l'image est répétée en miroir sur les bords. */
  widthScreens: number;
  /** Décor large : l'image couvre toute la largeur du niveau et défile, sans répétition visible. */
  wide: boolean;
  /** Le décor a des figurants animés au fond (patron et habitués du bar). */
  crowd: boolean;
}

export const STAGES = {
  bar: {
    image: 'stage_bar',
    file: 'stages/bar/decor.webp',
    width: assets.stages.bar.width,
    height: assets.stages.bar.height,
    floorY: 420,
    floorScreen: 0.56,
    widthScreens: 2,
    wide: false,
    crowd: true,
  },
  // Décors larges (environ 3 × 1) : le sol commence bas dans l'image (≈ 75 %), on le garde là
  // plutôt que de couper le haut (drapeau, statue). Largeur du niveau : celle de l'image à l'écran.
  elysee: {
    image: 'stage_elysee',
    file: 'stages/elysee/decor.webp',
    width: assets.stages.elysee.width,
    height: assets.stages.elysee.height,
    floorY: Math.round(assets.stages.elysee.height * 0.749),
    floorScreen: 0.749,
    widthScreens: 1.35,
    wide: true,
    crowd: false,
  },
  republique: {
    image: 'stage_republique',
    file: 'stages/republique/decor.webp',
    width: assets.stages.republique.width,
    height: assets.stages.republique.height,
    floorY: Math.round(assets.stages.republique.height * 0.786),
    floorScreen: 0.786,
    widthScreens: 1.35,
    wide: true,
    crowd: false,
  },
  assemblee: {
    image: 'stage_assemblee',
    file: 'stages/assemblee/decor.webp',
    width: assets.stages.assemblee.width,
    height: assets.stages.assemblee.height,
    floorY: Math.round(assets.stages.assemblee.height * 0.719),
    floorScreen: 0.719,
    widthScreens: 1.35,
    wide: true,
    crowd: false,
  },
  bastille: {
    image: 'stage_bastille',
    file: 'stages/bastille/decor.webp',
    width: assets.stages.bastille.width,
    height: assets.stages.bastille.height,
    floorY: Math.round(assets.stages.bastille.height * 0.699),
    floorScreen: 0.699,
    widthScreens: 1.35,
    wide: true,
    crowd: false,
  },
} satisfies Record<string, StageDef>;

export type StageId = keyof typeof STAGES;
export const STAGE_IDS = Object.keys(STAGES) as StageId[];

/**
 * Décors larges : chargés à la demande (écran du choix du lieu, ou combat lancé directement),
 * pour garder le chargement initial léger. L'Élysée, fond des menus, est chargé au démarrage avec le bar.
 */
export function queueStageImages(scene: Phaser.Scene, only?: StageId) {
  const ids = only ? [only] : STAGE_IDS;
  scene.load.setBaseURL(import.meta.env.BASE_URL);
  scene.load.setPath('assets/');
  for (const id of ids) {
    const st = STAGES[id];
    if (!scene.textures.exists(st.image)) scene.load.image(st.image, st.file);
  }
}
