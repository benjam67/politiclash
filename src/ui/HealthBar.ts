import Phaser from 'phaser';
import { COLORS, CSS, FONT_TITLE, FONT_UI } from './theme';

/**
 * Barre de vie inclinée façon jeu de baston, contour noir épais.
 * Côté gauche : la barre se vide vers la gauche (bord extérieur) ; côté droit : en miroir.
 */
export class HealthBar extends Phaser.GameObjects.Container {
  private g: Phaser.GameObjects.Graphics;
  private nameText: Phaser.GameObjects.Text;
  private kanaText: Phaser.GameObjects.Text;
  private shown = 1; // part affichée (jaune)
  private trail = 1; // part « dégâts récents » (rouge), rattrape le jaune
  private target = 1;
  private trailPx = -1;
  private barW = 400;
  private readonly barH = 30;
  /** Barre Buzz, fine, sous la barre de vie. */
  private buzz = 0;
  private buzzFull = false;
  private buzzG: Phaser.GameObjects.Graphics;
  private buzzGlow: Phaser.GameObjects.Graphics;
  private buzzTag: Phaser.GameObjects.Image | null = null;
  private readonly buzzY = 37;
  private readonly buzzH = 8;
  private readonly buzzFrac = 0.6;
  private readonly slant = 16;

  constructor(
    scene: Phaser.Scene,
    readonly side: 'left' | 'right',
    name: string,
    katakana: string,
  ) {
    super(scene, 0, 0);
    this.g = scene.add.graphics();
    this.buzzGlow = scene.add.graphics().setAlpha(0);
    this.buzzG = scene.add.graphics();
    this.nameText = scene.add
      .text(0, 0, name.toUpperCase(), {
        fontFamily: FONT_TITLE,
        fontSize: '26px',
        color: CSS.cream,
        stroke: CSS.ink,
        strokeThickness: 6,
      })
      .setOrigin(side === 'left' ? 0 : 1, 0);
    this.kanaText = scene.add
      .text(0, 0, katakana, {
        fontFamily: FONT_UI,
        fontStyle: '800',
        fontSize: '18px',
        color: CSS.yellow,
        stroke: CSS.ink,
        strokeThickness: 5,
      })
      .setOrigin(side === 'left' ? 0 : 1, 0);
    this.add([this.g, this.buzzGlow, this.buzzG, this.nameText, this.kanaText]);
    scene.add.existing(this);
    this.addToUpdateList();
  }

  /** Place la barre : x = bord extérieur, largeur disponible jusqu'au centre. */
  layout(outerX: number, y: number, width: number) {
    this.barW = width;
    this.setPosition(outerX, y);
    const dir = this.side === 'left' ? 1 : -1;
    this.nameText.setPosition(dir * (this.slant + 4), this.buzzY + this.buzzH + 4);
    this.kanaText.setPosition(dir * (this.slant + 10 + this.nameText.width), this.buzzY + this.buzzH + 10);
    this.redraw();
    this.redrawBuzz();
  }

  setValue(ratio: number, instant = false) {
    this.target = Phaser.Math.Clamp(ratio, 0, 1);
    this.shown = this.target;
    if (instant || this.target > this.trail) this.trail = this.target;
    this.redraw();
  }

  /** Buzz de 0 à 1 ; pleine = coup spécial prêt (la barre brille, étiquette « BUZZ ! »). */
  setBuzz(ratio: number) {
    const r = Phaser.Math.Clamp(ratio, 0, 1);
    const full = r >= 1;
    if (r === this.buzz && full === this.buzzFull) return;
    this.buzz = r;
    if (full !== this.buzzFull) {
      this.buzzFull = full;
      this.scene.tweens.killTweensOf(this.buzzGlow);
      this.buzzGlow.setAlpha(0);
      this.buzzTag?.destroy();
      this.buzzTag = null;
      if (full) {
        this.scene.tweens.add({ targets: this.buzzGlow, alpha: { from: 0.2, to: 0.9 }, duration: 280, yoyo: true, repeat: -1 });
        const dir = this.side === 'left' ? 1 : -1;
        const x = dir * (this.slant + this.barW * this.buzzFrac + 10);
        this.buzzTag = this.scene.add.image(x, this.buzzY + this.buzzH / 2, 'lbl_buzzfull').setOrigin(this.side === 'left' ? 0 : 1, 0.5).setAngle(-4);
        this.add(this.buzzTag);
        this.buzzTag.setScale(1.6);
        this.scene.tweens.add({ targets: this.buzzTag, scale: 1, duration: 220, ease: 'Back.Out' });
      }
    }
    this.redrawBuzz();
  }

