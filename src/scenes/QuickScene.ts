import Phaser from 'phaser';
import { sfx } from '../audio/sfx';
import { PLAYABLE_IDS } from '../config/roster';
import { STAGE_IDS } from '../config/stages';
import { QUICK } from '../config/texts';
import { loadSave } from '../logic/save';
import { currentQuick, quickSearch, type QuickSearch } from '../net/quick';
import { menuBackdrop } from '../ui/backdrop';
import { makeButton } from '../ui/button';
import { safeInsets } from '../ui/safe';
import { COLORS, CSS, FLAG, FLAG_CSS, flagBand, FONT_TITLE, FONT_UI } from '../ui/theme';
import type { FightData } from './FightScene';

/** Personne en vue au bout de ce délai : on propose un match contre l'IA en attendant. */
export const AI_OFFER_S = 30;

/**
 * Primaire ouverte : recherche d'un adversaire. Nombre de joueurs en ligne, temps d'attente, Annuler.
 * Au bout de 30 s, proposition de jouer contre l'IA en attendant (toujours annoncée comme IA).
 */
export class QuickScene extends Phaser.Scene {
  private items: Phaser.GameObjects.GameObject[] = [];
  private q!: QuickSearch;
  private off: (() => void) | null = null;
  private message = '';
  private lastKey = '';
  private aiOfferS = AI_OFFER_S;

  constructor() {
    super('Quick');
  }

  init(data: { message?: string }) {
    this.items = [];
    this.message = data?.message ?? '';
    this.lastKey = '';
    // Essais : `?quickwait=3` propose l'IA au bout de 3 s au lieu de 30.
    const w = Number(new URLSearchParams(location.search).get('quickwait'));
    this.aiOfferS = w > 0 ? w : AI_OFFER_S;
  }

  create() {
    this.q = quickSearch();
    this.q.autoAccept = true;
    if (!this.q.available) this.message = QUICK.errors.unavailable;
    else if (this.q.state !== 'searching' && this.q.state !== 'found' && this.q.state !== 'linking') this.q.search();
    this.off = this.q.listen({
      change: () => this.build(),
      ready: () => this.scene.start('Room'),
      error: (e) => {
        this.message = QUICK.errors[e] ?? QUICK.errors.server;
        this.build();
      },
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.rebuild, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.off?.();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.rebuild, this);
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => {
      sfx.unlock();
      sfx.startMusic();
    });
    this.build();
    if (window.__slap) {
      window.__slap.ready = true;
      window.__slap.scene = 'Quick';
    }
  }

  update() {
    // Le temps d'attente s'affiche à la seconde : on ne redessine que quand il change.
    this.build();
  }

  private rebuild() {
    this.lastKey = '';
    this.build();
  }

  private waited() {
    return this.q.state === 'searching' || this.q.state === 'found' ? Math.floor((performance.now() - this.q.since) / 1000) : 0;
  }

  private build() {
    const q = this.q;
    const waited = this.waited();
    const offerAi = q.state === 'searching' && waited >= this.aiOfferS;
    const key = [q.state, q.online, waited, offerAi, this.message, this.scale.width, this.scale.height].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;
    for (const o of this.items) o.destroy();
    this.items = [];
    const { width, height } = this.scale;
    const safe = safeInsets(this);
    const side = Math.max(safe.left, safe.right);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.items.push(o), o);
    const text = (y: number, s: string, size: number, color: string, title = false) =>
      add(
        this.add
          .text(width / 2, y, s, title ? { fontFamily: FONT_TITLE, fontSize: `${size}px`, color, stroke: CSS.ink, strokeThickness: Math.round(size / 4), align: 'center' } : { fontFamily: FONT_UI, fontStyle: '800', fontSize: `${size}px`, color, stroke: CSS.ink, strokeThickness: 5, align: 'center', wordWrap: { width: width * 0.7 } })
          .setOrigin(0.5),
      );

    add(menuBackdrop(this, 0x6d6478));
    add(this.add.rectangle(0, 0, width, height, COLORS.ink, 0.5).setOrigin(0));
    flagBand(this, width / 2, 50, width * 1.3, 72, -2).forEach(add);
    text(48, QUICK.title, 40, FLAG_CSS.white, true).setAngle(-2).setName('quick-title');

    let line = QUICK.searching;
    if (q.state === 'linking' || q.state === 'found') line = QUICK.linking;
    if (this.message) line = this.message;
    text(height * 0.36, line, 34, FLAG_CSS.white, true).setName('quick-status');
    if (q.state === 'searching' || q.state === 'found') text(height * 0.47, QUICK.waited(waited), 22, CSS.cream).setName('quick-waited');
    if (q.online > 0) text(height * 0.55, QUICK.online(q.online), 18, CSS.cream).setName('quick-online');

    if (offerAi) {
      text(height * 0.64, QUICK.nobody, 18, CSS.cream);
      add(makeButton(this, width / 2, height * 0.75, QUICK.playAi, FLAG.blue, () => this.playAi(), { w: 460, h: 64, font: 22 }).setDepth(4).setName('btn-quick-ai'));
    }
    // Ancienne version : bouton pour recharger la page (la nouvelle version se charge).
    if (this.message === QUICK.errors.outdated) {
      add(makeButton(this, width / 2, height * 0.66, QUICK.update, FLAG.blue, () => location.reload(), { w: 320, h: 64, font: 24 }).setDepth(4).setName('btn-quick-update'));
    }
    const back = this.message && q.state === 'error' ? 'RETOUR' : QUICK.cancel;
    add(makeButton(this, width / 2, Math.min(height * 0.9, height - safe.bottom - 40), back, COLORS.cream, () => this.leave(), { w: 220, h: 54, font: 22 }).setDepth(4).setName('btn-quick-cancel'));
    void side;
    if (window.__slap) window.__slap.state = { mode: 'quick', state: q.state, online: q.online, waited, offerAi, message: this.message };
  }

  /** Match contre l'IA en attendant : on reste dans la file ; si un adversaire arrive, le joueur choisit de le rejoindre. */
  private playAi() {
    this.q.reportWait('ai');
    const save = loadSave();
    const left = save.lastFighter ?? PLAYABLE_IDS[Math.floor(Math.random() * PLAYABLE_IDS.length)];
    const others = PLAYABLE_IDS.filter((id) => id !== left);
    const data: FightData = {
      left,
      right: others[Math.floor(Math.random() * others.length)],
      stage: STAGE_IDS[Math.floor(Math.random() * STAGE_IDS.length)],
      p2: 'ai',
      level: save.level,
      quickWait: true,
    };
    this.scene.start('Fight', data);
  }

  private leave() {
    currentQuick()?.close();
    this.scene.start('Title');
  }
}
