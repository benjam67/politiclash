// Statistiques de jeu : fiches envoyées au vrai serveur local (Worker et Durable Object), puis page privée.
import { expect, test } from '@playwright/test';
import { SHOTS } from './helpers';

const SERVER = 'http://127.0.0.1:8787';
const GAME = { Origin: 'http://localhost:4173' };
const card = {
  mode: 'libre',
  f: ['aviateur', 'doyen'],
  human: [true, false],
  winner: 0,
  stage: 'assemblee',
  level: 'hard',
  secs: 95,
  rounds: 2,
  dealt: [
    [100, 0, 70, 0, 260, 350],
    [50, 70, 0, 60, 0, 0],
  ],
  forfeit: false,
};

test('fiches reçues, refusées hors du jeu, puis lues avec la clé sur la page des statistiques', async ({ page, request }) => {
  // Fiche correcte depuis le jeu : acceptée.
  expect((await request.post(`${SERVER}/stats/match`, { headers: GAME, data: card })).status()).toBe(200);
  expect((await request.post(`${SERVER}/stats/match`, { headers: GAME, data: { ...card, mode: 'campagne', winner: 1 } })).status()).toBe(200);
  expect((await request.post(`${SERVER}/stats/campaign`, { headers: GAME, data: { event: 'start', fighter: 'aviateur' } })).status()).toBe(200);
  // Fiche incorrecte, ou venue d'un autre site : refusée.
  expect((await request.post(`${SERVER}/stats/match`, { headers: GAME, data: { ...card, f: ['aviateur', 'x'] } })).status()).toBe(400);
  expect((await request.post(`${SERVER}/stats/match`, { headers: { Origin: 'https://ailleurs.example' }, data: card })).status()).toBe(403);
  // Lecture : sans la bonne clé, refusée.
  expect((await request.get(`${SERVER}/stats/data?key=mauvaise`)).status()).toBe(403);
  const data = (await (await request.get(`${SERVER}/stats/data?key=essai-stats&days=1`)).json()) as { rows: [string, string, number][] };
  expect(data.rows.some(([, k]) => k === 'pick|libre|aviateur')).toBe(true);

  // La page : mauvaise clé, puis la bonne.
  await page.goto(`stats.html?server=${SERVER}&key=mauvaise`);
  await expect(page.getByText('Clé refusée.')).toBeVisible();
  await page.locator('input[name=key]').fill('essai-stats');
  await page.getByRole('button', { name: 'Ouvrir' }).click();
  await expect(page.getByRole('heading', { name: 'Les candidats' })).toBeVisible();
  // Manu Macs : la grosse gifle (260) est derrière le spécial (350) : son coup de prédilection est son spécial.
  await expect(page.locator('tr', { hasText: 'Manu Macs' }).first()).toContainText('Poudre de perlimpinpin (spécial)');
  await expect(page.getByRole('cell', { name: 'Présidentielle', exact: true })).toBeVisible();
  // La clé ne reste pas dans l'adresse, mais le réglage du serveur oui.
  expect(page.url()).not.toContain('key=');
  expect(page.url()).toContain('server=');
  await page.screenshot({ path: `${SHOTS}/stats-page.png`, fullPage: true });
  // Changer de période recharge sans redemander la clé.
  await page.getByRole('button', { name: 'Depuis le début' }).click();
  await expect(page.getByRole('heading', { name: 'Les candidats' })).toBeVisible();
});
