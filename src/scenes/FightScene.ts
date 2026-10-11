import Phaser from 'phaser';
import { MATCH, STAGE } from '../config/balance';
import { FIGHTER_IDS, spriteOf, type FighterId } from '../config/roster';
import { STAGES, type StageId } from '../config/stages';
import { FIGHTER_TEXTS } from '../config/texts';
import { fighterKey, poseFor, type Action } from '../config/poses';
import { computeLayout, HABITUES, type StageLayout } from '../logic/layout';
import { sfx } from '../audio/sfx';
import { Fx } from '../fx/Fx';
import { Crowd } from '../fx/Crowd';
import { HealthBar } from '../ui/HealthBar';
import { RoundPips, TimerDiamond } from '../ui/hud';
import { safeInsets } from '../ui/safe';

export type Side = 'left' | 'right';

export interface FightData {
  /** Combattant de gauche (joueur 1) et de droite. Par défaut : les deux premiers de la liste. */
  left?: FighterId;
  right?: FighterId;
  stage?: StageId;
}

interface Fighter {
  side: Side;
  id: FighterId;
  sprite: Phaser.GameObjects.Image;
  bar: HealthBar;
  pips: RoundPips;
  action: Action;
}

/**
 * Scène de combat. Phase 0 : scène statique (décor, figurants, deux combattants, interface).
 * À partir de la phase 1, elle lit l'état de la simulation et l'affiche ; elle ne décide de rien.
 */
export class FightScene extends Phaser.Scene {
  private decor!: Phaser.GameObjects.Image;
  private patron: Phaser.GameObjects.Image | null = null;
  private crowdImgs: Phaser.GameObjects.Image[] = [];
  private crowd: Crowd | null = null;
  private f!: Record<Side, Fighter>;
  private timer!: TimerDiamond;
  private soundBtn!: Phaser.GameObjects.Image;
  private homeBtn!: Phaser.GameObjects.Image;
  private fx!: Fx;
  layout!: StageLayout;

  private ids: Record<Side, FighterId> = { left: 'bernard', right: 'lola' };
  private stageId: StageId = 'bar';

  constructor() {
    super('Fight');
  }

  init(data: FightData) {
    const left = data.left ?? FIGHTER_IDS[0];
    this.ids = { left, right: data.right ?? FIGHTER_IDS.find((id) => id !== left) ?? left };
    this.stageId = data.stage ?? 'bar';
    this.crowd = null;
    this.patron = null;
    this.crowdImgs = [];
  }

