import Phaser from 'phaser';
import { spriteOf, type FighterId } from '../config/roster';
import { STAGE_IDS, STAGES, type StageId } from '../config/stages';
import { FIGHTER_TEXTS, SCREENS } from '../config/texts';
import { fighterKey } from '../config/poses';
import { computeLayout } from '../logic/layout';
import { sfx } from '../audio/sfx';
import { makeButton } from '../ui/button';
import { safeInsets } from '../ui/safe';
import { COLORS, CSS, FONT_TITLE, FLAG, FLAG_CSS, flagBand } from '../ui/theme';
import type { FightData, FoeKind } from './FightScene';
import type { AiLevel } from '../ai/ai';
import { updateSave, withResult } from '../logic/save';
import { CAMPAIGN_TEXTS, ONLINE } from '../config/texts';
import { campaignDone, campaignFoe, campaignLoss, campaignWin, withVictory, type Campaign } from '../logic/campaign';
import { currentRoom, type FriendRoom } from '../net/friends';
import type { SessionStats } from '../net/rollback';
import { FONT_UI } from '../ui/theme';

export interface ResultData {
  ids: [FighterId, FighterId];
  stage: StageId;
  winner: 0 | 1;
  wins: [number, number];
  p2: FoeKind;
  level: AiLevel;
  autoplay: boolean;
  /** Match en ligne : le joueur de ce téléphone, et de quoi vérifier que les deux téléphones ont le même match. */
  online?: { me: 0 | 1; hash: number; steps: number; stats: SessionStats };
  /** Match de la campagne présidentielle. */
  campaign?: boolean;
}

/** Écran de résultat : le vainqueur, le score en rounds, revanche ou retour à l'accueil. */
export class ResultScene extends Phaser.Scene {
  private items: Phaser.GameObjects.GameObject[] = [];
  private result!: ResultData;
  private room: FriendRoom | null = null;
  private off: (() => void) | null = null;
  /** Campagne, après ce match (null hors campagne). */
  private camp: Campaign | null = null;
  private lostLine = '';
  private sure = false;

  constructor() {
    super('Result');
  }

  init(data: ResultData) {
    this.result = data;
    this.items = [];
    this.room = data.online ? currentRoom() : null;
    this.off = null;
    this.camp = null;
    this.sure = false;
    const lines = CAMPAIGN_TEXTS.lost;
    this.lostLine = lines[Math.floor(Math.random() * lines.length)];
  }

