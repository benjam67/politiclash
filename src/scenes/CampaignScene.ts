import Phaser from 'phaser';
import { menuBackdrop } from '../ui/backdrop';
import { levelLabel } from '../ai/ai';
import { fighterKey } from '../config/poses';
import { spriteOf, type FighterId } from '../config/roster';
import { STAGE_IDS } from '../config/stages';
import { CAMPAIGN_TEXTS, FIGHTER_TEXTS } from '../config/texts';
import { campaignFoe, campaignLevel, isFinalMatch, levelAt, type Campaign } from '../logic/campaign';
import { computeLayout } from '../logic/layout';
import { loadSave, updateSave, type Level } from '../logic/save';
import { sfx } from '../audio/sfx';
import { makeButton } from '../ui/button';
import { makeCard } from '../ui/card';
import { safeInsets } from '../ui/safe';
import { COLORS, CSS, FONT_TITLE, FONT_UI, FLAG, FLAG_CSS, flagBand } from '../ui/theme';
import { portraitOf } from './CharacterSelectScene';
import type { FightData } from './FightScene';

/** Couleur du niveau de l'IA, comme sur l'écran du choix de la difficulté. */
const LEVEL_COLOR: Record<Level, number> = { easy: FLAG.blue, normal: FLAG.white, hard: FLAG.red };

/**
 * Campagne présidentielle, écran « Prochain adversaire » : le candidat du joueur face au prochain rival,
 * le niveau de l'élection, et le parcours (rivaux battus, en cours, à venir). On y revient après chaque victoire.
 */
export class CampaignScene extends Phaser.Scene {
  private items: Phaser.GameObjects.GameObject[] = [];
  private c!: Campaign;
  private sure = false;
  private teaser = '';

  constructor() {
    super('Campaign');
  }

  init() {
    this.items = [];
    this.sure = false;
    const c = loadSave().campaign;
    if (!c) return;
    this.c = c;
    const foe = FIGHTER_TEXTS[campaignFoe(c)].name;
    const lines = CAMPAIGN_TEXTS.teasers;
    this.teaser = (isFinalMatch(c) ? CAMPAIGN_TEXTS.finalTeaser : lines[Math.floor(Math.random() * lines.length)]).replaceAll('{foe}', foe);
  }

