import { expect, test, type Page } from '@playwright/test';
import { collectErrors, cssPoint, expectNoErrors, freezeWhen, resume, SHOTS, waitReady, waitState } from './helpers';

interface P {
  x: number;
  action: string;
  mode: string;
  hp: number;
  guard: number;
  charge: number;
}
interface S {
  phase: string;
  round: number;
  wins: [number, number];
  p1: P;
  p2: P;
  hits: number;
  guardBreaks: number;
  lastHit: null | { move: string; dmg: number; crit: boolean; blocked: boolean; wrongGuard: boolean; knockdown: boolean; guardBreak: boolean };
  timeLeft: number;
}
const state = (page: Page) => page.evaluate(() => window.__slap!.state as unknown as S);
const fx = (page: Page) => page.evaluate(() => window.__slap!.fx as unknown as { flashes: number; numbers: number; onomatopoeia: number; comments: number; sounds: string[] });
const setInputs = (page: Page, p1: Record<string, boolean>, p2?: Record<string, boolean>) => page.evaluate(([a, b]) => (window.__slap!.inputs = b ? { p1: a, p2: b } : { p1: a }), [p1, p2] as const);

/** Avance le joueur 1 jusqu'au contact. */
async function approach(page: Page, p2: Record<string, boolean> = {}) {
  await setInputs(page, { droite: true }, p2);
  await waitState(page, 's.p2.x - s.p1.x < 90');
  await setInputs(page, {}, p2);
}

const IDLE = './?scene=fight&p1=aviateur&p2=doyen&foe=idle&intro=0';

