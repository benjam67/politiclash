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

export interface FighterInfo {
  x: number;
  y: number;
  facing: 1 | -1;
  action: string;
}
export interface FightInfo {
  step: number;
  hash: number;
  p1: FighterInfo;
  p2: FighterInfo;
  camera: { x: number; zoom: number };
  fps: number;
}

export const getState = (page: Page) => page.evaluate(() => window.__slap!.state as unknown as FightInfo);

/** Attend qu'une condition sur l'état du combat (`s`) devienne vraie. */
export const waitState = (page: Page, cond: string, timeout = 8000) =>
  page.waitForFunction((c) => new Function('s', `return (${c});`)(window.__slap?.state), cond, { timeout });

/** Position et taille à l'écran (px CSS) d'un objet de la scène de combat, désigné par une expression sur la scène `sc`. */
export const cssPoint = (page: Page, expr: string) =>
  page.evaluate((e) => {
    const g = window.__slap!.game!;
    const sc = g.scene.getScene('Fight');
    const o = new Function('sc', `return (${e});`)(sc) as { x: number; y: number };
    return { x: o.x / g.scale.displayScale.x, y: o.y / g.scale.displayScale.y };
  }, expr);

/**
 * Met la boucle du jeu en pause dès que `cond` (sur l'état `s`) devient vrai, pour photographier
 * ou contrôler l'instant exact d'un effet. `resume` relance le jeu.
 */
export async function freezeWhen(page: Page, cond: string, timeout = 15_000) {
  await page.evaluate((c) => {
    const check = new Function('s', `return (${c});`) as (s: unknown) => boolean;
    const w = window as unknown as { __froze?: boolean };
    w.__froze = false;
    const game = window.__slap!.game!;
    const onStep = () => {
      if (window.__slap?.state && check(window.__slap.state)) {
        game.events.off('poststep', onStep);
        game.loop.sleep();
        w.__froze = true;
      }
    };
    game.events.on('poststep', onStep);
  }, cond);
  await page.waitForFunction(() => (window as unknown as { __froze?: boolean }).__froze === true, null, { timeout });
}
export const resume = (page: Page) => page.evaluate(() => window.__slap!.game!.loop.wake());
