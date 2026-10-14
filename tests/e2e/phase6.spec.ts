import { expect, test, type Page } from '@playwright/test';
import { collectErrors, expectNoErrors, namesIn, SHOTS, tapNamed, waitReady, waitScene, waitState } from './helpers';

const st = <T = Record<string, unknown>>(page: Page) => page.evaluate(() => window.__slap!.state as unknown) as Promise<T>;

/** Joue le tutoriel à la place du joueur : fait ce que demande l'exercice en cours. */
const autoStudent = (page: Page) =>
  page.evaluate(() => {
    type F = { x: number; y: number; mode: string; charge: number };
    window.__slap!.inputs = {
      p1: () => {
        const s = window.__slap!.state as { step: number; p1: F; p2: F; tuto: { step: string; n: number; pause: number } | null };
        const t = s.tuto;
        if (!t || t.pause > 0) return {};
        const dx = s.p2.x - s.p1.x;
        const near = Math.abs(dx) < 120;
        const toward = dx > 0 ? { droite: true } : { gauche: true };
        const tick = s.step % 12 < 2;
        switch (t.step) {
          case 'walk':
            return { droite: true };
          case 'jumpCrouch':
            return s.step % 120 < 50 ? { haut: s.p1.y === 0 } : { bas: true };
          case 'slap':
            return near ? { gifle: tick } : toward;
          case 'kick':
            return near ? { pied: tick } : toward;
          case 'big':
            return near ? { grosseGifle: !(s.p1.mode === 'charge' && s.p1.charge >= 80) } : toward;
          case 'guard':
            return { garde: true };
          case 'buzz':
            return { grosseGifle: s.step % 90 > 2 };
        }
        return {};
      },
    };
  });

test.describe('phase 6 : tutoriel et sauvegarde', () => {
  test('premier lancement : JOUER ouvre le tutoriel, 7 exercices, puis le choix du combattant', async ({ page }) => {
    test.setTimeout(150_000);
    const errors = collectErrors(page);
    await page.goto('./');
    await waitReady(page, 'Title');
    // Pas encore de bouton « Tutoriel » : il n'apparaît qu'une fois le tutoriel vu.
    expect(await namesIn(page, 'Title')).not.toContain('btn-tutorial');
    await tapNamed(page, 'Title', 'btn-play');
    await waitScene(page, 'Fight');
    expect(await st(page)).toMatchObject({ tuto: { step: 'walk', index: 0 } });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/phase6-tuto-1-marche.png` });

    await autoStudent(page);
    for (const [step, shot] of [
      ['slap', 'gifle'],
      ['big', 'grosse-gifle'],
      ['guard', 'garde'],
      ['buzz', 'buzz'],
    ]) {
      await waitState(page, `s.tuto.step === '${step}' && s.tuto.pause === 0`, 40_000);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/phase6-tuto-${shot}.png` });
    }
    await waitState(page, `s.tuto.done`, 40_000);
    // Pendant tout le tutoriel, le chrono ne bouge pas et personne n'est K.O.
    expect(await st(page)).toMatchObject({ phase: 'fight', timeLeft: 60 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/phase6-tuto-fin.png` });
    await tapNamed(page, 'Fight', 'btn-tuto-go');
    await waitScene(page, 'CharacterSelect');

    // Au lancement suivant, JOUER mène directement au choix ; le tutoriel reste accessible.
    await page.goto('./');
    await waitReady(page, 'Title');
    expect(await namesIn(page, 'Title')).toContain('btn-tutorial');
    await tapNamed(page, 'Title', 'btn-play');
    await waitScene(page, 'CharacterSelect');
    await expectNoErrors(errors);
  });

  test('« Passer » sort du tutoriel et ne le propose plus', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./?scene=tuto');
    await waitReady(page, 'Fight');
    await tapNamed(page, 'Fight', 'btn-tuto-skip');
    await waitScene(page, 'CharacterSelect');
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('politiclash.save') ?? '{}'));
    expect(save.tutorialDone).toBe(true);
    await expectNoErrors(errors);
  });

  test('sauvegarde : dernier combattant, difficulté, lieu et victoires retrouvés après rechargement', async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      if (!localStorage.getItem('politiclash.save')) localStorage.setItem('politiclash.save', JSON.stringify({ tutorialDone: true }));
    });
    await page.goto('./');
    await waitReady(page, 'Title');
    await tapNamed(page, 'Title', 'btn-play');
    await waitScene(page, 'CharacterSelect');
    await tapNamed(page, 'CharacterSelect', 'card-doyen');
    await page.waitForFunction(() => (window.__slap!.state as { step: string }).step === 'p2');
    await tapNamed(page, 'CharacterSelect', 'card-cadet');
    await page.waitForFunction(() => (window.__slap!.state as { step: string }).step === 'level');
    await tapNamed(page, 'CharacterSelect', 'btn-level-hard');
    await waitScene(page, 'StageSelect');
    await tapNamed(page, 'StageSelect', 'card-bar');
    await waitScene(page, 'Fight');

    // Fin de match simulée : une victoire contre l'IA difficile.
    await page.evaluate(() =>
      window.__slap!.game!.scene.getScene('Fight').scene.start('Result', { ids: ['doyen', 'cadet'], stage: 'bar', winner: 0, wins: [2, 0], p2: 'ai', level: 'hard', autoplay: false }),
    );
    await waitScene(page, 'Result');

    await page.goto('./');
    await waitReady(page, 'Title');
    expect(await namesIn(page, 'Title')).toContain('title-wins');
    await tapNamed(page, 'Title', 'btn-play');
    await waitScene(page, 'CharacterSelect');
    expect(await st(page)).toMatchObject({ step: 'p1', left: 'doyen', level: 'hard' });
    await tapNamed(page, 'CharacterSelect', 'card-doyen');
    await page.waitForFunction(() => (window.__slap!.state as { step: string }).step === 'p2');
    await tapNamed(page, 'CharacterSelect', 'card-cadet');
    await page.waitForFunction(() => (window.__slap!.state as { step: string }).step === 'level');
    const names = await namesIn(page, 'CharacterSelect');
    expect(names).toContain('record-hard');
    expect(names).toContain('level-current');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/phase6-difficulte-sauvegardee.png` });
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('politiclash.save') ?? '{}'));
    expect(save).toMatchObject({ lastFighter: 'doyen', level: 'hard', lastStage: 'bar', record: { hard: { w: 1, l: 0 } } });
    await expectNoErrors(errors);
  });
});
