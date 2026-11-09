// Page vie privée et mentions légales : lien depuis l'accueil, contenu, retour au jeu, le cookie à gifler.
import { expect, test } from '@playwright/test';
import { collectErrors, expectNoErrors, SHOTS, tapNamed, waitScene } from './helpers';

test('accueil → vie privée → retour au jeu ; aucun cookie déposé', async ({ page, context }) => {
  const errors = collectErrors(page);
  await context.addInitScript(() => localStorage.setItem('politiclash.save', JSON.stringify({ tutorialDone: true })));
  await page.goto('./');
  await waitScene(page, 'Title');
  await page.screenshot({ path: `${SHOTS}/vie-privee-lien.png` });
  await tapNamed(page, 'Title', 'link-privacy');
  await page.waitForURL(/vie-privee\.html$/);
  await expect(page.getByRole('heading', { name: 'Vie privée et mentions légales' })).toBeVisible();
  for (const h of ['En bref', 'Qui est responsable', 'Le jeu en ligne', 'Statistiques et fréquentation', 'Tes droits']) {
    await expect(page.getByRole('heading', { name: h })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'contact@france-bagarre.fr' }).first()).toHaveAttribute('href', 'mailto:contact@france-bagarre.fr');
  await page.getByRole('button', { name: 'Gifler le cookie' }).click();
  await expect(page.locator('#bubble')).toHaveText('PAF !');
  await page.screenshot({ path: `${SHOTS}/vie-privee.png`, fullPage: true });
  expect(await context.cookies()).toEqual([]);
  await page.getByRole('link', { name: 'Retour au jeu' }).click();
  await waitScene(page, 'Title');
  await expectNoErrors(errors);
});