  create() {
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    // Victoires et défaites contre l'IA, gardées sur l'appareil (pas la démo).
    const r = this.result;
    if (r.p2 === 'ai' && !r.autoplay && !r.online) updateSave((sv) => withResult(sv, r.level, r.winner === 0));
    if (r.campaign && !r.autoplay && this.recordCampaign()) return;
    this.build();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.build, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.build, this));
    sfx.crowd(0.8, 1.6);
    if (this.room) {
      this.off = this.room.listen({
        change: () => this.build(),
        start: (st) => this.scene.start('Fight', { online: st }),
        room: () => this.scene.start('Room'),
        leave: (why) => {
          if (why !== 'self') this.scene.start('Title', { notice: why === 'version' ? ONLINE.version : ONLINE.left(this.room?.them?.pseudo ?? '') });
        },
      });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.off?.());
    }
    if (window.__slap) {
      window.__slap.ready = true;
      window.__slap.scene = 'Result';
      window.__slap.state = { mode: 'result', winner: this.result.winner, wins: this.result.wins, ids: { left: this.result.ids[0], right: this.result.ids[1] }, online: this.result.online ?? null, campaign: this.camp ? { beaten: this.camp.beaten, retries: this.camp.retries } : null };
    }
  }

  /**
   * Campagne : le match gagné fait avancer d'un rival, le match perdu compte un recomptage.
   * Dernier rival battu : palmarès, fin de la campagne et grande scène finale (rend vrai).
   */
  private recordCampaign(): boolean {
    const r = this.result;
    let done: Campaign | null = null;
    const sv = updateSave((sv) => {
      const c = sv.campaign;
      // Le match doit être celui de la campagne sauvegardée (sinon on n'y touche pas).
      if (!c || c.fighter !== r.ids[0] || campaignFoe(c) !== r.ids[1]) return sv;
      if (r.winner !== 0) return { ...sv, campaign: campaignLoss(c) };
      const next = campaignWin(c);
      if (!campaignDone(next)) return { ...sv, campaign: next };
      done = next;
      return { ...sv, campaign: null, palmares: withVictory(sv.palmares, next) };
    });
    if (done) {
      this.scene.start('President', { campaign: done });
      return true;
    }
    this.camp = sv.campaign;
    return false;
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

    const [band, ...stripes] = flagBand(this, width / 2, height * 0.2, width * 1.3, 140, -4).reverse().map(add);
    stripes.forEach((o) => o.setDepth(1));
    band.setDepth(1);
    const winner = FIGHTER_TEXTS[r.ids[r.winner]];
    const name = winner.short.toUpperCase();
    const title = add(
      this.add
        .text(width / 2, height * 0.19, SCREENS.winner(name, winner.elected), { fontFamily: FONT_TITLE, fontSize: '68px', color: FLAG_CSS.white, stroke: CSS.ink, strokeThickness: 13 })
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

    const by = Math.min(height * 0.62, height - safe.bottom - 150);
    if (r.online) {
      this.buildOnline(by);
      return;
    }
    if (this.camp) {
      this.buildCampaign(by);
      return;
    }
    const again: FightData = { left: r.ids[0], right: r.ids[1], stage: r.stage, p2: r.p2, level: r.level, autoplay: r.autoplay };
    add(makeButton(this, width / 2, by, SCREENS.again, FLAG.blue, () => this.scene.start('Fight', again), { w: 320, h: 76, font: 34 }).setDepth(4).setName('btn-again'));
    add(makeButton(this, width / 2 - 135, by + 92, SCREENS.other, FLAG.red, () => this.scene.start('CharacterSelect', { left: r.ids[0], level: r.level }), { w: 250, h: 58, font: 22 }).setDepth(4).setName('btn-other'));
    add(makeButton(this, width / 2 + 135, by + 92, SCREENS.home, FLAG.white, () => this.scene.start('Title'), { w: 250, h: 58, font: 22 }).setDepth(4));
  }

  /** Campagne : après une victoire, l'élection est contestée (rival suivant) ; après une défaite, recomptage. */
  private buildCampaign(by: number) {
    const { width, height } = this.scale;
    const c = this.camp!;
    const won = this.result.winner === 0;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.items.push(o), o);
    const line = won ? CAMPAIGN_TEXTS.contested(c.order.length - c.beaten) : this.lostLine;
    add(
      this.add
        .text(width / 2, height * 0.48, line, { fontFamily: FONT_UI, fontStyle: '800', fontSize: '22px', color: FLAG_CSS.white, stroke: CSS.ink, strokeThickness: 6, align: 'center', wordWrap: { width: Math.min(width * 0.55, 700) } })
        .setOrigin(0.5)
        .setDepth(3)
        .setName('result-campaign-line'),
    );
    if (won) {
      add(makeButton(this, width / 2, by, CAMPAIGN_TEXTS.next, FLAG.blue, () => this.scene.start('Campaign'), { w: 320, h: 76, font: 32 }).setDepth(4).setName('btn-next'));
    } else {
      // Recomptage : le même rival, au même niveau, dans un nouveau lieu tiré au hasard.
      const again: FightData = { left: c.fighter, right: campaignFoe(c), stage: STAGE_IDS[Math.floor(Math.random() * STAGE_IDS.length)], p2: 'ai', level: this.result.level, campaign: true };
      add(makeButton(this, width / 2, by, CAMPAIGN_TEXTS.rematch, FLAG.blue, () => this.scene.start('Fight', again), { w: 320, h: 76, font: 34 }).setDepth(4).setName('btn-rematch'));
      add(
        makeButton(this, width / 2 - 135, by + 92, this.sure ? CAMPAIGN_TEXTS.abandonSure : CAMPAIGN_TEXTS.abandon, FLAG.red, () => this.abandon(), { w: 250, h: 58, font: 22 })
          .setDepth(4)
          .setName('btn-abandon'),
      );
    }
    add(makeButton(this, width / 2 + (won ? 0 : 135), by + 92, CAMPAIGN_TEXTS.home, FLAG.white, () => this.scene.start('Title'), { w: 250, h: 58, font: 22 }).setDepth(4).setName('btn-home'));
  }

  /** Abandon de la campagne, en deux temps. */
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

  /** En ligne : revanche (il faut que les deux la demandent), changer de perso (retour au salon), menu. */
  private buildOnline(by: number) {
    const { width } = this.scale;
    const room = this.room;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.items.push(o), o);
    if (!room || room.closed) {
      add(makeButton(this, width / 2, by, ONLINE.menu, FLAG.blue, () => this.scene.start('Title'), { w: 320, h: 76, font: 34 }).setDepth(4));
      return;
    }
    const who = room.them?.pseudo ?? '';
    if (room.again.me) {
      add(this.add.text(width / 2, by, ONLINE.againWait(who), { fontFamily: FONT_UI, fontStyle: '800', fontSize: '24px', color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 }).setOrigin(0.5).setDepth(4).setName('result-wait'));
    } else {
      add(makeButton(this, width / 2, by, ONLINE.again, FLAG.blue, () => room.askAgain(), { w: 320, h: 76, font: 34 }).setDepth(4).setName('btn-again'));
    }
    if (room.again.them && !room.again.me) {
      add(this.add.text(width / 2, by - 58, ONLINE.againThem(who), { fontFamily: FONT_UI, fontStyle: '800', fontSize: '20px', color: FLAG_CSS.white, stroke: CSS.ink, strokeThickness: 5 }).setOrigin(0.5).setDepth(4).setName('result-them-again'));
    }
    add(
      makeButton(this, width / 2 - 135, by + 92, ONLINE.changeFighter, FLAG.red, () => {
        room.backToRoom();
        this.scene.start('Room');
      }, { w: 250, h: 58, font: 20 }).setDepth(4).setName('btn-change'),
    );
    add(
      makeButton(this, width / 2 + 135, by + 92, ONLINE.menu, FLAG.white, () => {
        room.leave();
        this.scene.start('Title');
      }, { w: 250, h: 58, font: 22 }).setDepth(4),
    );
  }
}
