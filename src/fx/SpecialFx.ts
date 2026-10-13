import Phaser from 'phaser';
import { ROSTER } from '../config/roster';
import type { SpecialDef, SpecialEffect } from '../config/specials';
import { specialOf, SUB, type FightState } from '../logic/fight';
import { COLORS } from '../ui/theme';

/** Point de l'écran correspondant à un point du niveau (px logiques, y au-dessus du sol). */
type ToScreen = (x: number, y: number) => { x: number; y: number };

export interface SpecialFxStats {
  specials: number;
  launches: number;
  signals: number;
  impacts: number;
  projectiles: number;
  particles: number;
}

/**
 * Effets des coups spéciaux : paillettes, danse, mousse et éclats de verre, onde de choc,
 * projectile qui tournoie, petit nuage. Uniquement de l'affichage : tout le déroulé (poses, signal,
 * impact) vient de l'état de la simulation, ces effets se contentent de le suivre.
 */
export class SpecialFx {
  readonly stats: SpecialFxStats = { specials: 0, launches: 0, signals: 0, impacts: 0, projectiles: 0, particles: 0 };
  private glitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private stars: Phaser.GameObjects.Particles.ParticleEmitter;
  private foam: Phaser.GameObjects.Particles.ParticleEmitter;
  private shards: Phaser.GameObjects.Particles.ParticleEmitter;
  private splat: Phaser.GameObjects.Particles.ParticleEmitter;
  private projectile: Phaser.GameObjects.Image | null = null;
  /** Dernier pas de cinématique traité (les effets répétés partent une fois par pas). */
  private lastT = -1;
  private k = 1;

  constructor(
    private scene: Phaser.Scene,
    /** Texture d'un accessoire : le dessin fourni s'il est chargé, sinon le projectile provisoire. */
    private propKey: (name: string) => string,
  ) {
    const mk = (key: string, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig) => scene.add.particles(0, 0, key, { emitting: false, ...cfg }).setDepth(46);
    this.glitter = mk('fx_glitter', {
      speed: { min: 60, max: 260 },
      lifespan: { min: 500, max: 1100 },
      scale: { start: 1.2, end: 0.2 },
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      tint: [0xffd23c, 0xfff1a8, 0xffb000, 0xffffff],
      blendMode: Phaser.BlendModes.ADD,
    });
    this.stars = mk('fx_bigstar', { speed: { min: 160, max: 520 }, lifespan: 900, scale: { start: 0.9, end: 0.3 }, rotate: { min: -180, max: 180 }, gravityY: 500, alpha: { start: 1, end: 0 } });
    this.foam = mk('fx_foam', { speed: { min: 80, max: 380 }, lifespan: 700, scale: { start: 1, end: 0.4 }, gravityY: 900, alpha: { start: 1, end: 0.2 } });
    this.shards = mk('fx_shard', { speed: { min: 300, max: 820 }, lifespan: 900, rotate: { min: -180, max: 180 }, gravityY: 1300, scale: { min: 0.7, max: 1.3 } });
    this.splat = mk('fx_foam', { speed: { min: 150, max: 560 }, lifespan: 650, scale: { start: 1.1, end: 0.3 }, gravityY: 1000, tint: 0x7a4a22 });
  }

  /** `k` : px de l'écran par px logique, zoom de la caméra compris. */
  setScale(k: number) {
    this.k = k;
  }

  start() {
    this.stats.specials++;
    this.lastT = -1;
    this.clearProjectile();
  }

