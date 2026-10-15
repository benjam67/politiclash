import Phaser from 'phaser';
import { menuBackdrop } from '../ui/backdrop';
import { fighterKey } from '../config/poses';
import { spriteOf } from '../config/roster';
import { CAMPAIGN_TEXTS, FIGHTER_TEXTS } from '../config/texts';
import type { Campaign } from '../logic/campaign';
import { computeLayout } from '../logic/layout';
import { sfx } from '../audio/sfx';
import { makeButton } from '../ui/button';
import { safeInsets } from '../ui/safe';
import { COLORS, CSS, FONT_TITLE, FONT_UI, FLAG, FLAG_CSS, flagBand } from '../ui/theme';
import { queueFighterImages } from './BootScene';

export interface PresidentData {
  campaign: Campaign;
}

/**
 * Grande scène finale de la campagne : le candidat a battu tous ses rivaux, il entre à l'Élysée.
 * Pluie de confettis tricolores, rivaux vaincus en rang sur le côté, premier discours.
 */
export class PresidentScene extends Phaser.Scene {
  private items: Phaser.GameObjects.GameObject[] = [];
  private c!: Campaign;
  private speech = '';

  constructor() {
    super('President');
  }

  init(data: PresidentData) {
    this.items = [];
    this.c = data.campaign;
    const lines = CAMPAIGN_TEXTS.speeches;
    this.speech = lines[Math.floor(Math.random() * lines.length)];
  }

  preload() {
    // La pose de victoire du nouveau président (déjà chargée s'il vient de combattre).
    queueFighterImages(this, [this.c.fighter]);
  }

