import { expect, test, type Page } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { collectErrors, cssPoint, expectNoErrors, freezeWhen, resume, SHOTS, waitReady, waitState } from './helpers';

// Phase 5 : barre Buzz, bouton « Buzz » et son cercle, les six cinématiques, garde au bon moment.
const FIGHTERS = ['aviateur', 'tailleur', 'cadet', 'barbe', 'doyen', 'binocle'] as const;

interface P5 {
  specials: number;
  dodges: number;
  buzzButton: boolean;
  cine: { t: number; who: number; parry: number; done: boolean } | null;
  p1: { hp: number; buzz: number; ring: number; mode: string; action: string; pose: string };
  p2: { hp: number; buzz: number; mode: string; action: string; dizzy: number };
}
const state = (page: Page) => page.evaluate(() => window.__slap!.state as unknown as P5);
const fx = (page: Page) => page.evaluate(() => window.__slap!.fx as unknown as { sounds: string[]; special: Record<string, number> });

test.describe('phase 5 : Buzz et coups spéciaux', () => {
  test('au tactile : barre pleine, le bouton devient « Buzz », le cercle se remplit, la cinématique part', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=fight&p1=cadet&p2=doyen&foe=idle&intro=0&buzz=100&touch=1&seed=4');
    await waitReady(page, 'Fight');
    await waitState(page, 's.buzzButton === true');
    const label = await page.evaluate(() => (window.__slap!.game!.scene.getScene('Fight') as unknown as { touch: { btns: { label: { text: string } }[] } }).touch.btns[1].label.text);
    expect(label).toBe('BUZZ');
    await page.screenshot({ path: `${SHOTS}/phase5-bouton-buzz.png` });

    const cdp = await page.context().newCDPSession(page);
    const big = await cssPoint(page, 'sc.touch.btns[1]');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: big.x, y: big.y, id: 1 }] });
    await freezeWhen(page, 's.p1.ring >= 0.5');
    expect((await state(page)).p1.mode).toBe('buzz');
    await page.screenshot({ path: `${SHOTS}/phase5-cercle.png` });
    await resume(page);
    await waitState(page, 's.cine !== null');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // Pendant la cinématique, le bouton redevient « Grosse gifle ».
    await waitState(page, 's.buzzButton === false');
    await waitState(page, 's.cine === null && s.specials === 1', 10_000);
    const s = await state(page);
    expect(s.p2.hp).toBe(65);
    expect(s.p1.buzz).toBe(0);
    await expectNoErrors(errors);
  });

  test('relâché trop tôt, le cercle s’annule et la barre reste pleine', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=fight&p1=aviateur&p2=doyen&foe=idle&intro=0&buzz=100');
    await waitReady(page, 'Fight');
    // On arrête le jeu à mi-cercle pour relâcher la touche à coup sûr avant la fin (0,5 s, c'est court).
    const seen = freezeWhen(page, 's.p1.ring > 0.2');
    await page.keyboard.down('KeyK');
    await seen;
    await page.keyboard.up('KeyK');
    await resume(page);
    await waitState(page, `s.p1.mode === 'free'`);
    await page.waitForTimeout(800);
    const s = await state(page);
    expect(s.specials).toBe(0);
    expect(s.p1.buzz).toBe(100);
    await expectNoErrors(errors);
  });

  test('la barre se remplit en giflant, puis le bouton devient « Buzz »', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=fight&p1=binocle&p2=tailleur&foe=idle&intro=0&touch=1');
    await waitReady(page, 'Fight');
    // Collé à l'adversaire, une gifle toutes les 0,4 s.
    await page.evaluate(() => {
      let n = 0;
      const id = setInterval(() => {
        n++;
        const s = window.__slap!.state as unknown as { p1: { x: number }; p2: { x: number } };
        const near = Math.abs(s.p2.x - s.p1.x) < 80;
        window.__slap!.inputs = { p1: near ? (n % 4 === 0 ? { gifle: true } : {}) : { droite: true } };
      }, 100);
      (window as unknown as { __stop: () => void }).__stop = () => clearInterval(id);
    });
    await waitState(page, 's.p1.buzz > 0 && s.p1.buzz < 100', 10_000);
    await page.screenshot({ path: `${SHOTS}/phase5-barre-buzz.png` });
    await waitState(page, 's.p1.buzz === 100 && s.buzzButton === true', 30_000);
    await page.evaluate(() => (window as unknown as { __stop: () => void }).__stop());
    expect((await fx(page)).sounds).toContain('powerup');
    await page.screenshot({ path: `${SHOTS}/phase5-barre-pleine.png` });
    await expectNoErrors(errors);
  });

  for (const id of FIGHTERS) {
    test(`cinématique du coup spécial : ${id}`, async ({ page }) => {
      const errors = collectErrors(page);
      const foe = id === 'doyen' ? 'aviateur' : 'doyen';
      await page.goto(`./?scene=fight&p1=${id}&p2=${foe}&foe=idle&intro=0&buzz=100&seed=2`);
      await waitReady(page, 'Fight');
      const poses: string[] = [];
      // Chaque moment est guetté pas à pas : le jeu s'arrête dessus le temps de la photo.
      let first = true;
      for (const [name, cond] of [
        ['pose1', `s.cine && s.p1.action === 'special1'`],
        ['pose2', `s.cine && s.p1.action === 'special2'`],
        ['impact', `s.cine && s.cine.done`],
      ] as const) {
        const seen = freezeWhen(page, cond);
        if (first) await page.keyboard.down('KeyK');
        await seen;
        if (first) await page.keyboard.up('KeyK');
        first = false;
        poses.push((await state(page)).p1.pose);
        await page.screenshot({ path: `${SHOTS}/phase5-special-${id}-${name}.png` });
        await resume(page);
      }
      await waitState(page, 's.cine === null && s.specials === 1', 10_000);
      const s = await state(page);
      expect(s.p2.hp).toBe(65);
      expect(s.p2.dizzy).toBeGreaterThan(0);
      const f = await fx(page);
      expect(f.sounds.some((x) => x.startsWith('special-') && !x.startsWith('special-hit'))).toBe(true);
      expect(f.sounds).toContain('signal');
      expect(f.special.impacts).toBe(1);
      expect(new Set(poses).size).toBeGreaterThanOrEqual(2);
      await expectNoErrors(errors);
    });
  }

  test('garde au bon moment : 18 PV au lieu de 35', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=fight&p1=doyen&p2=cadet&foe=idle&intro=0&buzz=100');
    await waitReady(page, 'Fight');
    // La victime met la garde 2 pas après le signal (`specials.ts` : hurlement, signal au pas 50).
    await page.evaluate(() => {
      window.__slap!.inputs = { p2: (s: { cine: { t: number } | null }) => (s.cine && s.cine.t + 1 >= 52 ? { garde: true } : {}) } as never;
    });
    const started = freezeWhen(page, 's.cine !== null');
    await page.keyboard.down('KeyK');
    await started;
    await page.keyboard.up('KeyK');
    await resume(page);
    await freezeWhen(page, 's.cine && s.cine.done');
    await page.screenshot({ path: `${SHOTS}/phase5-garde-au-bon-moment.png` });
    await resume(page);
    await waitState(page, 's.cine === null', 10_000);
    expect((await state(page)).p2.hp).toBe(82);
    expect((await fx(page)).sounds).toContain('parry');
    await expectNoErrors(errors);
  });

  test('démo IA contre IA : les deux lancent des coups spéciaux', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./?autoplay=1&p1=barbe&p2=tailleur&level=hard&intro=0&buzz=100&seed=8');
    await waitReady(page, 'Fight');
    await waitState(page, 's.specials >= 2', 40_000);
    await page.screenshot({ path: `${SHOTS}/phase5-demo.png` });
    await expectNoErrors(errors);
  });

  test('une image se calcule en moins de 8 ms pendant un coup spécial, processeur ralenti 4 fois', async ({ page }) => {
    await page.goto('./?scene=fight&p1=aviateur&p2=cadet&foe=idle&intro=0&buzz=100&seed=3');
    await waitReady(page, 'Fight');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    // Le joueur relance le coup spécial dès que sa barre est vide (paillettes, explosion : le plus chargé en effets).
    await page.evaluate(() => {
      window.__slap!.inputs = {
        p1: (st: { f: { buzz: number; mode: string; hp: number }[]; cine: unknown; step: number }) => {
          if (st.f[0].buzz < 100 && !st.cine) st.f[0].buzz = 100;
          // L'adversaire garde de la vie : le match ne s'arrête pas pendant la mesure.
          if (st.f[1].hp < 500) st.f[1].hp = 1000;
          return st.step % 50 < 4 ? {} : { grosseGifle: true };
        },
      } as never;
    });
    await waitState(page, 's.cine !== null', 15_000);
    const ms = await page.evaluate(
      () =>
        new Promise<{ mean: number; max: number }>((resolve) => {
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
              const kept = times.slice(0, Math.floor(times.length * 0.95));
              resolve({ mean: kept.reduce((a, b) => a + b, 0) / kept.length, max: kept[kept.length - 1] });
            }
          };
          ev.on('prestep', pre);
          ev.on('postrender', post);
        }),
    );
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log(`calcul d'une image pendant les coups spéciaux (CPU ×4) : ${ms.mean.toFixed(2)} ms en moyenne, ${ms.max.toFixed(2)} ms au pire`);
    expect((await state(page)).specials).toBeGreaterThanOrEqual(1);
    expect(ms.mean).toBeLessThan(8);
  });

  test('chargement initial de moins de 4 Mo (compressé comme sur GitHub Pages)', async ({ page }) => {
    const sizes: { url: string; bytes: number }[] = [];
    const pending: Promise<void>[] = [];
    page.on('response', (r) => {
      // Les adresses blob: sont des copies locales faites par le moteur du jeu, pas des téléchargements.
      if (r.url().includes('fonts.g') || !r.url().startsWith('http')) return;
      pending.push(
        r
          .body()
          .then((b) => {
            const type = r.headers()['content-type'] ?? '';
            const text = /javascript|css|html|json|svg|text/.test(type);
            sizes.push({ url: r.url(), bytes: text ? gzipSync(b).length : b.length });
          })
          .catch(() => undefined),
      );
    });
    await page.goto('./');
    await waitReady(page, 'Title');
    await Promise.all(pending);
    const total = sizes.reduce((a, b) => a + b.bytes, 0);
    console.log(`chargement initial : ${(total / 1024 / 1024).toFixed(2)} Mo, ${sizes.length} fichiers`);
    expect(total).toBeLessThan(4 * 1024 * 1024);
  });
});