  /** Suit la cinématique en cours : effets continus, projectile. Appelé à chaque image. */
  update(s: FightState, at: ToScreen) {
    const c = s.cine;
    if (!c) return;
    const L = s.f[c.who];
    const V = s.f[c.who === 0 ? 1 : 0];
    const sp = specialOf(L.id);
    const fresh = c.t !== this.lastT;
    this.lastT = c.t;
    const dir = L.facing;
    const lx = L.x / SUB;
    const vx = V.x / SUB;
    const h = ROSTER[L.id].body.stand.h;

    if (fresh) this.continuous(sp.effect, sp, c.t, at, lx, vx, dir, h);

    // Projectile : il part de la main (ou de l'arrière) et arrive sur la victime à l'impact.
    if (sp.launch !== undefined && sp.prop && c.t >= sp.launch && !c.done) {
      const u = Math.min(1, (c.t - sp.launch) / Math.max(1, sp.impact - sp.launch));
      const fromY = sp.effect === 'wind' ? h * 0.42 : h * 0.72;
      const toY = ROSTER[V.id].body.stand.h * 0.7;
      const x = lx + dir * 40 + (vx - lx - dir * 40) * u;
      const arc = sp.effect === 'throw' ? 70 : 24;
      const y = fromY + (toY - fromY) * u + arc * 4 * u * (1 - u);
      const p = at(x, y);
      if (!this.projectile) {
        this.stats.projectiles++;
        this.projectile = this.scene.add.image(p.x, p.y, this.propKey(sp.prop)).setDepth(47);
      }
      const size = (sp.effect === 'throw' ? 110 : 80) * this.k;
      this.projectile
        .setPosition(p.x, p.y)
        .setScale(size / Math.max(this.projectile.width, this.projectile.height))
        .setFlipX(dir === -1)
        .setAngle(sp.spin ? dir * c.t * (sp.effect === 'throw' ? 24 : 8) : 0);
    }
  }

  /** Effets qui accompagnent le déroulé, une fois par pas. */
  private continuous(effect: SpecialEffect, sp: SpecialDef, t: number, at: ToScreen, lx: number, vx: number, dir: number, h: number) {
    switch (effect) {
      case 'glitter':
        // Poudre dans la main, puis soufflée en nuage vers l'adversaire.
        if (t < sp.poses[0] && t % 3 === 0) this.emit(this.glitter, at(lx + dir * 30, h * 0.62), 2);
        if (t >= sp.poses[0] && t < sp.impact) {
          const u = (t - sp.poses[0]) / Math.max(1, sp.impact - sp.poses[0]);
          this.emit(this.glitter, at(lx + dir * (30 + (vx - lx) * dir * u * 0.9), h * (0.8 - u * 0.15)), 4);
        }
        break;
      case 'dance':
        if (t < sp.poses[1] && t % 7 === 0) {
          const p = at(lx + dir * (t % 14 === 0 ? -40 : 40), h * 1.05);
          this.note(p.x, p.y);
        }
        break;
      case 'beer':
        // La mousse déborde pendant qu'il boit.
        if (t >= sp.poses[0] && t < sp.poses[1] && t % 3 === 0) this.emit(this.foam, at(lx + dir * 26, h * 0.9), 1);
        break;
      case 'shout':
        // Onde de choc : des anneaux partent de la bouche et filent sur l'adversaire.
        if (sp.launch !== undefined && t >= sp.launch && t < sp.impact && (t - sp.launch) % 5 === 0) {
          const from = at(lx + dir * 30, h * 0.86);
          const to = at(vx, h * 0.7);
          const ms = ((sp.impact - t) * 1000) / 60;
          const ring = this.scene.add.image(from.x, from.y, 'fx_ring').setDepth(46).setScale(0.3 * this.k).setAlpha(0.95);
          this.scene.tweens.add({ targets: ring, x: to.x, y: to.y, scale: 1.2 * this.k, alpha: 0.35, duration: ms, ease: 'Quad.In', onComplete: () => ring.destroy() });
        }
        break;
      case 'wind':
        if (t === sp.launch) this.cloud(at(lx + dir * 36, h * 0.42), 1);
        break;
      case 'throw':
        break;
    }
  }

  launch() {
    this.stats.launches++;
  }