  create() {
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    const stage = STAGES[this.stageId];

    this.decor = this.add.image(0, 0, stage.image).setOrigin(0, 0);
    if (stage.crowd) {
      this.crowdImgs = HABITUES.map((id) => this.add.image(0, 0, `habitue_${id}`).setOrigin(0.5, 1).setTint(STAGE.crowdTint));
      this.patron = this.add.image(0, 0, 'patron').setOrigin(0.5, 1).setTint(STAGE.patronTint);
      this.crowd = new Crowd(this, this.crowdImgs, this.patron);
    }

    this.f = { left: this.makeFighter('left', this.ids.left), right: this.makeFighter('right', this.ids.right) };

    this.fx = new Fx(this);
    this.timer = new TimerDiamond(this).setDepth(100);
    this.timer.set(MATCH.roundTimeS, 1);

    this.soundBtn = this.add
      .image(0, 0, sfx.muted ? 'ico_sound_off' : 'ico_sound_on')
      .setDepth(110)
      .setInteractive({ useHandCursor: true });
    this.soundBtn.on('pointerup', () => {
      sfx.unlock();
      sfx.setMuted(!sfx.muted);
      this.soundBtn.setTexture(sfx.muted ? 'ico_sound_off' : 'ico_sound_on');
      if (!sfx.muted) sfx.startMusic();
    });
    this.homeBtn = this.add.image(0, 0, 'ico_home').setDepth(110).setInteractive({ useHandCursor: true });
    this.homeBtn.on('pointerup', () => this.scene.start('Title'));

    this.applyLayout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.applyLayout, this));

    // Le son ne peut démarrer qu'après un geste de l'utilisateur.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => {
      sfx.unlock();
      sfx.startMusic();
    });

    if (window.__slap) {
      window.__slap.ready = true;
      window.__slap.scene = 'Fight';
    }
    this.publish();
  }

  update(time: number) {
    this.crowd?.update(time);
  }

  // ── Construction et placement ──────────────────────────────────────────

  private makeFighter(side: Side, id: FighterId): Fighter {
    const a = spriteOf(id);
    const flip = side === 'right';
    // Phaser retourne la texture dans son cadre sans bouger l'origine :
    // pour un perso en miroir, l'ancrage (entre les pieds) passe à 1 - originX.
    const sprite = this.add
      .image(0, 0, fighterKey(id, poseFor(id, 'idle').pose))
      .setFlipX(flip)
      .setOrigin(flip ? 1 - a.originX : a.originX, a.originY)
      .setDepth(10);
    // Combat miroir : le second porte une teinte pour qu'on les distingue.
    if (side === 'right' && this.ids.left === this.ids.right) sprite.setTint(0x9fc4ff);
    const t = FIGHTER_TEXTS[id];
    const bar = new HealthBar(this, side, t.name, t.katakana).setDepth(100);
    const pips = new RoundPips(this, side, MATCH.roundsToWin).setDepth(100);
    return { side, id, sprite, bar, pips, action: 'idle' };
  }

  /** Affiche l'image associée à une action (voir `config/poses.ts`). */
  setAction(side: Side, action: Action) {
    const fighter = this.f[side];
    fighter.action = action;
    fighter.sprite.setTexture(fighterKey(fighter.id, poseFor(fighter.id, action).pose));
    this.publish();
  }

  private applyLayout() {
    const { width, height } = this.scale;
    const L = computeLayout(width, height, this.ids.left, this.ids.right, this.stageId);
    this.layout = L;
    this.cameras.main.setSize(width, height);

    this.decor.setPosition(L.decor.x, L.decor.y).setScale(L.decor.scale);
    this.patron?.setPosition(L.patron.x, L.patron.y).setScale(L.patron.scale);
    L.crowd.forEach((c, i) => this.crowdImgs[i]?.setPosition(c.x, c.y).setScale(c.scale));
    this.crowd?.layout();
    for (const side of ['left', 'right'] as const) {
      const p = L[side];
      this.f[side].sprite.setPosition(p.x, p.y).setScale(p.scale);
    }

    // Interface : barres en haut, chrono au centre, losanges des rounds sous les barres.
    // Encoche et barre d'accueil (iPhone) : l'interface reste dans la zone sûre, la même marge des deux
    // côtés pour rester symétrique.
    const safe = safeInsets(this);
    const side = Math.max(safe.left, safe.right);
    const margin = 22 + side;
    const centerGap = 64;
    const barW = width / 2 - margin - centerGap;
    this.f.left.bar.layout(margin, 16, barW);
    this.f.right.bar.layout(width - margin, 16, barW);
    this.f.left.bar.setValue(1, true);
    this.f.right.bar.setValue(1, true);
    this.f.left.pips.setPosition(width / 2 - centerGap - 20, 66);
    this.f.right.pips.setPosition(width / 2 + centerGap + 20, 66);
    this.timer.setPosition(width / 2, 48);
    this.soundBtn.setPosition(width - 44 - side, 120);
    this.homeBtn.setPosition(44 + side, 120);
    this.fx.layout(width, height);

    if (window.__slap) window.__slap.layout = L;
  }

  // ── État visible par les tests ─────────────────────────────────────────

  private publish() {
    if (!window.__slap) return;
    window.__slap.state = {
      mode: 'fight',
      ids: { ...this.ids },
      stage: this.stageId,
      hp: { left: MATCH.hp, right: MATCH.hp },
      action: { left: this.f.left.action, right: this.f.right.action },
      timeLeft: MATCH.roundTimeS,
    };
  }
}