test.describe('phase 2 : coups, garde, rounds', () => {
  test('gifle rapide au clavier : l’image change, les PV baissent, effets et son', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(IDLE);
    await waitReady(page, 'Fight');
    await approach(page);
    // L'image de la gifle ne dure que 350 ms : on la guette pas à pas (un sondage la raterait sur une machine chargée).
    const seen = freezeWhen(page, `s.p1.action === 'quickSlap'`);
    await page.keyboard.down('KeyJ');
    await seen;
    await resume(page);
    await waitState(page, `s.hits === 1`);
    await page.keyboard.up('KeyJ');
    const s = await state(page);
    expect(s.lastHit).toMatchObject({ move: 'quick', blocked: false, crit: false });
    // 5 dégâts, les mêmes pour tous.
    expect(s.p2.hp).toBeCloseTo(100 - 5, 5);
    await waitState(page, `s.p2.mode === 'free' && s.p1.mode === 'free'`);
    const f = await fx(page);
    expect(f.flashes).toBe(1);
    expect(f.numbers).toBe(1);
    expect(f.sounds).toContain('slap');
    expect(f.sounds).toContain('cry-doyen');
    await expectNoErrors(errors);
  });

  test('grosse gifle en zone dorée : jauge, critique, adversaire à terre', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(IDLE);
    await waitReady(page, 'Fight');
    await approach(page);
    // On maintient jusqu'à la zone dorée (78–90 %), puis on relâche.
    // Le relâchement est décidé pas par pas, d'après la charge (72 pas pour 100 % : 84 % = 6048 centièmes de pas).
    await page.evaluate(() => {
      let released = false;
      window.__slap!.inputs = {
        p1: (st) => {
          if (st.f[0].mode === 'charge' && st.f[0].chg >= 84 * 72) released = true;
          return released ? {} : { grosseGifle: true };
        },
      };
    });
    await freezeWhen(page, `s.p1.action === 'charge' && s.p1.charge > 60`);
    const gauge = await page.evaluate(() => (window.__slap!.game!.scene.getScene('Fight') as unknown as { gauge: { alpha: number } }).gauge.alpha);
    expect(gauge).toBeGreaterThan(0.5);
    await page.screenshot({ path: `${SHOTS}/phase2-charge.png` });
    await resume(page);
    await freezeWhen(page, `s.hits === 1`);
    const s = await state(page);
    expect(s.lastHit).toMatchObject({ move: 'big', crit: true, knockdown: true, blocked: false });
    // 13 × 84 % × 2 ≈ 21,8 PV.
    expect(s.lastHit!.dmg / 10).toBeGreaterThan(20);
    // L'adversaire est mis à terre dès l'impact.
    expect(s.p2.action).toBe('down');
    await page.screenshot({ path: `${SHOTS}/phase2-impact-critique.png` });
    await resume(page);
    await waitState(page, `s.p2.mode === 'free'`);
    const f = await fx(page);
    expect(f.onomatopoeia).toBe(1);
    expect(f.comments).toBeGreaterThanOrEqual(1);
    expect(f.sounds).toContain('slap-crit');
    await expectNoErrors(errors);
  });

  test('surchauffe : trop chargé, on se gifle soi-même', async ({ page }) => {
    await page.goto(IDLE);
    await waitReady(page, 'Fight');
    await setInputs(page, { grosseGifle: true });
    await waitState(page, `s.p1.action === 'selfSlap'`);
    await page.screenshot({ path: `${SHOTS}/phase2-surchauffe.png` });
    await setInputs(page, {});
    expect((await state(page)).p1.hp).toBe(92);
  });

  test('garde : le coup est bloqué, la jauge de garde baisse puis casse', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(IDLE);
    await waitReady(page, 'Fight');
    await approach(page, { garde: true });
    await page.evaluate(() => {
      // Une gifle toutes les demi-secondes, en restant collé.
      let n = 0;
      const id = setInterval(() => {
        n++;
        window.__slap!.inputs = { p1: n % 5 === 0 ? { gifle: true } : { droite: true }, p2: { garde: true } };
      }, 100);
      (window as unknown as { __stop: () => void }).__stop = () => clearInterval(id);
    });
    await waitState(page, `s.hits === 1`);
    let s = await state(page);
    expect(s.lastHit).toMatchObject({ blocked: true });
    // Coup bloqué : 10 % arrondis, au moins 1 PV.
    expect(s.p2.hp).toBe(99);
    expect(s.p2.guard).toBeLessThan(100);
    await page.screenshot({ path: `${SHOTS}/phase2-garde.png` });
    await waitState(page, `s.guardBreaks === 1`, 15_000);
    await page.screenshot({ path: `${SHOTS}/phase2-garde-brisee.png` });
    await page.evaluate(() => (window as unknown as { __stop: () => void }).__stop());
    await expectNoErrors(errors);
  });

  test('au tactile : le bouton GIFLE donne une gifle, GARDE fait garder', async ({ page }) => {
    await page.goto(IDLE);
    await waitReady(page, 'Fight');
    const cdp = await page.context().newCDPSession(page);
    const slap = await cssPoint(page, 'sc.touch.btns[0]');
    const guard = await cssPoint(page, 'sc.touch.btns[2]');
    let seen = freezeWhen(page, `s.p1.action === 'quickSlap'`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...slap, id: 1 }] });
    await seen;
    await resume(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await waitState(page, `s.p1.mode === 'free'`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...guard, id: 1 }] });
    await waitState(page, `s.p1.action === 'guard'`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await waitState(page, `s.p1.mode === 'free'`);
  });

  test('coup de pied et garde basse, au tactile', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(IDLE);
    await waitReady(page, 'Fight');
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number; id: number }[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    const kick = await cssPoint(page, 'sc.touch.btns[3]');
    const guard = await cssPoint(page, 'sc.touch.btns[2]');

    // Le bouton PIED donne un coup de pied ; l'adversaire, en garde haute, le prend quand même.
    await approach(page, { garde: true });
    await touch('touchStart', [{ ...kick, id: 1 }]);
    await freezeWhen(page, `s.hits === 1`);
    const s = await state(page);
    expect(s.lastHit).toMatchObject({ move: 'kick', blocked: false, wrongGuard: true });
    await page.screenshot({ path: `${SHOTS}/phase4b-coup-de-pied.png` });
    await resume(page);
    await touch('touchEnd', []);
    await waitState(page, `s.p1.mode === 'free'`);

    // GARDE seule : garde haute. GARDE + stick vers le bas : garde basse.
    await touch('touchStart', [{ ...guard, id: 1 }]);
    await waitState(page, `s.p1.action === 'guard'`);
    const o = { x: 150, y: 290 };
    await touch('touchStart', [
      { ...guard, id: 1 },
      { ...o, id: 2 },
    ]);
    await touch('touchMove', [
      { ...guard, id: 1 },
      { x: o.x, y: o.y + 45, id: 2 },
    ]);
    await waitState(page, `s.p1.action === 'guardLow'`);
    await page.screenshot({ path: `${SHOTS}/phase4b-garde-basse.png` });
    await touch('touchEnd', []);
    await waitState(page, `s.p1.mode === 'free'`);
    await expectNoErrors(errors);
  });

  test('au clavier : I donne un coup de pied, bas + I une balayette', async ({ page }) => {
    await page.goto(IDLE);
    await waitReady(page, 'Fight');
    let seen = freezeWhen(page, `s.p1.action === 'kick'`);
    await page.keyboard.down('KeyI');
    await seen;
    await resume(page);
    await page.keyboard.up('KeyI');
    await waitState(page, `s.p1.mode === 'free'`);
    await page.keyboard.down('ArrowDown');
    seen = freezeWhen(page, `s.p1.action === 'crouchKick'`);
    await page.keyboard.down('KeyI');
    await seen;
    await resume(page);
    await page.keyboard.up('KeyI');
    await page.keyboard.up('ArrowDown');
  });

  test('un match complet : annonces, K.O., deux rounds, écran de résultat, revanche', async ({ page }) => {
    test.setTimeout(150_000);
    const errors = collectErrors(page);
    await page.goto('./?scene=fight&p1=aviateur&p2=doyen&foe=idle');
    await waitReady(page, 'Fight');
    expect((await state(page)).phase).toBe('intro');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/phase2-annonce-round.png` });
    await waitState(page, `s.phase === 'fight'`);
    // Le joueur colle l'adversaire et enchaîne les gifles rapides.
    await page.evaluate(() => {
      let n = 0;
      setInterval(() => {
        n++;
        if (window.__slap!.scene === 'Fight') window.__slap!.inputs = { p1: n % 2 === 0 ? { gifle: true, droite: true } : { droite: true } };
      }, 90);
    });
    await waitState(page, `s.phase === 'roundEnd'`, 60_000);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/phase2-ko.png` });
    let s = await state(page);
    expect(s.wins).toEqual([1, 0]);
    expect(s.p2.hp).toBe(0);
    expect(s.p2.action).toBe('dazed');
    expect(s.p1.action).toBe('victory');
    await waitState(page, `s.round === 2 && s.phase === 'fight'`, 15_000);
    s = await state(page);
    expect(s.p2.hp).toBe(100);
    expect(s.timeLeft).toBeGreaterThan(55);
    await page.waitForFunction(() => window.__slap?.scene === 'Result', null, { timeout: 60_000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/phase2-resultat.png` });
    const res = await page.evaluate(() => {
      type O = { name: string; text?: string; x: number; y: number };
      const g = window.__slap!.game!;
      const sc = g.scene.getScene('Result') as unknown as { children: { list: O[] } };
      const find = (n: string) => sc.children.list.find((o) => o.name === n)!;
      const k = g.scale.displayScale;
      return { state: window.__slap!.state, title: find('result-title').text, score: find('result-score').text, again: { x: find('btn-again').x / k.x, y: find('btn-again').y / k.y } };
    });
    expect(res.state).toMatchObject({ mode: 'result', winner: 0, wins: [2, 0] });
    expect(res.title).toBe('MANU EST ÉLU !');
    expect(res.score).toBe('2 – 0');
    await page.touchscreen.tap(res.again.x, res.again.y);
    await waitReady(page, 'Fight');
    s = await state(page);
    expect(s.round).toBe(1);
    expect(s.wins).toEqual([0, 0]);
    await expectNoErrors(errors);
  });

  test('contre le mannequin : il attaque, des coups sont échangés, aucune erreur', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=fight&p1=aviateur&p2=doyen&foe=dummy&intro=0&seed=11');
    await waitReady(page, 'Fight');
    await setInputs(page, { droite: true });
    await waitState(page, `s.p1.hp < 100`, 40_000);
    await page.screenshot({ path: `${SHOTS}/phase2-mannequin.png` });
    await expectNoErrors(errors);
  });
});