  /** Le signal : un éclair et un point d'exclamation au-dessus de la victime. */
  signal(p: { x: number; y: number }) {
    this.stats.signals++;
    const alert = this.scene.add.image(p.x, p.y - 40 * this.k, 'fx_alert').setDepth(74).setScale(0.3);
    this.scene.tweens.add({ targets: alert, scale: 1.1, duration: 90, ease: 'Back.Out' });
    this.scene.tweens.add({ targets: alert, alpha: 0, delay: 260, duration: 160, onComplete: () => alert.destroy() });
    const ring = this.scene.add.image(p.x, p.y + 70 * this.k, 'fx_ring').setDepth(73).setScale(0.2).setTint(COLORS.yellow);
    this.scene.tweens.add({ targets: ring, scale: 1.4, alpha: 0, duration: 260, ease: 'Quad.Out', onComplete: () => ring.destroy() });
  }

  /** L'impact : l'effet propre au coup, plus fort quand il n'a pas été paré. */
  impact(effect: SpecialEffect, p: { x: number; y: number }, dir: number, parried: boolean) {
    this.stats.impacts++;
    this.clearProjectile();
    const n = parried ? 0.5 : 1;
    switch (effect) {
      case 'glitter': {
        this.emit(this.glitter, p, Math.round(70 * n));
        const boom = this.scene.add.image(p.x, p.y, 'fx_ring').setDepth(47).setTint(0xffc93c).setScale(0.3);
        this.scene.tweens.add({ targets: boom, scale: 3.2 * n + 0.6, alpha: 0, duration: 520, ease: 'Cubic.Out', onComplete: () => boom.destroy() });
        break;
      }
      case 'dance':
        this.emit(this.stars, p, Math.round(12 * n));
        break;
      case 'beer':
        this.emit(this.shards, p, Math.round(22 * n));
        this.emit(this.foam, p, Math.round(16 * n));
        break;
      case 'shout':
        for (let i = 0; i < 3; i++) {
          const ring = this.scene.add.image(p.x, p.y, 'fx_ring').setDepth(47).setScale(0.4);
          this.scene.tweens.add({ targets: ring, scale: 2.4 + i, alpha: 0, delay: i * 70, duration: 420, ease: 'Quad.Out', onComplete: () => ring.destroy() });
        }
        break;
      case 'throw':
        this.emit(this.shards, p, Math.round(8 * n));
        this.emit(this.stars, p, Math.round(6 * n));
        break;
      case 'wind':
        this.emit(this.splat, p, Math.round(18 * n));
        this.cloud({ x: p.x + dir * 20, y: p.y }, 1.6);
        break;
    }
  }

  end() {
    this.clearProjectile();
    this.lastT = -1;
  }

  private emit(e: Phaser.GameObjects.Particles.ParticleEmitter, p: { x: number; y: number }, count: number) {
    if (count <= 0) return;
    this.stats.particles++;
    e.explode(count, p.x, p.y);
  }

  private note(x: number, y: number) {
    this.stats.particles++;
    const img = this.scene.add.image(x, y, Phaser.Math.Between(0, 1) ? 'fx_note' : 'fx_bigstar').setDepth(46).setScale(0.8 * this.k + 0.2);
    this.scene.tweens.add({ targets: img, y: y - 60, angle: Phaser.Math.Between(-30, 30), alpha: 0, duration: 700, ease: 'Sine.Out', onComplete: () => img.destroy() });
  }

  private cloud(p: { x: number; y: number }, size: number) {
    this.stats.particles++;
    const img = this.scene.add.image(p.x, p.y, 'fx_cloud').setDepth(46).setScale(0.4 * size).setAlpha(0.95);
    this.scene.tweens.add({ targets: img, scale: 1.3 * size, alpha: 0, y: p.y - 30, duration: 800, ease: 'Quad.Out', onComplete: () => img.destroy() });
  }

  private clearProjectile() {
    this.projectile?.destroy();
    this.projectile = null;
  }
}