  create() {
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    this.build();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.build, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.build, this));
    sfx.powerUp();
    sfx.crowd(1, 3.5);
    this.time.delayedCall(1800, () => sfx.crowd(0.8, 2.5));
    if (window.__slap) {
      window.__slap.ready = true;
      window.__slap.scene = 'President';
      window.__slap.state = { mode: 'president', fighter: this.c.fighter, retries: this.c.retries };
    }
  }

  private build() {
    for (const o of this.items) o.destroy();
    this.items = [];
    this.tweens.killAll();
    const { width, height } = this.scale;
    const L = computeLayout(width, height);
    const safe = safeInsets(this);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.items.push(o), o);
    const c = this.c;
    const t = FIGHTER_TEXTS[c.fighter];
    const s = L.fighterScale;

    // L'Élysée, à peine assombri : c'est la fête.
    add(menuBackdrop(this, 0xe4dcea));
    add(this.add.rectangle(0, 0, width, height, COLORS.ink, 0.18).setOrigin(0));

    // Les rivaux vaincus, en rang à gauche, gris et tournés vers le vainqueur.
    const n = c.order.length;
    c.order.forEach((id, i) => {
      const a = spriteOf(id);
      add(
        this.add
          .image(width * (0.05 + (0.26 * i) / Math.max(1, n - 1)), height * 0.99, fighterKey(id, 'idle'))
          .setOrigin(a.originX, a.originY)
          .setScale(s * 0.5)
          .setTint(0x8f879a)
          .setDepth(1),
      );
    });

    // Le nouveau président, au centre, qui sautille de joie.
    const a = spriteOf(c.fighter);
    const hero = add(
      this.add
        .image(width / 2, height * 0.99, fighterKey(c.fighter, 'victory'))
        .setOrigin(a.originX, a.originY)
        .setScale(s * 0.95)
        .setDepth(2)
        .setName('president-hero'),
    );
    this.tweens.add({ targets: hero, y: hero.y - 14, scaleY: s * 0.975, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Titre sur deux lignes : « MANU EST ÉLU » / « PRÉSIDENT DE LA RÉPUBLIQUE ! ».
    const [band, ...stripes] = flagBand(this, width / 2, height * 0.17, width * 1.3, 170, -4).reverse().map(add);
    stripes.forEach((o) => o.setDepth(3));
    band.setDepth(3);
    const title = add(
      this.add
        .text(width / 2, height * 0.13, CAMPAIGN_TEXTS.finalTitle(t.short.toUpperCase(), t.elected), { fontFamily: FONT_TITLE, fontSize: '64px', color: FLAG_CSS.white, stroke: CSS.ink, strokeThickness: 13 })
        .setOrigin(0.5)
        .setAngle(-4)
        .setDepth(4)
        .setName('president-title'),
    );
    if (title.width > width * 0.7) title.setScale((width * 0.7) / title.width);
    const sub = add(
      this.add
        .text(width / 2, height * 0.23, CAMPAIGN_TEXTS.finalSub(t.elected), { fontFamily: FONT_TITLE, fontSize: '40px', color: CSS.cream, stroke: CSS.ink, strokeThickness: 10 })
        .setOrigin(0.5)
        .setAngle(-4)
        .setDepth(4)
        .setName('president-sub'),
    );
    if (sub.width > width * 0.7) sub.setScale((width * 0.7) / sub.width);
    this.tweens.add({ targets: [title, sub], scale: '*=1.04', duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Premier discours et bilan de la campagne, à gauche, au-dessus des rivaux.
    add(
      this.add
        .text(width * 0.19 + Math.max(safe.left, safe.right) / 2, height * 0.42, this.speech, { fontFamily: FONT_UI, fontStyle: '800', fontSize: '23px', color: FLAG_CSS.white, stroke: CSS.ink, strokeThickness: 7, align: 'center', wordWrap: { width: width * 0.3 } })
        .setOrigin(0.5)
        .setDepth(4)
        .setName('president-speech'),
    );
    add(
      this.add
        .text(width * 0.19 + Math.max(safe.left, safe.right) / 2, height * 0.53, CAMPAIGN_TEXTS.finalStats(n, CAMPAIGN_TEXTS.retries(c.retries)), { fontFamily: FONT_UI, fontStyle: '800', fontSize: '19px', color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 })
        .setOrigin(0.5)
        .setDepth(4)
        .setName('president-stats'),
    );

    // Boutons à droite, loin du vainqueur.
    const bx = width * 0.83 - Math.max(safe.left, safe.right) / 2;
    add(makeButton(this, bx, height * 0.6, CAMPAIGN_TEXTS.newCampaign, FLAG.blue, () => this.scene.start('CharacterSelect', { mode: 'campaign', left: c.fighter }), { w: 300, h: 70, font: 26 }).setDepth(6).setName('btn-new-campaign'));
    add(makeButton(this, bx, height * 0.6 + 86, CAMPAIGN_TEXTS.home, FLAG.white, () => this.scene.start('Title'), { w: 240, h: 56, font: 22 }).setDepth(6).setName('btn-home'));

    this.confetti(width, height, add);
  }

  /** Pluie de confettis bleus, blancs, rouges (et quelques dorés), qui tombe sans fin. */
  private confetti(width: number, height: number, add: <T extends Phaser.GameObjects.GameObject>(o: T) => T) {
    const colors = [FLAG.blue, FLAG.white, FLAG.red, FLAG.blue, FLAG.white, FLAG.red, COLORS.yellow];
    for (let i = 0; i < 90; i++) {
      const w = Phaser.Math.Between(8, 16);
      const piece = add(this.add.rectangle(Phaser.Math.Between(0, width), Phaser.Math.Between(-height, 0), w, w * 0.55, colors[i % colors.length]).setDepth(5));
      piece.setAngle(Phaser.Math.Between(0, 360));
      const fall = () => {
        piece.setPosition(Phaser.Math.Between(0, width), -20);
        this.tweens.add({
          targets: piece,
          y: height + 20,
          x: piece.x + Phaser.Math.Between(-120, 120),
          angle: piece.angle + Phaser.Math.Between(-540, 540),
          duration: Phaser.Math.Between(2600, 5200),
          ease: 'Sine.easeIn',
          onComplete: fall,
        });
      };
      // Départ échelonné : les premiers confettis sont déjà en l'air.
      this.tweens.add({
        targets: piece,
        y: height + 20,
        angle: piece.angle + Phaser.Math.Between(-360, 360),
        duration: Phaser.Math.Between(1800, 5200),
        ease: 'Sine.easeIn',
        onComplete: fall,
      });
    }
  }
}
