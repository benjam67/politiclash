import Phaser from 'phaser';
import { menuBackdrop } from '../ui/backdrop';
import { fighterKey } from '../config/poses';
import { PLAYABLE_IDS, ROSTER_SLOTS, spriteOf, type FighterId } from '../config/roster';
import { STAGE_IDS } from '../config/stages';
import { FIGHTER_TEXTS, ONLINE, SCREENS, STAGE_TEXTS } from '../config/texts';
import { computeLayout } from '../logic/layout';
import { updateSave } from '../logic/save';
import { sfx } from '../audio/sfx';
import { currentRoom, type FriendRoom, type LeaveReason } from '../net/friends';
import type { MatchStart } from '../net/room';
import { makeButton } from '../ui/button';
import { makeCard } from '../ui/card';
import { ReactionMenu, reactButton, reactionBubble } from '../ui/reactions';
import { safeInsets } from '../ui/safe';
import { COLORS, CSS, FONT_TITLE, FONT_UI, FLAG, FLAG_CSS, flagBand } from '../ui/theme';
import { portraitOf } from './CharacterSelectScene';
import type { FightData } from './FightScene';

/**
 * Salon du mode Entre amis : chacun choisit son combattant, l'hôte choisit le lieu, les deux appuient sur
 * PRÊT. Ensuite l'hôte lance le match sur les deux téléphones en même temps.
 */
