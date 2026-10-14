import Phaser from 'phaser';
import type { AiLevel } from '../ai/ai';
import type { FighterId } from '../config/roster';
import { queueStageImages, STAGE_IDS, STAGES, type StageId } from '../config/stages';
import { STAGE_TEXTS } from '../config/texts';
import { computeLayout } from '../logic/layout';
import { sfx } from '../audio/sfx';
import { makeButton } from '../ui/button';
import { makeCard } from '../ui/card';
import { safeInsets } from '../ui/safe';
import { COLORS, CSS, FONT_TITLE } from '../ui/theme';
import type { FightData } from './FightScene';
import { loadSave, updateSave } from '../logic/save';

export interface StageSelectData {
  left: FighterId;
  right: FighterId;
  level: AiLevel;
}

/** Nombre de cases de la grille : celles sans niveau affichent « Bientôt ». */
// Grille de 3 × 2 lieux.
const COLS = 3;
const SLOTS = 6;

/** Choix du niveau : une vignette par décor disponible, et « Au hasard ». */
export class StageSelectScene extends Phaser.Scene {
  private items: Phaser.GameObjects.GameObject[] = [];
  private choice!: StageSelectData;

  constructor() {
    super('StageSelect');
  }

  preload() {
    queueStageImages(this);
  }

  init(data: StageSelectData) {
    this.items = [];
    this.choice = data;
  }

  create() {
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    this.build();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.build, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.build, this));
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => {
      sfx.unlock();
      sfx.startMusic();
    });
    if (window.__slap) {
      window.__slap.ready = true;
      window.__slap.scene = 'StageSelect';
      window.__slap.state = { mode: 'stage', ...this.choice, stages: STAGE_IDS };
    }
  }

  private build() {
    for (const o of this.items) o.destroy();
    this.items = [];
    const { width, height } = this.scale;
    const L = computeLayout(width, height);
    const safe = safeInsets(this);
    const side = Math.max(safe.left, safe.right);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.items.push(o), o);

    add(this.add.image(L.decor.x, L.decor.y, 'stage_bar').setOrigin(0, 0).setScale(L.decor.scale).setTint(0x6d6478));
    add(this.add.rectangle(0, 0, width, height, COLORS.ink, 0.45).setOrigin(0));
    add(this.add.rectangle(width / 2, 58, width * 1.3, 84, COLORS.red).setStrokeStyle(7, COLORS.ink).setAngle(-2));
    add(
      this.add
        .text(width / 2, 56, 'CHOISIS LE LIEU', { fontFamily: FONT_TITLE, fontSize: '46px', color: CSS.yellow, stroke: CSS.ink, strokeThickness: 10 })
        .setOrigin(0.5)
        .setAngle(-2)
        .setName('select-title'),
    );

    const cw = 236;
    const ch = 172;
    const gap = 18;
    const rows = SLOTS / COLS;
    const last = loadSave().lastStage;
    const top = 118;
    const y0 = top + ch / 2;
    const yLast = y0 + (rows - 1) * (ch + gap);
    for (let i = 0; i < SLOTS; i++) {
      const id = STAGE_IDS[i];
      const col = i % COLS;
      const x = width / 2 + (col - (COLS - 1) / 2) * (cw + gap);
      const y = y0 + Math.floor(i / COLS) * (ch + gap);
      if (id) {
        const st = STAGES[id];
        add(
          makeCard(this, x, y, `card-${id}`, {
            w: cw,
            h: ch,
            label: STAGE_TEXTS[id].name.toUpperCase(),
            image: { key: st.image, cx: st.width / 2, cy: st.floorY - st.height * 0.12, size: st.height * 0.62 },
            selected: id === last,
            onClick: () => this.start(id),
          }),
        );
      } else {
        add(makeCard(this, x, y, `card-soon-${i}`, { w: cw, h: ch, label: 'BIENTÔT', locked: true }));
      }
    }
    add(
      makeButton(this, width / 2, Math.min(yLast + ch / 2 + 56, height - safe.bottom - 40), 'AU HASARD', COLORS.cyan, () => this.start(STAGE_IDS[Math.floor(Math.random() * STAGE_IDS.length)]), { w: 260, h: 60, font: 24 }).setDepth(4),
    );
    add(
      makeButton(this, 96 + side, 58, '← RETOUR', COLORS.cream, () => this.scene.start('CharacterSelect', { left: this.choice.left, level: this.choice.level }), { w: 150, h: 46, font: 17 })
        .setDepth(6)
        .setName('btn-back'),
    );
  }

  private start(stage: StageId) {
    updateSave((sv) => ({ ...sv, lastStage: stage }));
    const data: FightData = { ...this.choice, stage, p2: 'ai' };
    this.scene.start('Fight', data);
  }
}
