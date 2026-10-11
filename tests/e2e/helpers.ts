import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';

export const SHOTS = 'screenshots';
fs.mkdirSync(SHOTS, { recursive: true });

/** Erreurs console et JS de la page (les polices Google bloquées par le réseau de test sont ignorées). */
export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.location().url.includes('fonts.g')) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => {
    if (!r.url().includes('fonts.g')) errors.push(`requête échouée : ${r.url()}`);
  });
  return errors;
}

export async function waitReady(page: Page, scene?: 'Title' | 'Fight') {
  await page.waitForFunction((s) => window.__slap?.ready === true && (!s || window.__slap?.scene === s), scene, { timeout: 30_000 });
  await page.waitForTimeout(300);
}

export async function expectNoErrors(errors: string[]) {
  expect(errors, errors.join('\n')).toEqual([]);
}
