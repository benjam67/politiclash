import { expect, test } from '@playwright/test';
import { collectErrors, cssPoint, expectNoErrors, getState, SHOTS, waitReady, waitState } from './helpers';

const URL = './?scene=fight&p1=bernard&p2=lola&foe=idle&intro=0';

test.describe('phase 1 : déplacements en temps réel', () => {
  test('au clavier : marche, saut, accroupi, et l’image change', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(URL);
    await waitReady(page, 'Fight');
    const start = await getState(page);
    expect(start.p1.action).toBe('idle');
    expect(start.p1.facing).toBe(1);
    expect(start.p2.facing).toBe(-1);

    await page.keyboard.down('ArrowLeft');
    await waitState(page, `s.p1.action === 'walk' && s.p1.x < ${start.p1.x - 40}`);
    await page.screenshot({ path: `${SHOTS}/phase1-marche.png` });
    await page.keyboard.up('ArrowLeft');
    await waitState(page, `s.p1.action === 'idle'`);

    // ZQSD (touches physiques : KeyD est la touche D).
    const before = (await getState(page)).p1.x;
    await page.keyboard.down('KeyD');
    await waitState(page, `s.p1.x > ${before + 30}`);
    await page.keyboard.up('KeyD');

    await page.keyboard.down('ArrowUp');
    await waitState(page, `s.p1.action === 'jump' && s.p1.y > 85`);
    await page.screenshot({ path: `${SHOTS}/phase1-saut.png` });
    await page.keyboard.up('ArrowUp');
    await waitState(page, `s.p1.action === 'idle' && s.p1.y === 0`);

    await page.keyboard.down('ArrowDown');
    await waitState(page, `s.p1.action === 'crouch'`);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${SHOTS}/phase1-accroupi.png` });
    await page.keyboard.up('ArrowDown');
    await waitState(page, `s.p1.action === 'idle'`);
    await expectNoErrors(errors);
  });

  test('au tactile : le stick déplace le joueur, les boutons sont lus', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(URL);
    await waitReady(page, 'Fight');
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number; id: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    const start = await getState(page);

    // Pouce gauche : on pose, on glisse vers la droite.
    const o = { x: 150, y: 290 };
    await touch('touchStart', [{ ...o, id: 1 }]);
    await touch('touchMove', [{ x: o.x + 45, y: o.y, id: 1 }]);
    await waitState(page, `s.p1.action === 'walk' && s.p1.x > ${start.p1.x + 30}`);
    await page.screenshot({ path: `${SHOTS}/phase1-tactile-stick.png` });

    // Vers le haut : saut. Vers le bas : accroupi.
    await touch('touchMove', [{ x: o.x, y: o.y - 45, id: 1 }]);
    await waitState(page, `s.p1.action === 'jump'`);
    await touch('touchMove', [{ x: o.x, y: o.y + 45, id: 1 }]);
    await waitState(page, `s.p1.action === 'crouch'`);

    // Pouce droit en même temps sur un bouton : le stick continue de répondre.
    const slap = await cssPoint(page, 'sc.touch.btns[0]');
    await touch('touchMove', [
      { x: o.x, y: o.y + 45, id: 1 },
      { x: slap.x, y: slap.y, id: 2 },
    ]);
    const read = await page.evaluate(() => (window.__slap!.game!.scene.getScene('Fight') as unknown as { touch: { read: () => Record<string, boolean> } }).touch.read());
    expect(read.gifle).toBe(true);
    expect(read.bas).toBe(true);
    await page.screenshot({ path: `${SHOTS}/phase1-tactile-boutons.png` });

    await touch('touchEnd', []);
    await waitState(page, `s.p1.action === 'idle'`);
    await expectNoErrors(errors);
  });

  test('les contrôles tactiles ne recouvrent ni les barres de vie ni le centre de l’écran', async ({ page }) => {
    await page.goto(URL);
    await waitReady(page, 'Fight');
    const boxes = await page.evaluate(() => {
      const g = window.__slap!.game!;
      const sc = g.scene.getScene('Fight') as unknown as { touch: { btns: { x: number; y: number; r: number }[]; rest: { x: number; y: number } }; scale: { width: number; height: number } };
      return { w: sc.scale.width, h: sc.scale.height, btns: sc.touch.btns.map((b) => ({ x: b.x, y: b.y, r: b.r })), stick: sc.touch.rest };
    });
    for (const b of boxes.btns) {
      expect(b.y - b.r).toBeGreaterThan(boxes.h * 0.3); // sous les barres de vie
      expect(b.x - b.r).toBeGreaterThan(boxes.w * 0.72); // dans le coin droit
      expect(b.x + b.r).toBeLessThanOrEqual(boxes.w);
      expect(b.y + b.r).toBeLessThanOrEqual(boxes.h);
    }
    expect(boxes.stick.x + 78).toBeLessThan(boxes.w * 0.28);
  });

  test('l’adversaire se promène, les deux se font face, la caméra suit', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=fight&p1=bernard&p2=lola&foe=wander&intro=0&seed=3');
    await waitReady(page, 'Fight');
    const start = await getState(page);
    await waitState(page, `Math.abs(s.p2.x - ${start.p2.x}) > 40`, 15_000);

    // Le joueur passe de l'autre côté en sautant : les deux se retournent.
    await page.evaluate(() => (window.__slap!.inputs = { p1: { droite: true }, p2: {} }));
    await waitState(page, `s.p2.x - s.p1.x < 70`);
    await page.evaluate(() => (window.__slap!.inputs = { p1: { droite: true, haut: true }, p2: {} }));
    await waitState(page, `s.p1.action === 'jump'`);
    await page.evaluate(() => (window.__slap!.inputs = { p1: {}, p2: {} }));
    await waitState(page, `s.p1.action === 'idle' && s.p1.x > s.p2.x && s.p1.facing === -1 && s.p2.facing === 1`);
    await page.screenshot({ path: `${SHOTS}/phase1-retournement.png` });

    // Les deux partent vers la droite jusqu'au mur : la caméra les suit et s'arrête au bord du niveau.
    await page.evaluate(() => (window.__slap!.inputs = { p1: { droite: true }, p2: { droite: true } }));
    await waitState(page, `s.p1.x === 1548`, 20_000);
    await page.waitForTimeout(600);
    const end = await getState(page);
    expect(end.camera.x).toBeCloseTo(1688 - 422, 0);
    expect(end.camera.x).toBeGreaterThan(start.camera.x + 300);
    await page.screenshot({ path: `${SHOTS}/phase1-bord-du-niveau.png` });
    await expectNoErrors(errors);
  });

  // Le bac à sable de test n'a pas de carte graphique : l'image y est calculée par le processeur, et le
  // nombre d'images par seconde n'y veut rien dire. On mesure donc le temps de calcul du jeu par image
  // (logique + préparation de l'affichage), processeur ralenti 4 fois : il doit tenir largement dans
  // les 16,7 ms d'une image à 60 par seconde.
  test('une image se calcule en moins de 8 ms avec un processeur ralenti 4 fois', async ({ page }) => {
    await page.goto('./?scene=fight&p1=bernard&p2=lola&intro=0&seed=3');
    await waitReady(page, 'Fight');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate(() => (window.__slap!.inputs = { p1: { droite: true, gifle: true } }));
    await page.waitForTimeout(1500);
    const ms = await page.evaluate(
      () =>
        new Promise<{ mean: number; max: number; frames: number }>((resolve) => {
          const ev = window.__slap!.game!.events;
          const times: number[] = [];
          let t0 = 0;
          const pre = () => (t0 = performance.now());
          const post = () => {
            times.push(performance.now() - t0);
            if (times.length >= 120) {
              ev.off('prestep', pre);
              ev.off('postrender', post);
              times.sort((a, b) => a - b);
              // On écarte les 5 % les plus lents (ramasse-miettes du navigateur).
              const kept = times.slice(0, Math.floor(times.length * 0.95));
              resolve({ mean: kept.reduce((a, b) => a + b, 0) / kept.length, max: kept[kept.length - 1], frames: times.length });
            }
          };
          ev.on('prestep', pre);
          ev.on('postrender', post);
        }),
    );
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log(`calcul d'une image (CPU ×4) : ${ms.mean.toFixed(2)} ms en moyenne, ${ms.max.toFixed(2)} ms au pire`);
    expect(ms.mean).toBeLessThan(8);
    expect(ms.max).toBeLessThan(16.7);
  });
});
