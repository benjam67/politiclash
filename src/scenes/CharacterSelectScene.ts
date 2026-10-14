import Phaser from 'phaser';
import { AI_LEVELS, levelLabel, type AiLevel } from '../ai/ai';
import { fighterKey } from '../config/poses';
import { PLAYABLE_IDS, ROSTER_SLOTS, spriteOf, type FighterId } from '../config/roster';
import { FIGHTER_TEXTS } from '../config/texts';
import { computeLayout } from '../logic/layout';
import { sfx } from '../audio/sfx';
import { makeButton } from '../ui/button';
import { makeCard } from '../ui/card';
import { safeInsets } from '../ui/safe';
import { COLORS, CSS, FONT_TITLE, FONT_UI } from '../ui/theme';
import type { StageSelectData } from './StageSelectScene';
import { loadSave, updateSave } from '../logic/save';

type Step = 'p1' | 'p2' | 'level';

export interface CharacterSelectData {
  /** Choix précédents, proposés de nouveau quand on revient de l'écran de résultat. */
  left?: FighterId;
  level?: AiLevel;
}

const TITLES: Record<Step, string> = { p1: 'CHOISIS TON COMBATTANT', p2: 'CHOISIS TON ADVERSAIRE', level: 'DIFFICULTÉ' };

/** Cadrage du portrait : un carré autour du visage, dans l'image d'attente. */
export function portraitOf(id: FighterId) {
  const a = spriteOf(id);
  return { key: fighterKey(id, 'idle'), cx: a.originX * a.width + a.face.x - 40, cy: a.originY * a.height - a.face.y - 5, size: 260 };
}

/**
 * Choix du personnage : le joueur choisit son combattant, puis son adversaire (ou « Au hasard »),
 * puis la difficulté. La grille compte 6 cases ; celles qui n'ont pas encore de combattant affichent « Bientôt ».
 */
export class CharacterSelectScene extends Phaser.Scene {
  private items: Phaser.GameObjects.GameObject[] = [];
  private step: Step = 'p1';
  private left: FighterId | null = null;
  private right: FighterId | null = null;
  private random = false;
  private level: AiLevel = 'normal';

  constructor() {
    super('CharacterSelect');
  }

