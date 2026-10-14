import Phaser from 'phaser';
import { spriteOf, type FighterId } from '../config/roster';
import { STAGES, type StageId } from '../config/stages';
import { FIGHTER_TEXTS } from '../config/texts';
import { fighterKey } from '../config/poses';
import { computeLayout } from '../logic/layout';
import { sfx } from '../audio/sfx';
import { makeButton } from '../ui/button';
import { safeInsets } from '../ui/safe';
import { COLORS, CSS, FONT_TITLE } from '../ui/theme';
import type { FightData, FoeKind } from './FightScene';
import type { AiLevel } from '../ai/ai';
import { updateSave, withResult } from '../logic/save';

export interface ResultData {
  ids: [FighterId, FighterId];
  stage: StageId;
  winner: 0 | 1;
  wins: [number, number];
  p2: FoeKind;
  level: AiLevel;
  autoplay: boolean;
}

/** Écran de résultat : le vainqueur, le score en rounds, revanche ou retour à l'accueil. */
export class ResultScene extends Phaser.Scene {
  private items: Phaser.GameObjects.GameObject[] = [];
  private result!: ResultData;

  constructor() {
    super('Result');
  }

  init(data: ResultData) {
    this.result = data;
    this.items = [];
  }

  create() {
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    this.build();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.build, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.build, this));
    sfx.crowd(0.8, 1.6);
    // Victoires et défaites contre l'IA, gardées sur l'appareil (pas la démo).
    const r = this.result;
    if (r.p2 === 'ai' && !r.autoplay) updateSave((sv) => withResult(sv, r.level, r.winner === 0));
    if (window.__slap) {
      window.__slap.ready = true;
      window.__slap.scene = 'Result';
      window.__slap.state = { mode: 'result', winner: this.result.winner, wins: this.result.wins, ids: { left: this.result.ids[0], right: this.result.ids[1] } };
    }
  }

  private build() {
    for (const o of this.items) o.destroy();
    this.items = [];
    const { width, height } = this.scale;
    const r = this.result;
    const L = computeLayout(width, height, r.ids[0], r.ids[1], r.stage);
    const safe = safeInsets(this);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.items.push(o), o);

    add(this.add.image(L.decor.x, L.decor.y, STAGES[r.stage].image).setOrigin(0, 0).setScale(L.decor.scale).setTint(0x8a7f92));
    add(this.add.rectangle(0, 0, width, height, COLORS.ink, 0.4).setOrigin(0));

    // Le vainqueur en grand d'un côté, le perdant sonné de l'autre, chacun du côté où il combattait.
    const s = L.fighterScale * 1.15;
    const fighter = (i: 0 | 1) => {
      const id = r.ids[i];
      const won = i === r.winner;
      const a = spriteOf(id);
      const flip = i === 1;
      const img = this.add
        .image(width * (i === 0 ? 0.17 : 0.83), height * 0.98, fighterKey(id, won ? 'victory' : 'dazed'))
        .setFlipX(flip)
        .setOrigin(flip ? 1 - a.originX : a.originX, a.originY)
        .setScale(won ? s : s * 0.86)
        .setDepth(2);
      if (!won) img.setTint(0x9a8fa6);
      else if (r.ids[0] === r.ids[1] && i === 1) img.setTint(0x9fc4ff);
      add(img);
    };
    fighter(0);
    fighter(1);

    const band = add(this.add.rectangle(width / 2, height * 0.2, width * 1.3, 140, COLORS.red).setStrokeStyle(8, COLORS.ink).setAngle(-4));
    band.setDepth(1);
    const name = FIGHTER_TEXTS[r.ids[r.winner]].short.toUpperCase();
    const title = add(
      this.add
        .text(width / 2, height * 0.19, `VICTOIRE : ${name} !`, { fontFamily: FONT_TITLE, fontSize: '68px', color: CSS.yellow, stroke: CSS.ink, strokeThickness: 13 })
        .setOrigin(0.5)
        .setAngle(-4)
        .setDepth(3)
        .setName('result-title'),
    );
    const maxW = width * 0.6;
    if (title.width > maxW) title.setScale(maxW / title.width);
    add(
      this.add
        .text(width / 2, height * 0.38, `${r.wins[0]} – ${r.wins[1]}`, { fontFamily: FONT_TITLE, fontSize: '64px', color: CSS.cream, stroke: CSS.ink, strokeThickness: 12 })
        .setOrigin(0.5)
        .setDepth(3)
        .setName('result-score'),
    );

    const again: FightData = { left: r.ids[0], right: r.ids[1], stage: r.stage, p2: r.p2, level: r.level, autoplay: r.autoplay };
    const by = Math.min(height * 0.62, height - safe.bottom - 150);
    add(makeButton(this, width / 2, by, 'REVANCHE', COLORS.yellow, () => this.scene.start('Fight', again), { w: 320, h: 76, font: 34 }).setDepth(4));
    add(makeButton(this, width / 2 - 135, by + 92, 'AUTRE COMBAT', COLORS.cyan, () => this.scene.start('CharacterSelect', { left: r.ids[0], level: r.level }), { w: 250, h: 58, font: 22 }).setDepth(4));
    add(makeButton(this, width / 2 + 135, by + 92, 'ACCUEIL', COLORS.cream, () => this.scene.start('Title'), { w: 250, h: 58, font: 22 }).setDepth(4));
  }
}
