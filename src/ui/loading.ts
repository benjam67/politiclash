import Phaser from 'phaser';

/** Barre de chargement au centre de l'écran, pendant le `preload` d'une scène (rien si tout est déjà chargé). */
export function showLoadingBar(scene: Phaser.Scene) {
  const { width, height } = scene.scale;
  const barW = Math.min(420, width * 0.5);
  const frame = scene.add.rectangle(width / 2, height / 2, barW + 8, 26, 0x1a1020).setStrokeStyle(4, 0xfff7e8).setVisible(false);
  const bar = scene.add.rectangle(width / 2 - barW / 2, height / 2, 1, 18, 0xffc93c).setOrigin(0, 0.5).setVisible(false);
  scene.load.on('progress', (p: number) => {
    frame.setVisible(true);
    bar.setVisible(true);
    bar.width = Math.max(1, barW * p);
  });
  scene.load.once('complete', () => {
    frame.destroy();
    bar.destroy();
  });
}