  create() {
    // Pas de campagne en cours (sauvegarde effacée entre-temps) : retour à l'accueil.
    if (!loadSave().campaign) {
      this.scene.start('Title');
      return;
    }
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
      window.__slap.scene = 'Campaign';
      window.__slap.state = { mode: 'campaign', fighter: this.c.fighter, foe: campaignFoe(this.c), order: this.c.order, beaten: this.c.beaten, retries: this.c.retries, level: campaignLevel(this.c) };
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
    const c = this.c;
    const foe = campaignFoe(c);
    const level = campaignLevel(c);
    const cx = width / 2;

    add(menuBackdrop(this, 0x6d6478));
    add(this.add.rectangle(0, 0, width, height, COLORS.ink, 0.45).setOrigin(0));
    flagBand(this, cx, 58, width * 1.3, 84, -2).forEach(add);
    const title = add(
      this.add
        .text(cx, 56, CAMPAIGN_TEXTS.nextTitle, { fontFamily: FONT_TITLE, fontSize: '44px', color: FLAG_CSS.white, stroke: CSS.ink, strokeThickness: 10 })
        .setOrigin(0.5)
        .setAngle(-2)
        .setName('campaign-title'),
    );
    if (title.width > width * 0.62) title.setScale((width * 0.62) / title.width);

    // Le joueur à gauche, son prochain rival à droite (en miroir), comme au combat.
    const s = L.fighterScale * 1.05;
    const big = (id: FighterId, leftSide: boolean) => {
      const a = spriteOf(id);
      add(
        this.add
          .image(width * (leftSide ? 0.13 : 0.87), height * 0.99, fighterKey(id, 'idle'))
          .setFlipX(!leftSide)
          .setOrigin(leftSide ? a.originX : 1 - a.originX, a.originY)
          .setScale(s),
      );
    };
    big(c.fighter, true);
    big(foe, false);

    // Rang du match, nom du rival, niveau de l'élection, petite phrase.
    const textStyle = (size: number, color: string = CSS.cream) => ({ fontFamily: FONT_TITLE, fontSize: `${size}px`, color, stroke: CSS.ink, strokeThickness: Math.round(size / 4) });
    add(this.add.text(cx, 128, CAMPAIGN_TEXTS.step(c.beaten + 1, c.order.length), textStyle(24)).setOrigin(0.5).setName('campaign-step'));
    const name = add(this.add.text(cx, 176, FIGHTER_TEXTS[foe].name.toUpperCase(), textStyle(50, FLAG_CSS.white)).setOrigin(0.5).setAngle(-2).setName('campaign-foe'));
    if (name.width > width * 0.5) name.setScale((width * 0.5) / name.width);
    const lvColor = LEVEL_COLOR[level];
    add(this.add.rectangle(cx, 232, 300, 44, lvColor).setStrokeStyle(5, COLORS.ink).setAngle(-3));
    add(
      this.add
        .text(cx, 232, levelLabel(level).toUpperCase(), { fontFamily: FONT_TITLE, fontSize: '24px', color: lvColor === FLAG.white ? CSS.ink : FLAG_CSS.white })
        .setOrigin(0.5)
        .setAngle(-3)
        .setName('campaign-level'),
    );
    add(
      this.add
        .text(cx, 284, this.teaser, { fontFamily: FONT_UI, fontStyle: '800', fontSize: '19px', color: CSS.cream, stroke: CSS.ink, strokeThickness: 5, align: 'center', wordWrap: { width: Math.min(width * 0.5, 620) } })
        .setOrigin(0.5)
        .setName('campaign-teaser'),
    );

    // Le parcours : un portrait par rival, tamponné K.O. s'il est battu, « ? » s'il reste à affronter.
    const n = c.order.length;
    const cw = 92;
    const ch = 112;
    const gap = 14;
    const py = 388;
    c.order.forEach((id, i) => {
      const x = cx + (i - (n - 1) / 2) * (cw + gap);
      const lv = levelAt(i, n);
      const label = levelLabel(lv).slice(0, 5).toUpperCase();
      if (i < c.beaten) {
        const card = add(makeCard(this, x, py, `path-${i}`, { w: cw, h: ch, label, image: portraitOf(id), locked: true }));
        card.add(this.add.text(0, -12, CAMPAIGN_TEXTS.beaten, { fontFamily: FONT_TITLE, fontSize: '30px', color: FLAG_CSS.red, stroke: FLAG_CSS.white, strokeThickness: 6 }).setOrigin(0.5).setAngle(-14));
      } else if (i === c.beaten) {
        add(makeCard(this, x, py, `path-${i}`, { w: cw, h: ch, label, image: portraitOf(id), selected: true }).setScale(1.08));
      } else {
        add(makeCard(this, x, py, `path-${i}`, { w: cw, h: ch, label, symbol: '?' }));
      }
    });
    add(this.add.text(cx, py + ch / 2 + 26, CAMPAIGN_TEXTS.retries(c.retries), { fontFamily: FONT_UI, fontStyle: '800', fontSize: '18px', color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 }).setOrigin(0.5).setName('campaign-retries'));

    const by = Math.min(py + ch / 2 + 104, height - safe.bottom - 110);
    add(makeButton(this, cx, by, CAMPAIGN_TEXTS.go, FLAG.blue, () => this.fight(), { w: 320, h: 76, font: 34 }).setDepth(4).setName('btn-go'));
    add(
      makeButton(this, cx, by + 82, this.sure ? CAMPAIGN_TEXTS.abandonSure : CAMPAIGN_TEXTS.abandon, FLAG.red, () => this.abandon(), { w: 220, h: 50, font: 20 })
        .setDepth(4)
        .setName('btn-abandon'),
    );
    add(
      makeButton(this, 96 + side, 58, `← ${CAMPAIGN_TEXTS.home}`, FLAG.white, () => this.scene.start('Title'), { w: 150, h: 46, font: 17 })
        .setDepth(6)
        .setName('btn-back'),
    );
  }

  /** Lance le match : lieu tiré au hasard, niveau de l'IA fixé par le rang du match. */
  private fight() {
    const c = this.c;
    const data: FightData = { left: c.fighter, right: campaignFoe(c), level: campaignLevel(c), stage: STAGE_IDS[Math.floor(Math.random() * STAGE_IDS.length)], p2: 'ai', campaign: true };
    this.scene.start('Fight', data);
  }

  /** Abandon en deux temps : le premier appui demande confirmation. */
  private abandon() {
    if (!this.sure) {
      this.sure = true;
      sfx.tick(true);
      this.build();
      return;
    }
    updateSave((sv) => ({ ...sv, campaign: null }));
    this.scene.start('Title');
  }
}