  get buzzIsFull() {
    return this.buzzFull;
  }

  private redrawBuzz() {
    const dir = this.side === 'left' ? 1 : -1;
    const w = this.barW * this.buzzFrac;
    const x0 = dir * (this.slant * 0.5);
    const rect = (g: Phaser.GameObjects.Graphics, frac: number, pad: number) => {
      const x = dir === 1 ? x0 - pad : x0 - frac * w - pad;
      g.fillRect(x, this.buzzY - pad, frac * w + pad * 2, this.buzzH + pad * 2);
    };
    const g = this.buzzG;
    g.clear();
    g.fillStyle(COLORS.ink, 0.9);
    rect(g, 1, 2);
    if (this.buzz > 0) {
      g.fillStyle(this.buzzFull ? COLORS.yellow : COLORS.cyan, 1);
      rect(g, this.buzz, 0);
      g.fillStyle(0xffffff, 0.3);
      const x = dir === 1 ? x0 : x0 - this.buzz * w;
      g.fillRect(x, this.buzzY + 1, this.buzz * w, 2);
    }
    const glow = this.buzzGlow;
    glow.clear();
    glow.fillStyle(COLORS.yellow, 0.6);
    rect(glow, 1, 6);
  }

  preUpdate(_t: number, dt: number) {
    if (this.trail > this.shown) {
      this.trail = Math.max(this.shown, this.trail - dt * 0.0006);
      // ~1 px de barre par redessin, pas plus souvent.
      const px = Math.round(this.trail * this.barW);
      if (px !== this.trailPx) {
        this.trailPx = px;
        this.redraw();
      }
    }
  }

  /** Parallélogramme de la barre entre les fractions a et b (0 = bord extérieur). */
  private quad(g: Phaser.GameObjects.Graphics, a: number, b: number, inset = 0) {
    const dir = this.side === 'left' ? 1 : -1;
    const w = this.barW;
    const h = this.barH - inset * 2;
    // Bord gauche/droit incliné : en haut décalé de `slant` vers le centre.
    const x = (f: number, top: boolean) => dir * (f * w + (top ? this.slant : 0) + inset);
    const y0 = inset;
    const y1 = inset + h;
    g.beginPath();
    g.moveTo(x(a, true), y0);
    g.lineTo(x(b, true), y0);
    g.lineTo(x(b, false), y1);
    g.lineTo(x(a, false), y1);
    g.closePath();
  }

  private redraw() {
    const g = this.g;
    g.clear();
    // Fond
    g.fillStyle(COLORS.ink, 0.85);
    this.quad(g, 0, 1);
    g.fillPath();
    // Dégâts récents (rouge) puis vie restante (jaune), vidées depuis le centre.
    if (this.trail > 0) {
      g.fillStyle(COLORS.red, 1);
      this.quad(g, 0, this.trail, 3);
      g.fillPath();
    }
    if (this.shown > 0) {
      g.fillStyle(this.shown < 0.25 ? COLORS.pink : COLORS.yellow, 1);
      this.quad(g, 0, this.shown, 3);
      g.fillPath();
      // reflet
      g.fillStyle(0xffffff, 0.35);
      const dir = this.side === 'left' ? 1 : -1;
      g.fillRect(Math.min(0, dir * this.shown * this.barW) + dir * (this.slant + 6), 6, Math.max(0, this.shown * this.barW - this.slant - 12), 5);
    }
    // Contour noir épais
    g.lineStyle(5, COLORS.ink, 1);
    this.quad(g, 0, 1);
    g.strokePath();
  }
}
