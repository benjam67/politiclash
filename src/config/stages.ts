// Liste des niveaux (décors). Les noms affichés sont dans `texts.ts`,
// les images dans `raw/stages/<id>/` (puis `npm run assets`).
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
  /** Largeur du niveau, en écrans. Tant que le décor large n'est pas fourni, l'image est répétée sur les bords. */
  widthScreens: number;
  /** Le décor a des figurants animés au fond (patron et habitués du bar). */
  crowd: boolean;
}

export const STAGES = {
  bar: {
    image: 'stage_bar',
    file: 'stages/bar/decor.webp',
    width: assets.props.decor.width,
    height: assets.props.decor.height,
    floorY: 420,
    floorScreen: 0.56,
    widthScreens: 2,
    crowd: true,
  },
} satisfies Record<string, StageDef>;

export type StageId = keyof typeof STAGES;
export const STAGE_IDS = Object.keys(STAGES) as StageId[];
