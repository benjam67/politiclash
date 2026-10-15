import Phaser from 'phaser';
import { ONLINE, REACTIONS } from '../config/texts';
import { loadSave, updateSave } from '../logic/save';
import { makeButton } from './button';
import { COLORS, CSS, FLAG, FONT_UI } from './theme';

/**
 * Réactions en ligne, partagées entre le salon (choix des candidats) et le combat :
 * le bouton 💬, le menu des phrases toutes prêtes, la bulle, la limite d'envoi et la coupure.
 */

/** Au plus une réaction toutes les 1,5 s (compté sur tout le jeu, pas par écran). */
const MIN_GAP_MS = 1500;
let lastSent = -Infinity;

export const reactionsMuted = () => loadSave().muteReactions;

/** Bouton 💬 qui ouvre et ferme le menu. */
export function reactButton(scene: Phaser.Scene, onTap: () => void) {
  const b = scene.add.text(0, 0, '💬', { fontSize: '40px' }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setName('btn-react');
  b.on('pointerup', onTap);
  return b;
}

export class ReactionMenu {
  private items: Phaser.GameObjects.GameObject[] = [];

  /**
   * `send(i)` est appelé quand le joueur choisit une phrase (et seulement si la limite d'envoi le permet).
   * `y` : hauteur de la première ligne de boutons.
   */
  constructor(
    private scene: Phaser.Scene,
    private send: (i: number) => void,
    private y = 150,
    private depth = 140,
  ) {}

  get open() {
    return this.items.length > 0;
  }

  close() {
    for (const o of this.items) o.destroy();
    this.items = [];
  }

  toggle() {
    if (this.open) {
      this.close();
      return;
    }
    const { width } = this.scene.scale;
    const muted = reactionsMuted();
    const items = [...REACTIONS, muted ? ONLINE.muteOn : ONLINE.muteOff];
    const w = 190;
    // Une ligne jusqu'à 8 boutons, sinon deux lignes.
    const perRow = items.length > 8 ? Math.ceil(items.length / 2) : items.length;
    items.forEach((label, i) => {
      const mute = i === REACTIONS.length;
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, items.length - row * perRow);
      const x0 = width / 2 - ((inRow - 1) * (w + 8)) / 2;
      const color = mute ? (muted ? COLORS.pink : FLAG.white) : FLAG.blue;
      const b = makeButton(this.scene, x0 + (i % perRow) * (w + 8), this.y + row * 56, label, color, () => {
        if (mute) updateSave((sv) => ({ ...sv, muteReactions: !sv.muteReactions }));
        else trySend(() => this.send(i));
        this.close();
      }, { w, h: 46, font: 16 })
        .setDepth(this.depth)
        .setName(mute ? 'btn-react-mute' : `btn-react-${i}`);
      this.items.push(b);
    });
  }
}

function trySend(go: () => void) {
  const now = performance.now();
  if (now - lastSent < MIN_GAP_MS) return;
  lastSent = now;
  go();
}

/**
 * Bulle de réaction pendant 2 s, posée par son bas en (x, y). `mine` : envoyée par ce téléphone.
 * Celles de l'adversaire ne s'affichent pas si le joueur les a coupées.
 */
export function reactionBubble(scene: Phaser.Scene, x: number, y: number, i: number, who: 0 | 1, mine: boolean, depth = 120) {
  if (!mine && reactionsMuted()) return;
  const text = REACTIONS[i];
  if (!text) return;
  const bubble = scene.add
    .text(x, y, text, { fontFamily: FONT_UI, fontStyle: '800', fontSize: '22px', color: CSS.ink, backgroundColor: CSS.cream, padding: { x: 12, y: 6 } })
    .setOrigin(0.5, 1)
    .setDepth(depth)
    .setName(`reaction-${who}`);
  // Garde la bulle dans l'écran.
  const half = bubble.width / 2 + 8;
  bubble.x = Phaser.Math.Clamp(x, half, scene.scale.width - half);
  if (window.__slap) {
    const w = window.__slap as unknown as { reactions?: string[] };
    (w.reactions ??= []).push(`${who}:${text}`);
  }
  scene.tweens.add({ targets: bubble, y: y - 30, alpha: 0, delay: 1600, duration: 400, onComplete: () => bubble.destroy() });
}
