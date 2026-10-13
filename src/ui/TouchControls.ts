import Phaser from 'phaser';
import { noInput, type InputFrame, type InputKey } from '../logic/input';
import type { InputSource } from '../input/sources';
import { BUZZ_TEXTS } from '../config/texts';
import { COLORS, CSS, FONT_TITLE } from './theme';
import type { Insets } from './safe';

interface Btn {
  key: InputKey;
  x: number;
  y: number;
  r: number;
  color: number;
  circle: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
}

/** Réglages du stick, en unités du jeu (écran de 720 de haut). */
const STICK = { radius: 78, knob: 34, dead: 20, up: 38, down: 34 };

/**
 * Contrôles tactiles : stick virtuel sur la moitié gauche (il se place sous le pouce),
 * quatre boutons à droite. Garde basse : GARDE en tenant le stick vers le bas. Les boutons sont lus en continu : on peut glisser de l'un à l'autre.
 */
export class TouchControls implements InputSource {
  private base: Phaser.GameObjects.Arc;
  private knob: Phaser.GameObjects.Arc;
  private btns: Btn[] = [];
  private stickId = -1;
  private origin = { x: 0, y: 0 };
  private rest = { x: 0, y: 0 };
  private width = 0;
  private visible = true;
  /** Barre Buzz pleine : le bouton « Grosse gifle » devient « Buzz ». */
  private buzz = false;
  private ring: Phaser.GameObjects.Graphics;
  private glow: Phaser.GameObjects.Arc;
  private ringShown = -1;

