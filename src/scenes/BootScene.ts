import Phaser from 'phaser';
import { HABITUES } from '../logic/layout';
import { loadFonts } from '../ui/theme';
import { bakeAll } from '../fx/bake';
import { FIGHTER_IDS, type FighterId } from '../config/roster';
import { STAGE_IDS, STAGES, type StageId } from '../config/stages';
import { fighterKey, POSE_FILES } from '../config/poses';
import type { FightData } from './FightScene';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const { width, height } = this.scale;
    const barW = Math.min(420, width * 0.5);
    const frame = this.add.rectangle(width / 2, height / 2, barW + 8, 26, 0x1a1020).setStrokeStyle(4, 0xfff7e8);
    const bar = this.add.rectangle(width / 2 - barW / 2, height / 2, 1, 18, 0xffc93c).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => (bar.width = Math.max(1, barW * p)));
    this.load.on('complete', () => {
      frame.destroy();
      bar.destroy();
    });

    this.load.setBaseURL(import.meta.env.BASE_URL);
    this.load.setPath('assets/');
    for (const id of STAGE_IDS) this.load.image(STAGES[id].image, STAGES[id].file);
    // Figurants du bar : le patron et les habitués.
    this.load.image('patron', 'stages/bar/patron.webp');
    for (const h of HABITUES) this.load.image(`habitue_${h}`, `stages/bar/habitues/${h}.webp`);
    for (const id of FIGHTER_IDS) {
      for (const pose of POSE_FILES) this.load.image(fighterKey(id, pose), `fighters/${id}/${pose}.webp`);
    }
  }

  async create() {
    await loadFonts();
    // Tous les textes à gros contour et les effets sont tracés une fois ici, jamais pendant le jeu.
    bakeAll(this);
    const q = new URLSearchParams(location.search);
    if (q.get('scene') === 'fight') this.scene.start('Fight', fightDataFromUrl(location.search));
    else this.scene.start('Title');
  }
}

/**
 * Accès direct au combat par l'URL (tests, essais) :
 * `?scene=fight&p1=bernard|lola&p2=bernard|lola&stage=bar`. Sans paramètre : écran d'accueil.
 */
export function fightDataFromUrl(search: string): FightData {
  const q = new URLSearchParams(search);
  const fighter = (v: string | null): FighterId | undefined => (FIGHTER_IDS as string[]).includes(v ?? '') ? (v as FighterId) : undefined;
  const st = q.get('stage');
  return {
    left: fighter(q.get('p1')),
    right: fighter(q.get('p2')),
    stage: (STAGE_IDS as string[]).includes(st ?? '') ? (st as StageId) : undefined,
  };
}
