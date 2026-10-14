import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { computeLayout } from '../logic/layout';
import { makeButton } from '../ui/button';
import { COLORS, CSS, FONT_TITLE, FONT_UI, FLAG, FLAG_CSS, flagBand } from '../ui/theme';
import { fighterKey } from '../config/poses';
import { needsInstallHint, safeInsets } from '../ui/safe';
import { PLAYABLE_IDS, spriteOf } from '../config/roster';
import { GAME, ONLINE, SCREENS, TUTORIAL } from '../config/texts';
import { openLobby } from '../net/lobby';
import { normalizeCode } from '../net/room';
import { loadSave, totalWins } from '../logic/save';
import type { FightData } from './FightScene';

/** Écran d'accueil : le bouton JOUER mène au choix du personnage. */
export class TitleScene extends Phaser.Scene {
  private items: Phaser.GameObjects.GameObject[] = [];
  /** Message à afficher (un ami a quitté le salon, versions différentes…). */
  private notice = '';
  private lobbyOpen = false;

  constructor() {
    super('Title');
  }

  init(data: { notice?: string; join?: string }) {
    this.items = [];
    this.notice = data?.notice ?? '';
    this.lobbyOpen = false;
    // Lien d'invitation (`?salon=ABCD`) : on rejoint le salon directement, une seule fois.
    const code = data?.join ?? normalizeCode(new URLSearchParams(location.search).get('salon') ?? '');
    if (code && !TitleScene.joined) {
      TitleScene.joined = true;
      this.time.delayedCall(50, () => this.goOnline(code));
    }
  }

  private static joined = false;

  private goOnline(join?: string) {
    if (this.lobbyOpen) return;
    this.lobbyOpen = true;
    this.notice = '';
    this.build();
    void openLobby({ join }).then((room) => {
      this.lobbyOpen = false;
      if (room) this.scene.start('Room');
    });
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
      window.__slap.scene = 'Title';
      window.__slap.state = { mode: 'title' };
    }
  }

  private startTutorial() {
    const save = loadSave();
    const left = save.lastFighter ?? PLAYABLE_IDS[0];
    const data: FightData = { left, right: PLAYABLE_IDS.find((id) => id !== left) ?? left, stage: 'bar', tutorial: true };
    this.scene.start('Fight', data);
  }

  private build() {
    for (const o of this.items) o.destroy();
    this.items = [];
    const { width, height } = this.scale;
    const L = computeLayout(width, height);
    const safe = safeInsets(this);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.items.push(o), o);

    add(this.add.image(L.decor.x, L.decor.y, 'stage_bar').setOrigin(0, 0).setScale(L.decor.scale).setTint(0x8a7f92));
    add(this.add.rectangle(0, 0, width, height, COLORS.ink, 0.35).setOrigin(0));

    // Deux combattants encadrent le menu.
    const s = L.fighterScale * 1.08;
    const [a, b] = [PLAYABLE_IDS[0], PLAYABLE_IDS[1] ?? PLAYABLE_IDS[0]];
    add(this.add.image(width * 0.16, height * 0.98, fighterKey(a, 'idle')).setOrigin(spriteOf(a).originX, spriteOf(a).originY).setScale(s).setDepth(2));
    add(
      this.add
        .image(width * 0.85, height * 0.98, fighterKey(b, 'victory'))
        .setFlipX(true)
        .setOrigin(1 - spriteOf(b).originX, spriteOf(b).originY)
        .setScale(s)
        .setDepth(2),
    );

    // Titre
    const [band, ...stripes] = flagBand(this, width / 2, height * 0.2, width * 1.3, 150, -4).reverse().map(add);
    stripes.forEach((o) => o.setDepth(1));
    band.setDepth(1);
    const title = add(
      this.add
        .text(width / 2, height * 0.18, GAME.title, { fontFamily: FONT_TITLE, fontSize: '96px', color: FLAG_CSS.white, stroke: CSS.ink, strokeThickness: 16 })
        .setOrigin(0.5)
        .setAngle(-4)
        .setDepth(3)
        .setName('title'),
    );
    // Le titre ne doit jamais passer sous les combattants.
    const maxW = width * 0.56;
    if (title.width > maxW) title.setScale(maxW / title.width);
    add(
      this.add
        .text(width / 2 + 190, height * 0.18 + 62, GAME.titleKana, { fontFamily: FONT_TITLE, fontSize: '28px', color: CSS.cream, stroke: CSS.ink, strokeThickness: 7 })
        .setOrigin(0.5)
        .setAngle(-4)
        .setDepth(3),
    );

    // Premier lancement : JOUER commence par le tutoriel.
    const save = loadSave();
    add(makeButton(this, width / 2 - 160, height * 0.6, SCREENS.play, FLAG.blue, () => (save.tutorialDone ? this.scene.start('CharacterSelect', {}) : this.startTutorial()), { w: 290, h: 84, font: 38 }).setDepth(4).setName('btn-play'));
    add(makeButton(this, width / 2 + 160, height * 0.6, ONLINE.menuTitle, FLAG.red, () => this.goOnline(), { w: 290, h: 84, font: 34 }).setDepth(4).setName('btn-online'));
    if (this.notice) {
      add(
        this.add
          .text(width / 2, height * 0.42, this.notice, { fontFamily: FONT_UI, fontStyle: '800', fontSize: '20px', color: FLAG_CSS.white, stroke: CSS.ink, strokeThickness: 6, align: 'center', wordWrap: { width: width * 0.5 } })
          .setOrigin(0.5)
          .setDepth(5)
          .setName('title-notice'),
      );
    }
    if (save.tutorialDone) add(makeButton(this, width / 2, height * 0.6 + 86, TUTORIAL.replay, FLAG.white, () => this.startTutorial(), { w: 210, h: 50, font: 20 }).setDepth(4).setName('btn-tutorial'));
    const wins = totalWins(save);
    if (wins > 0) {
      add(
        this.add
          .text(width / 2, height * 0.6 - 62, TUTORIAL.wins(wins).toUpperCase(), { fontFamily: FONT_TITLE, fontSize: '22px', color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 })
          .setOrigin(0.5)
          .setDepth(3)
          .setName('title-wins'),
      );
    }

    add(
      this.add
        .text(width / 2, height - 14 - safe.bottom, needsInstallHint() ? 'iPhone : pour le plein écran, touche Partager puis « Sur l’écran d’accueil »' : GAME.tagline, {
          fontFamily: FONT_UI,
          fontStyle: '800',
          fontSize: '17px',
          color: CSS.cream,
          stroke: CSS.ink,
          strokeThickness: 5,
        })
        .setOrigin(0.5, 1)
        .setDepth(3),
    );

    const snd = add(
      this.add
        .image(width - 44 - Math.max(safe.left, safe.right), 44, sfx.muted ? 'ico_sound_off' : 'ico_sound_on')
        .setDepth(5)
        .setInteractive({ useHandCursor: true }),
    );
    snd.on('pointerup', () => {
      sfx.unlock();
      sfx.setMuted(!sfx.muted);
      snd.setTexture(sfx.muted ? 'ico_sound_off' : 'ico_sound_on');
      if (!sfx.muted) sfx.startMusic();
    });
  }
}