  constructor(private scene: Phaser.Scene) {
    scene.input.addPointer(3);
    this.base = scene.add.circle(0, 0, STICK.radius, COLORS.ink, 0.28).setStrokeStyle(4, COLORS.cream, 0.55).setDepth(120);
    this.knob = scene.add.circle(0, 0, STICK.knob, COLORS.cream, 0.6).setStrokeStyle(4, COLORS.ink, 0.8).setDepth(121);
    const mk = (key: InputKey, text: string, color: number, r: number, font: number) => {
      const circle = scene.add.circle(0, 0, r, color, 0.5).setStrokeStyle(5, COLORS.ink, 0.85).setDepth(120);
      const label = scene.add
        .text(0, 0, text, { fontFamily: FONT_TITLE, fontSize: `${font}px`, color: CSS.cream, stroke: CSS.ink, strokeThickness: 6, align: 'center' })
        .setOrigin(0.5)
        .setDepth(121)
        .setAlpha(0.95);
      this.btns.push({ key, x: 0, y: 0, r, color, circle, label });
    };
    mk('gifle', 'GIFLE', COLORS.yellow, 66, 22);
    mk('grosseGifle', 'GROSSE\nGIFLE', COLORS.pink, 56, 16);
    mk('garde', 'GARDE', COLORS.cyan, 54, 18);
    mk('pied', 'PIED', COLORS.cream, 56, 20);
    this.glow = scene.add.circle(0, 0, 70, COLORS.yellow, 0.35).setDepth(119).setVisible(false);
    this.ring = scene.add.graphics().setDepth(122);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
      scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
      scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    });
  }

  layout(width: number, height: number, safe: Insets) {
    this.width = width;
    const side = Math.max(safe.left, safe.right);
    const bottom = height - safe.bottom;
    this.rest = { x: 150 + side, y: bottom - 135 };
    if (this.stickId < 0) this.origin = { ...this.rest };
    // En arc autour du pouce droit : GIFLE dans le coin, PIED à sa gauche, GARDE au-dessus, GROSSE GIFLE en diagonale.
    const [slap, big, guard, kick] = this.btns;
    const right = width - side;
    Object.assign(slap, { x: right - 96, y: bottom - 92 });
    Object.assign(kick, { x: right - 234, y: bottom - 74 });
    Object.assign(guard, { x: right - 84, y: bottom - 228 });
    Object.assign(big, { x: right - 212, y: bottom - 198 });
    for (const b of this.btns) {
      b.circle.setPosition(b.x, b.y);
      b.label.setPosition(b.x, b.y);
    }
    this.glow.setPosition(big.x, big.y);
    this.ringShown = -1;
    this.draw(0, 0, noInput());
  }

  /** Barre Buzz pleine ou non : le bouton change de couleur, brille et affiche « Buzz ». */
  setBuzz(full: boolean) {
    if (full === this.buzz) return;
    this.buzz = full;
    const big = this.btns[1];
    big.color = full ? COLORS.yellow : COLORS.pink;
    big.label.setText(full ? BUZZ_TEXTS.button : 'GROSSE\nGIFLE').setFontSize(full ? 26 : 16);
    this.scene.tweens.killTweensOf(this.glow);
    this.glow.setVisible(full && this.visible).setScale(1).setAlpha(0.35);
    if (full) this.scene.tweens.add({ targets: this.glow, scale: 1.25, alpha: 0.05, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.draw(0, 0, noInput());
  }

  get buzzShown() {
    return this.buzz;
  }

  /** Cercle autour du bouton Buzz, de 0 (vide) à 1 (complet). */
  setRing(progress: number) {
    const q = Math.round(Math.max(0, Math.min(1, progress)) * 48);
    if (q === this.ringShown) return;
    this.ringShown = q;
    const big = this.btns[1];
    const g = this.ring;
    g.clear();
    if (q <= 0 || !this.visible) return;
    const r = big.r + 12;
    g.lineStyle(13, COLORS.ink, 0.85).beginPath().arc(big.x, big.y, r, 0, Math.PI * 2).strokePath();
    g.lineStyle(8, COLORS.yellow, 1).beginPath().arc(big.x, big.y, r, -Math.PI / 2, -Math.PI / 2 + (q / 48) * Math.PI * 2).strokePath();
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.base.setVisible(v);
    this.knob.setVisible(v);
    this.glow.setVisible(v && this.buzz);
    this.ring.setVisible(v);
    for (const b of this.btns) {
      b.circle.setVisible(v);
      b.label.setVisible(v);
    }
  }

  private hit(x: number, y: number): Btn | undefined {
    // Zone de toucher un peu plus large que le dessin : plus tolérant sous le pouce.
    return this.btns.find((b) => (x - b.x) ** 2 + (y - b.y) ** 2 <= (b.r + 14) ** 2);
  }

  private onDown(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) {
    if (!this.visible || over.length > 0 || this.stickId >= 0) return;
    if (p.x < this.width / 2 && !this.hit(p.x, p.y)) {
      this.stickId = p.id;
      // Le stick se place sous le pouce, sans sortir de l'écran.
      this.origin = { x: Math.max(STICK.radius + 8, p.x), y: Math.max(STICK.radius + 8, Math.min(this.scene.scale.height - STICK.radius - 8, p.y)) };
    }
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (p.id === this.stickId) {
      this.stickId = -1;
      this.origin = { ...this.rest };
    }
  }

  read(): InputFrame {
    const out = noInput();
    if (!this.visible) return out;
    let dx = 0;
    let dy = 0;
    for (const p of this.scene.input.manager.pointers) {
      if (!p.isDown) continue;
      if (p.id === this.stickId) {
        dx = p.x - this.origin.x;
        dy = p.y - this.origin.y;
      } else {
        const b = this.hit(p.x, p.y);
        if (b) out[b.key] = true;
      }
    }
    out.gauche = dx < -STICK.dead;
    out.droite = dx > STICK.dead;
    out.haut = dy < -STICK.up;
    out.bas = dy > STICK.down;
    this.draw(dx, dy, out);
    return out;
  }

  private draw(dx: number, dy: number, input: InputFrame) {
    const len = Math.hypot(dx, dy);
    const k = len > STICK.radius ? STICK.radius / len : 1;
    this.base.setPosition(this.origin.x, this.origin.y);
    this.knob.setPosition(this.origin.x + dx * k, this.origin.y + dy * k);
    for (const b of this.btns) {
      const on = input[b.key];
      b.circle.setFillStyle(b.color, on ? 0.95 : 0.5).setScale(on ? 0.92 : 1);
    }
  }
}
