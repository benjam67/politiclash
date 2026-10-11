import { expect, test, type Page } from '@playwright/test';
import { collectErrors, expectNoErrors, namesIn, SHOTS, tapNamed, waitReady, waitScene, waitState } from './helpers';

const st = <T = Record<string, unknown>>(page: Page) => page.evaluate(() => window.__slap!.state as unknown) as Promise<T>;

test.describe('phase 3 : IA', () => {
  test('contre l’IA : elle s’approche et attaque, des coups sont échangés', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=fight&level=hard&intro=0&seed=5');
    await waitReady(page, 'Fight');
    expect(await st(page)).toMatchObject({ foe: 'ai', level: 'hard', autoplay: false });
    await waitState(page, `s.p1.hp < 100`, 30_000);
    await page.screenshot({ path: `${SHOTS}/phase3-ia.png` });
    await expectNoErrors(errors);
  });

  test('démo ?autoplay=1 : deux IA jouent un match entier jusqu’au résultat', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    await page.goto('./?autoplay=1&level=hard&seed=2');
    await waitReady(page, 'Fight');
    expect(await st(page)).toMatchObject({ autoplay: true });
    // En démo, pas de contrôles tactiles à l'écran.
    const shown = await page.evaluate(() => (window.__slap!.game!.scene.getScene('Fight') as unknown as { touch: { visible: boolean } }).touch.visible);
    expect(shown).toBe(false);
    await waitState(page, `s.hits >= 3`, 60_000);
    await page.screenshot({ path: `${SHOTS}/phase3-demo.png` });
    await waitScene(page, 'Result', 200_000);
    await expectNoErrors(errors);
  });
});

test.describe('phase 4 : choix du personnage et du niveau', () => {
  test('parcours complet au tactile : accueil → personnage → adversaire → difficulté → lieu → combat', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./');
    await waitReady(page, 'Title');
    await tapNamed(page, 'Title', 'btn-JOUER');
    await waitScene(page, 'CharacterSelect');
    expect(await st(page)).toMatchObject({ step: 'p1', left: null });
    // 6 cases : les combattants disponibles et des cases « Bientôt ».
    const names = await namesIn(page, 'CharacterSelect');
    expect(names.filter((n) => n.startsWith('card-'))).toHaveLength(6);
    expect(names).toContain('card-aviateur');
    expect(names).toContain('card-tailleur');
    expect(names.filter((n) => n.startsWith('card-soon-'))).toHaveLength(4);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/phase4-choix-perso.png` });

    // Une case « Bientôt » ne fait rien.
    await tapNamed(page, 'CharacterSelect', 'card-soon-2');
    expect(await st(page)).toMatchObject({ step: 'p1' });

    await tapNamed(page, 'CharacterSelect', 'card-tailleur');
    await page.waitForFunction(() => (window.__slap!.state as { step: string }).step === 'p2');
    expect(await st(page)).toMatchObject({ left: 'tailleur' });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/phase4-choix-adversaire.png` });

    await tapNamed(page, 'CharacterSelect', 'card-aviateur');
    await page.waitForFunction(() => (window.__slap!.state as { step: string }).step === 'level');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/phase4-difficulte.png` });
    await tapNamed(page, 'CharacterSelect', 'btn-level-easy');

    await waitScene(page, 'StageSelect');
    expect(await st(page)).toMatchObject({ left: 'tailleur', right: 'aviateur', level: 'easy' });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/phase4-choix-lieu.png` });
    await tapNamed(page, 'StageSelect', 'card-bar');

    await waitScene(page, 'Fight');
    expect(await st(page)).toMatchObject({ ids: { left: 'tailleur', right: 'aviateur' }, stage: 'bar', foe: 'ai', level: 'easy' });
    await expectNoErrors(errors);
  });

  test('retour en arrière à chaque étape, adversaire au hasard, combat miroir', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./');
    await waitReady(page, 'Title');
    await tapNamed(page, 'Title', 'btn-JOUER');
    await waitScene(page, 'CharacterSelect');
    const step = (s: string) => page.waitForFunction((v) => (window.__slap!.state as { step: string }).step === v, s);

    await tapNamed(page, 'CharacterSelect', 'card-aviateur');
    await step('p2');
    await tapNamed(page, 'CharacterSelect', 'btn-back');
    await step('p1');
    await tapNamed(page, 'CharacterSelect', 'card-aviateur');
    await step('p2');
    await tapNamed(page, 'CharacterSelect', 'btn-AU HASARD');
    await step('level');
    expect(await st(page)).toMatchObject({ random: true, right: null });
    await tapNamed(page, 'CharacterSelect', 'btn-back');
    await step('p2');
    // Même combattant des deux côtés.
    await tapNamed(page, 'CharacterSelect', 'card-aviateur');
    await step('level');
    await tapNamed(page, 'CharacterSelect', 'btn-level-normal');
    await waitScene(page, 'StageSelect');
    await tapNamed(page, 'StageSelect', 'btn-back');
    await waitScene(page, 'CharacterSelect');
    // Le combattant choisi est proposé de nouveau.
    expect(await st(page)).toMatchObject({ step: 'p1', left: 'aviateur', level: 'normal' });
    await tapNamed(page, 'CharacterSelect', 'card-aviateur');
    await step('p2');
    await tapNamed(page, 'CharacterSelect', 'card-aviateur');
    await step('level');
    await tapNamed(page, 'CharacterSelect', 'btn-level-hard');
    await waitScene(page, 'StageSelect');
    await tapNamed(page, 'StageSelect', 'btn-AU HASARD');
    await waitScene(page, 'Fight');
    expect(await st(page)).toMatchObject({ ids: { left: 'aviateur', right: 'aviateur' }, level: 'hard' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/phase4-miroir.png` });
    await expectNoErrors(errors);
  });

  test('après le match : « Autre combat » ramène au choix du personnage', async ({ page }) => {
    test.setTimeout(150_000);
    const errors = collectErrors(page);
    await page.goto('./?scene=fight&foe=idle&p1=tailleur&p2=aviateur&level=hard');
    await waitReady(page, 'Fight');
    await page.evaluate(() => {
      let n = 0;
      setInterval(() => {
        n++;
        if (window.__slap!.scene === 'Fight') window.__slap!.inputs = { p1: n % 2 === 0 ? { gifle: true, droite: true } : { droite: true } };
      }, 90);
    });
    await waitScene(page, 'Result', 120_000);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/phase4-resultat.png` });
    await tapNamed(page, 'Result', 'btn-AUTRE COMBAT');
    await waitScene(page, 'CharacterSelect');
    expect(await st(page)).toMatchObject({ step: 'p1', left: 'tailleur', level: 'hard' });
    await expectNoErrors(errors);
  });
});