export class RoomScene extends Phaser.Scene {
  private items: Phaser.GameObjects.GameObject[] = [];
  private room!: FriendRoom;
  private off: (() => void) | null = null;
  private notice = '';
  /** Menu des réactions : hors de `items`, pour rester ouvert quand le salon se redessine. */
  private reactMenu: ReactionMenu | null = null;
  private reactBtn: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('Room');
  }

  init(data: { notice?: string }) {
    this.items = [];
    this.notice = data?.notice ?? '';
  }

  create() {
    const room = currentRoom();
    if (!room) {
      this.scene.start('Title');
      return;
    }
    this.room = room;
    this.reactMenu = new ReactionMenu(this, (i) => this.sendReaction(i), 196, 40);
    const menu = this.reactMenu;
    this.reactBtn = reactButton(this, () => menu.toggle()).setDepth(30);
    this.build();
    this.off = room.listen({
      change: () => this.build(),
      ping: () => this.showPing(),
      link: () => this.build(),
      start: (s) => this.startFight(s),
      leave: (why) => this.left(why),
      react: (i) => this.showReaction(false, i),
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.build, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.off?.();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.build, this);
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => {
      sfx.unlock();
      sfx.startMusic();
    });
    if (window.__slap) {
      window.__slap.ready = true;
      window.__slap.scene = 'Room';
    }
  }

  private publish() {
    const r = this.room;
    if (window.__slap)
      window.__slap.state = { mode: 'room', code: r.code, role: r.role, me: { ...r.me }, them: r.them ? { ...r.them } : null, stage: r.stage, ping: r.ping, connected: r.link.connected };
  }

  private build() {
    if (!this.room) return;
    for (const o of this.items) o.destroy();
    this.items = [];
    const r = this.room;
    const { width, height } = this.scale;
    const L = computeLayout(width, height);
    const safe = safeInsets(this);
    const side = Math.max(safe.left, safe.right);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.items.push(o), o);
    const text = (x: number, y: number, s: string, size: number, color: string = CSS.cream, title = false) =>
      add(
        this.add
          .text(x, y, s, title ? { fontFamily: FONT_TITLE, fontSize: `${size}px`, color, stroke: CSS.ink, strokeThickness: Math.round(size / 4) } : { fontFamily: FONT_UI, fontStyle: '800', fontSize: `${size}px`, color, stroke: CSS.ink, strokeThickness: 5 })
          .setOrigin(0.5),
      );

    add(menuBackdrop(this, 0x6d6478));
    add(this.add.rectangle(0, 0, width, height, COLORS.ink, 0.45).setOrigin(0));
    flagBand(this, width / 2, 50, width * 1.3, 72, -2).forEach(add);
    text(width / 2, 48, ONLINE.room(r.code), 40, FLAG_CSS.white, true).setAngle(-2).setName('room-title');

    // Les deux joueurs sur les côtés : moi à ma place (gauche si hôte), l'adversaire en face.
    const s = L.fighterScale * 0.95;
    const players = [
      { info: r.me, left: r.isHost },
      { info: r.them, left: !r.isHost },
    ];
    for (const { info, left } of players) {
      const x = width * (left ? 0.13 : 0.87);
      if (info?.fighter) {
        const a = spriteOf(info.fighter);
        const mirror = !left && r.me.fighter === r.them?.fighter;
        const img = add(
          this.add
            .image(x, height * 0.99, fighterKey(info.fighter, 'idle'))
            .setFlipX(!left)
            .setOrigin(left ? a.originX : 1 - a.originX, a.originY)
            .setScale(s),
        );
        if (mirror) img.setTint(0x9fc4ff);
      } else {
        text(x, height * 0.6, '?', 180, FLAG_CSS.white, true);
      }
      text(x, 112, info ? info.pseudo : ONLINE.waitingThem, 22, CSS.cream).setName(left ? 'room-left-name' : 'room-right-name');
      if (info?.fighter) text(x, 138, FIGHTER_TEXTS[info.fighter].short.toUpperCase(), 16, FLAG_CSS.white);
      if (info?.ready) {
        add(this.add.rectangle(x, height * 0.42, 150, 48, FLAG.blue).setStrokeStyle(5, COLORS.ink).setAngle(-6).setDepth(5));
        text(x, height * 0.42, ONLINE.isReady, 24, FLAG_CSS.white, true).setAngle(-6).setDepth(6).setName(left ? 'room-left-ready' : 'room-right-ready');
      }
    }

    // Grille des combattants, 3 × 2, plus petite que celle du solo.
    const cx = width / 2;
    const cw = 128;
    const ch = 140;
    const gap = 14;
    const top = 100 + ch / 2;
    for (let i = 0; i < ROSTER_SLOTS; i++) {
      const id = PLAYABLE_IDS[i];
      const x = cx + ((i % 3) - 1) * (cw + gap);
      const y = top + Math.floor(i / 3) * (ch + gap);
      if (id) add(makeCard(this, x, y, `card-${id}`, { w: cw, h: ch, label: FIGHTER_TEXTS[id].short.toUpperCase(), image: portraitOf(id), selected: r.me.fighter === id, onClick: () => this.pick(id) }));
      else add(makeCard(this, x, y, `card-soon-${i}`, { w: cw, h: ch, label: SCREENS.soon, locked: true }));
    }

    // Lieu : l'hôte le fait défiler, l'invité le voit.
    const ly = top + ch * 1.5 + gap + 30;
    const stageName = `${ONLINE.stage} : ${STAGE_TEXTS[r.stage].name.toUpperCase()}`;
    if (r.isHost) {
      add(makeButton(this, cx, ly, `◀  ${stageName}  ▶`, FLAG.red, () => this.nextStage(), { w: 400, h: 50, font: 20 }).setName('btn-stage').setDepth(4));
    } else {
      text(cx, ly - 10, stageName, 20, FLAG_CSS.white, true).setName('room-stage');
      text(cx, ly + 16, ONLINE.hostPicksStage, 14);
    }

    // PRÊT, et la ligne d'aide.
    const by = Math.min(ly + 68, height - safe.bottom - 74);
    const ready = r.me.ready;
    add(
      makeButton(this, cx, by, ready ? ONLINE.notReady : ONLINE.ready, ready ? FLAG.white : FLAG.blue, () => this.room.setReady(!this.room.me.ready), { w: 240, h: 64, font: 30 })
        .setName('btn-ready')
        .setDepth(4),
    );
    let help = this.notice;
    if (!help) {
      if (!r.link.connected) help = ONLINE.unstable;
      else if (!r.me.fighter) help = ONLINE.pickFirst;
      else if (!ready) help = ONLINE.pressReady;
      else if (r.them && !r.them.ready) help = ONLINE.waitReady(r.them.pseudo);
    }
    text(cx, height - 14 - safe.bottom, help, 17).setOrigin(0.5, 1).setName('room-help');
    // Qualité de la connexion, en bas à droite (au-dessus du pied du combattant) : mise à jour seule à chaque mesure.
    this.pingText = text(width - 20 - side, height - 14 - safe.bottom, '', 14).setOrigin(1, 1).setName('room-ping').setDepth(7) as Phaser.GameObjects.Text;
    this.weakText = text(width - 20 - side, height - 36 - safe.bottom, ONLINE.weak, 13, CSS.pink).setOrigin(1, 1).setDepth(7) as Phaser.GameObjects.Text;
    this.showPing();
    // Réactions : bouton 💬 en haut à droite, en face de QUITTER.
    this.reactBtn?.setPosition(width - 48 - side, 50).setVisible(!!r.them);
    if (!r.them) this.reactMenu?.close();
    add(makeButton(this, 96 + side, 50, ONLINE.quit, FLAG.white, () => this.quit(), { w: 150, h: 44, font: 16 }).setDepth(6).setName('btn-quit'));
    this.publish();
  }

  private pingText: Phaser.GameObjects.Text | null = null;
  private weakText: Phaser.GameObjects.Text | null = null;

  private showPing() {
    const r = this.room;
    if (!this.pingText || !this.weakText || !this.pingText.active) return;
    this.pingText.setText(r.ping === null ? '' : ONLINE.ping(r.ping)).setColor(r.weak ? CSS.pink : CSS.cream);
    this.weakText.setVisible(r.weak);
    this.publish();
  }

  private sendReaction(i: number) {
    this.room.react(i);
    this.showReaction(true, i);
  }

  /** Bulle sous le pseudo du joueur, de son côté de l'écran. */
  private showReaction(mine: boolean, i: number) {
    const r = this.room;
    const left = mine ? r.isHost : !r.isHost;
    const who = (left ? 0 : 1) as 0 | 1;
    reactionBubble(this, this.scale.width * (left ? 0.13 : 0.87), 205, i, who, mine, 30);
  }

  private pick(id: FighterId) {
    sfx.tick(false);
    this.notice = '';
    this.room.pick(id);
    updateSave((s) => ({ ...s, lastFighter: id }));
  }

  private nextStage() {
    sfx.tick(false);
    const i = STAGE_IDS.indexOf(this.room.stage);
    const next = STAGE_IDS[(i + 1) % STAGE_IDS.length];
    this.room.setStage(next);
    updateSave((s) => ({ ...s, lastStage: next }));
  }

  private startFight(start: MatchStart) {
    const data: FightData = { online: start };
    this.scene.start('Fight', data);
  }

  private quit() {
    this.room.leave();
    this.scene.start('Title');
  }

  private left(why: LeaveReason) {
    if (why === 'self') return;
    this.scene.start('Title', { notice: why === 'version' ? ONLINE.version : ONLINE.left(this.room.them?.pseudo ?? 'Ton adversaire') });
  }
}