  init(data: CharacterSelectData) {
    this.items = [];
    this.step = 'p1';
    // Par défaut, les choix du dernier match (sauvegardés sur l'appareil).
    const save = loadSave();
    this.left = data?.left ?? save.lastFighter;
    this.right = null;
    this.random = false;
    this.level = data?.level ?? save.level;
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
      window.__slap.scene = 'CharacterSelect';
    }
  }

  private publish() {
    if (window.__slap) window.__slap.state = { mode: 'select', step: this.step, left: this.left, right: this.right, random: this.random, level: this.level };
  }

  private go(step: Step) {
    this.step = step;
    sfx.tick(false);
    this.build();
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

    // Bandeau de titre
    add(this.add.rectangle(width / 2, 58, width * 1.3, 84, COLORS.red).setStrokeStyle(7, COLORS.ink).setAngle(-2));
    const title = add(
      this.add
        .text(width / 2, 56, TITLES[this.step], { fontFamily: FONT_TITLE, fontSize: '46px', color: CSS.yellow, stroke: CSS.ink, strokeThickness: 10 })
        .setOrigin(0.5)
        .setAngle(-2)
        .setName('select-title'),
    );
    if (title.width > width * 0.62) title.setScale((width * 0.62) / title.width);

    // Les deux combattants choisis, en grand sur les côtés.
    const s = L.fighterScale * 1.05;
    const big = (id: FighterId, leftSide: boolean, tint?: number) => {
      const a = spriteOf(id);
      const img = this.add
        .image(width * (leftSide ? 0.13 : 0.87), height * 0.99, fighterKey(id, 'idle'))
        .setFlipX(!leftSide)
        .setOrigin(leftSide ? a.originX : 1 - a.originX, a.originY)
        .setScale(s);
      if (tint) img.setTint(tint);
      add(img);
      add(
        this.add
          .text(width * (leftSide ? 0.13 : 0.87), 128, FIGHTER_TEXTS[id].name.toUpperCase(), { fontFamily: FONT_TITLE, fontSize: '24px', color: CSS.cream, stroke: CSS.ink, strokeThickness: 7 })
          .setOrigin(0.5),
      );
    };
    if (this.left) big(this.left, true);
    if (this.right) big(this.right, false, this.right === this.left ? 0x9fc4ff : undefined);
    else if (this.random && this.step === 'level') {
      add(this.add.text(width * 0.87, height * 0.6, '?', { fontFamily: FONT_TITLE, fontSize: '220px', color: CSS.yellow, stroke: CSS.ink, strokeThickness: 20 }).setOrigin(0.5));
    }

    const cx = width / 2;
    if (this.step === 'level') {
      const record = loadSave().record;
      AI_LEVELS.forEach((lv, i) => {
        const colors = [COLORS.cyan, COLORS.yellow, COLORS.pink];
        const y = height * 0.34 + i * 96;
        // Le niveau du dernier match est entouré ; sous chaque bouton, victoires et défaites à ce niveau.
        if (lv === this.level) add(this.add.rectangle(cx, y, 344, 96, COLORS.cream, 0).setStrokeStyle(5, COLORS.cream).setAngle(-3).setName('level-current'));
        add(
          makeButton(this, cx, y, levelLabel(lv).toUpperCase(), colors[i], () => this.finish(lv), { w: 320, h: 74, font: 32 })
            .setDepth(4)
            .setName(`btn-level-${lv}`),
        );
        const r = record[lv];
        if (r.w + r.l > 0) {
          add(
            this.add
              .text(cx + 186, y, `${r.w} V · ${r.l} D`, { fontFamily: FONT_UI, fontStyle: '800', fontSize: '18px', color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 })
              .setOrigin(0, 0.5)
              .setName(`record-${lv}`),
          );
        }
      });
    } else {
      // Grille de 6 cases, 3 par ligne.
      const cols = 3;
      const cw = 168;
      const ch = 196;
      const gap = 20;
      const top = 128 + ch / 2;
      for (let i = 0; i < ROSTER_SLOTS; i++) {
        const id = PLAYABLE_IDS[i];
        const x = cx + ((i % cols) - (cols - 1) / 2) * (cw + gap);
        const y = top + Math.floor(i / cols) * (ch + gap);
        if (id) {
          const chosen = this.step === 'p1' ? this.left === id : this.right === id;
          add(makeCard(this, x, y, `card-${id}`, { w: cw, h: ch, label: FIGHTER_TEXTS[id].short.toUpperCase(), image: portraitOf(id), selected: chosen, onClick: () => this.pick(id) }));
        } else {
          add(makeCard(this, x, y, `card-soon-${i}`, { w: cw, h: ch, label: 'BIENTÔT', locked: true }));
        }
      }
      if (this.step === 'p2') {
        add(makeButton(this, cx, top + ch * 1.5 + gap + 50, 'AU HASARD', COLORS.cyan, () => this.pickRandom(), { w: 260, h: 58, font: 24 }).setDepth(4));
      }
    }

    // Aide en bas, et retour.
    const help = this.step === 'p1' ? 'Touche un portrait.' : this.step === 'p2' ? 'Le même combattant des deux côtés, c’est permis.' : 'Tu pourras changer à chaque match.';
    add(
      this.add
        .text(cx, height - 12 - safe.bottom, help, { fontFamily: FONT_UI, fontStyle: '800', fontSize: '17px', color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 })
        .setOrigin(0.5, 1),
    );
    add(
      makeButton(this, 96 + side, 58, '← RETOUR', COLORS.cream, () => this.back(), { w: 150, h: 46, font: 17 })
        .setDepth(6)
        .setName('btn-back'),
    );
    this.publish();
  }

  private pick(id: FighterId) {
    if (this.step === 'p1') {
      this.left = id;
      this.go('p2');
    } else {
      this.right = id;
      this.random = false;
      this.go('level');
    }
  }

  private pickRandom() {
    this.right = null;
    this.random = true;
    this.go('level');
  }

  private back() {
    if (this.step === 'p1') this.scene.start('Title');
    else if (this.step === 'p2') {
      this.right = null;
      this.go('p1');
    } else {
      this.right = null;
      this.random = false;
      this.go('p2');
    }
  }

  private finish(level: AiLevel) {
    this.level = level;
    const right = this.right ?? PLAYABLE_IDS[Math.floor(Math.random() * PLAYABLE_IDS.length)];
    updateSave((sv) => ({ ...sv, level, lastFighter: this.left }));
    const data: StageSelectData = { left: this.left as FighterId, right, level };
    this.scene.start('StageSelect', data);
  }
}
