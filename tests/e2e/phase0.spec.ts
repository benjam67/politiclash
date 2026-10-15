import { expect, test } from '@playwright/test';
import { collectErrors, expectNoErrors, SHOTS, tapNamed, waitReady, waitScene, skipTutorial } from './helpers';

test('la scène de combat s’affiche sans erreur en paysage', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./?scene=fight&foe=idle');
  await waitReady(page, 'Fight');

  const info = await page.evaluate(() => {
    const g = window.__slap!.game!;
    type O = { texture?: { key: string }; flipX?: boolean; list?: O[] };
    const scene = g.scene.getScene('Fight') as unknown as { children: { list: O[] } };
    // Le décor, les figurants et les combattants sont dans le conteneur du niveau.
    const all = scene.children.list.flatMap((o) => [o, ...(o.list ?? [])]);
    return {
      size: [g.scale.width, g.scale.height],
      textures: all.filter((o) => o.texture).map((o) => ({ key: o.texture!.key, flipX: o.flipX })),
      layout: window.__slap!.layout as {
        left: { left: number; right: number; top: number };
        right: { left: number; right: number; top: number };
      },
      state: window.__slap!.state as { ids: { left: string; right: string }; stage: string; timeLeft: number },
    };
  });

  const keys = info.textures.map((t) => t.key);
  expect(keys).toContain('stage_bar');
  expect(keys).toContain('patron');
  expect(keys.filter((k) => k.startsWith('habitue_'))).toHaveLength(8);
  expect(info.textures.find((t) => t.key === 'aviateur_idle')?.flipX).toBe(false);
  expect(info.textures.find((t) => t.key === 'tailleur_idle')?.flipX).toBe(true);
  expect(info.state.ids).toEqual({ left: 'aviateur', right: 'tailleur' });
  expect(info.state.stage).toBe('bar');
  expect(info.state.timeLeft).toBe(60);
  // Combattants visibles en entier dans le monde du jeu.
  const [w] = info.size;
  expect(info.layout.left.left).toBeGreaterThanOrEqual(0);
  expect(info.layout.right.right).toBeLessThanOrEqual(w);

  await page.screenshot({ path: `${SHOTS}/phase0-scene.png` });
  await expectNoErrors(errors);
});

test('on peut choisir les combattants par l’URL, y compris en combat miroir', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./?scene=fight&p1=doyen&p2=doyen');
  await waitReady(page, 'Fight');
  const ids = await page.evaluate(() => (window.__slap!.state as { ids: unknown }).ids);
  expect(ids).toEqual({ left: 'doyen', right: 'doyen' });
  await page.screenshot({ path: `${SHOTS}/phase0-miroir.png` });
  await expectNoErrors(errors);
});

test('l’accueil porte le nouveau nom et le bouton JOUER mène au choix du personnage', async ({ page }) => {
  const errors = collectErrors(page);
  await skipTutorial(page);
  await page.goto('./');
  await waitReady(page, 'Title');
  await expect(page).toHaveTitle('France Bagarre');
  const title = await page.evaluate(() => {
    type O = { name: string; text?: string };
    const sc = window.__slap!.game!.scene.getScene('Title') as unknown as { children: { list: O[] } };
    return sc.children.list.find((o) => o.name === 'title')!.text;
  });
  expect(title).toBe('FRANCE BAGARRE');
  await page.screenshot({ path: `${SHOTS}/phase0-accueil.png` });
  await tapNamed(page, 'Title', 'btn-free');
  await waitScene(page, 'CharacterSelect');
  await expectNoErrors(errors);
});

test('écran « tourne ton téléphone » en portrait', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?scene=fight');
  await expect(page.locator('#rotate')).toBeVisible();
  await expect(page.locator('#rotate')).toContainText('Tourne ton téléphone');
  await page.screenshot({ path: `${SHOTS}/phase0-portrait.png` });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#rotate')).toBeHidden();
  await expectNoErrors(errors);
});

test('manifest PWA valide', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await request.get(new URL(href!, page.url()).toString());
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.name).toBe('France Bagarre');
  expect(m.display).toBe('fullscreen');
  expect(m.orientation).toBe('landscape');
  for (const icon of m.icons) {
    const r = await request.get(new URL(icon.src, page.url()).toString());
    expect(r.ok(), icon.src).toBe(true);
  }
});
