import { expect, test, type Page } from '@playwright/test';
import { waitReady } from './helpers';

/** Temps de calcul par image (logique + affichage) sur 120 images, les 5 % les plus lents écartés. */
const frameTimes = (page: Page) =>
  page.evaluate(
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

test.describe('phase 7a : charge du jeu en ligne', () => {
  // Pire cas : à chaque pas, 8 pas rejoués et une empreinte calculée, pendant un combat entre deux IA
  // avec coups spéciaux. En vrai, il y a environ 3 retours en arrière par seconde, pas 60.
  test('retour en arrière de 8 pas à chaque image : moins de 8 ms par image, processeur ralenti 4 fois', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('./?autoplay=1&p1=doyen&p2=barbe&level=hard&intro=0&buzz=100&seed=4&rollback=8');
    await waitReady(page, 'Fight');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.waitForTimeout(1500);
    const ms = await frameTimes(page);
    const rb = await page.evaluate(() => {
      const list = [...((window.__slap!.state as { rollbackMs: number[] }).rollbackMs ?? [])].sort((a, b) => a - b);
      const kept = list.slice(0, Math.floor(list.length * 0.95));
      return { mean: kept.reduce((a, b) => a + b, 0) / kept.length, max: kept[kept.length - 1], n: list.length };
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log(`image entière avec 8 pas rejoués (CPU ×4) : ${ms.mean.toFixed(2)} ms en moyenne, ${ms.max.toFixed(2)} ms au pire`);
    console.log(`dont retour en arrière seul : ${rb.mean.toFixed(2)} ms en moyenne, ${rb.max.toFixed(2)} ms au pire (${rb.n} mesures)`);
    expect(rb.n).toBeGreaterThan(60);
    expect(rb.max).toBeLessThan(8);
    expect(ms.mean).toBeLessThan(8);
    expect(ms.max).toBeLessThan(16.7);
  });
});
