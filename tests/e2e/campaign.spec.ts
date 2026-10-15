import { expect, test, type Page } from '@playwright/test';
import { collectErrors, expectNoErrors, namesIn, SHOTS, skipTutorial, tapNamed, waitReady, waitScene } from './helpers';

const st = <T = Record<string, unknown>>(page: Page) => page.evaluate(() => window.__slap!.state as unknown) as Promise<T>;
const save = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('politiclash.save') ?? '{}'));

interface CampaignInfo {
  fighter: string;
  foe: string;
  order: string[];
  beaten: number;
  retries: number;
  level: string;
}

/** Fin de match simulée depuis l'écran de combat : le joueur gagne (winner 0) ou perd (1). */
async function finish(page: Page, winner: 0 | 1) {
  await page.evaluate((w) => {
    const sc = window.__slap!.game!.scene.getScene('Fight') as unknown as { ids: string[]; stageId: string; level: string; scene: { start: (k: string, d: unknown) => void } };
    sc.scene.start('Result', { ids: sc.ids, stage: sc.stageId, winner: w, wins: w === 0 ? [2, 0] : [0, 2], p2: 'ai', level: sc.level, autoplay: false, campaign: true });
  }, winner);
}

test.describe('campagne présidentielle', () => {
  test('battre les 5 rivaux à la suite, avec un recomptage, une reprise après fermeture et la scène finale', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    await skipTutorial(page);
    await page.goto('./');
    await waitReady(page, 'Title');
    const names = await namesIn(page, 'Title');
    expect(names).toEqual(expect.arrayContaining(['btn-campaign', 'btn-free', 'btn-online', 'btn-tutorial']));
    await page.screenshot({ path: `${SHOTS}/campagne-accueil.png` });

    // Choix du candidat : une seule étape, puis l'écran du prochain adversaire.
    await tapNamed(page, 'Title', 'btn-campaign');
    await waitScene(page, 'CharacterSelect');
    expect(await st(page)).toMatchObject({ campaign: true, step: 'p1' });
    await tapNamed(page, 'CharacterSelect', 'card-tailleur');
    await tapNamed(page, 'CharacterSelect', 'btn-confirm');
    await waitScene(page, 'Campaign');
    let c = await st<CampaignInfo>(page);
    expect(c).toMatchObject({ fighter: 'tailleur', beaten: 0, retries: 0, level: 'easy' });
    expect(c.order).toHaveLength(5);
    expect(c.order).not.toContain('tailleur');
    const order = c.order;
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/campagne-prochain-adversaire-1.png` });

    // Match 1, joué pour de vrai : l'adversaire ne bouge pas, le joueur gifle jusqu'au K.O.
    await tapNamed(page, 'Campaign', 'btn-go');
    await waitScene(page, 'Fight');
    expect(await st(page)).toMatchObject({ ids: { left: 'tailleur', right: order[0] }, level: 'easy', campaign: { i: 1, n: 5 } });
    await page.evaluate(() => {
      type F = { x: number };
      window.__slap!.inputs = {
        p2: {},
        p1: () => {
          const s = window.__slap!.state as { step: number; p1: F; p2: F };
          const dx = s.p2.x - s.p1.x;
          return Math.abs(dx) < 110 ? { gifle: s.step % 14 < 2 } : dx > 0 ? { droite: true } : { gauche: true };
        },
      };
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/campagne-combat.png` });
    await waitScene(page, 'Result', 90_000);
    expect(await st(page)).toMatchObject({ winner: 0, campaign: { beaten: 1, retries: 0 } });
    expect(await namesIn(page, 'Result')).toEqual(expect.arrayContaining(['btn-next', 'btn-home', 'result-campaign-line']));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/campagne-victoire-contestee.png` });

    // Match 2 (Normal) : défaite, recomptage contre le même rival.
    await tapNamed(page, 'Result', 'btn-next');
    await waitScene(page, 'Campaign');
    expect(await st(page)).toMatchObject({ foe: order[1], beaten: 1, level: 'normal' });
    await tapNamed(page, 'Campaign', 'btn-go');
    await waitScene(page, 'Fight');
    await finish(page, 1);
    await waitScene(page, 'Result');
    expect(await st(page)).toMatchObject({ winner: 1, campaign: { beaten: 1, retries: 1 } });
    expect(await namesIn(page, 'Result')).toEqual(expect.arrayContaining(['btn-rematch', 'btn-abandon', 'btn-home']));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/campagne-defaite.png` });
    await tapNamed(page, 'Result', 'btn-rematch');
    await waitScene(page, 'Fight');
    expect(await st(page)).toMatchObject({ ids: { right: order[1] }, level: 'normal', campaign: { i: 2 } });
    await finish(page, 0);
    await waitScene(page, 'Result');

    // On ferme le jeu : la campagne reprend où elle en était.
    await page.goto('./');
    await waitReady(page, 'Title');
    expect(await namesIn(page, 'Title')).toContain('btn-resume');
    expect(await namesIn(page, 'Title')).not.toContain('btn-campaign');
    await tapNamed(page, 'Title', 'btn-resume');
    await waitScene(page, 'Campaign');
    c = await st<CampaignInfo>(page);
    expect(c).toMatchObject({ order, beaten: 2, retries: 1, foe: order[2], level: 'normal' });

    // Matchs 3 à 5 : Normal, puis Difficile, Difficile.
    for (const [i, level] of [[2, 'normal'], [3, 'hard'], [4, 'hard']] as const) {
      await waitScene(page, 'Campaign');
      expect(await st(page)).toMatchObject({ beaten: i, foe: order[i], level });
      if (i === 4) {
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${SHOTS}/campagne-dernier-adversaire.png` });
      }
      await tapNamed(page, 'Campaign', 'btn-go');
      await waitScene(page, 'Fight');
      expect(await st(page)).toMatchObject({ ids: { right: order[i] }, level });
      await finish(page, 0);
      if (i < 4) {
        await waitScene(page, 'Result');
        await tapNamed(page, 'Result', 'btn-next');
      }
    }

    // Dernier rival battu : grande scène finale, palmarès, plus de campagne en cours.
    await waitScene(page, 'President');
    expect(await st(page)).toMatchObject({ mode: 'president', fighter: 'tailleur', retries: 1 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOTS}/campagne-presidente.png` });
    const sv = await save(page);
    expect(sv.campaign).toBeNull();
    expect(sv.palmares).toEqual({ tailleur: { wins: 1, bestRetries: 1 } });

    // Nouvelle campagne : l'étoile du palmarès sur le portrait.
    await tapNamed(page, 'President', 'btn-new-campaign');
    await waitScene(page, 'CharacterSelect');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/campagne-palmares.png` });
    const hasBadge = await page.evaluate(() => {
      type O = { name: string; getData: (k: string) => unknown };
      const sc = window.__slap!.game!.scene.getScene('CharacterSelect') as unknown as { children: { list: O[] } };
      return sc.children.list.filter((o) => o.getData?.('laurels')).map((o) => o.name);
    });
    expect(hasBadge).toEqual(['card-tailleur']);
    await expectNoErrors(errors);
  });

  test('abandonner demande confirmation et efface la campagne', async ({ page }) => {
    const errors = collectErrors(page);
    await skipTutorial(page);
    await page.goto('./');
    await waitReady(page, 'Title');
    await tapNamed(page, 'Title', 'btn-campaign');
    await waitScene(page, 'CharacterSelect');
    await tapNamed(page, 'CharacterSelect', 'card-doyen');
    await tapNamed(page, 'CharacterSelect', 'btn-confirm');
    await waitScene(page, 'Campaign');
    await tapNamed(page, 'Campaign', 'btn-abandon');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__slap!.scene)).toBe('Campaign');
    expect((await save(page)).campaign).not.toBeNull();
    await tapNamed(page, 'Campaign', 'btn-abandon');
    await waitScene(page, 'Title');
    expect((await save(page)).campaign).toBeNull();
    expect(await namesIn(page, 'Title')).toContain('btn-campaign');
    await expectNoErrors(errors);
  });

  test('premier lancement : la campagne passe d’abord par le tutoriel, puis le choix du candidat de campagne', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('./');
    await waitReady(page, 'Title');
    await tapNamed(page, 'Title', 'btn-campaign');
    await waitScene(page, 'Fight');
    await tapNamed(page, 'Fight', 'btn-tuto-skip');
    await waitScene(page, 'CharacterSelect');
    expect(await st(page)).toMatchObject({ campaign: true });
    await expectNoErrors(errors);
  });
});
