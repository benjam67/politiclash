import { describe, expect, it } from 'vitest';
import { computeLayout } from '../../src/logic/layout';
import { SIM, STAGE } from '../../src/config/balance';
import assets from '../../src/config/assets.json';
import { STAGE_IDS, STAGES } from '../../src/config/stages';
import { minZoom } from '../../src/logic/camera';

// Formats d'écran en monde Phaser (hauteur 720, largeur étendue selon le ratio).
const SCREENS: [string, number, number][] = [
  ['iPhone 844×390', Math.round((844 / 390) * 720), 720],
  ['Android 20:9', 1600, 720],
  ['16:9', 1280, 720],
  ['4:3 (tablette)', 1280, 960],
];

describe('placement de la scène', () => {
  for (const [name, w, h] of SCREENS) {
    describe(name, () => {
      const L = computeLayout(w, h);

      it('affiche Bernard et Lola avec le même facteur d’échelle', () => {
        expect(L.left.scale).toBe(L.right.scale);
      });

      it('met Bernard à gauche, Lola à droite en miroir, sans chevauchement', () => {
        expect(L.left.flipX).toBe(false);
        expect(L.right.flipX).toBe(true);
        expect(L.left.right).toBeLessThan(L.right.left);
      });

      it('garde les combattants entièrement à l’écran', () => {
        for (const f of [L.left, L.right]) {
          expect(f.left).toBeGreaterThanOrEqual(0);
          expect(f.right).toBeLessThanOrEqual(w);
          expect(f.top).toBeGreaterThan(h * 0.15); // place pour l'interface en haut
          expect(f.y).toBeLessThanOrEqual(h);
        }
      });

      it('place le patron au centre, entre les combattants, au fond', () => {
        expect(L.patron.x).toBeGreaterThan(L.left.right);
        expect(L.patron.x).toBeLessThan(L.right.left);
        expect(L.patron.y).toBeLessThan(L.left.y);
      });

      it('aligne les 8 habitués au fond, à ~45 % de la taille des combattants', () => {
        expect(L.crowd).toHaveLength(8);
        const fighterFig = assets.fighters.aviateur.idle.height * L.fighterScale;
        const heights = L.crowd.map((c) => c.y - c.top).sort((a, b) => a - b);
        const median = (heights[3] + heights[4]) / 2;
        expect(median / fighterFig).toBeCloseTo(STAGE.crowdRatio, 2);
        for (const c of L.crowd) {
          expect(c.y).toBeLessThan(L.left.y);
          expect(c.x).toBeGreaterThan(0);
          expect(c.x).toBeLessThan(w);
        }
      });

      it('couvre tout l’écran avec le décor', () => {
        expect(L.decor.x).toBeLessThanOrEqual(0);
        expect(L.decor.y).toBeLessThanOrEqual(0);
        expect(L.decor.x + assets.props.decor.width * L.decor.scale).toBeGreaterThanOrEqual(w - 0.01);
        expect(L.decor.y + assets.props.decor.height * L.decor.scale).toBeGreaterThanOrEqual(h - 0.01);
      });
    });
  }
});

describe('décors larges (Élysée, République)', () => {
  for (const id of STAGE_IDS.filter((s) => STAGES[s].wide)) {
    const st = STAGES[id];
    for (const [name, w, h] of SCREENS) {
      it(`${id}, ${name} : l’image couvre l’écran et toute la largeur du niveau, sans miroir`, () => {
        const L = computeLayout(w, h, 'aviateur', 'tailleur', id, minZoom(w / (h / SIM.screenH)));
        const k = h / SIM.screenH;
        const levelW = st.widthScreens * SIM.screenW * k;
        expect(L.decor.y).toBeLessThanOrEqual(0);
        expect(L.decor.y + st.height * L.decor.scale).toBeGreaterThanOrEqual(h - 0.01);
        // Niveau centré sur l'écran : ses bords restent sur l'image.
        expect(L.decor.x).toBeLessThanOrEqual(w / 2 - levelW / 2 + 0.01);
        expect(L.decor.x + st.width * L.decor.scale).toBeGreaterThanOrEqual(w / 2 + levelW / 2 - 0.01);
        // Le sol de l'image est au-dessus des pieds des combattants.
        expect(L.decor.y + st.floorY * L.decor.scale).toBeLessThan(L.left.y);
      });
    }
  }
});
