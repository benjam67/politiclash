import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { collectErrors, expectNoErrors, SHOTS, tapNamed, waitScene } from './helpers';

// Deux navigateurs, chacun son téléphone, reliés par un serveur de mise en relation local.
const PEER = 'peer=127.0.0.1:9000';

interface NetInfo {
  me: number;
  n: number;
  frame: number;
  confirmed: number;
  status: string;
  stats: { rollbacks: number; desyncs: number; maxDepth: number; stalls: number };
}
interface OnlineResult {
  me: number;
  hash: number;
  steps: number;
  stats: { rollbacks: number; desyncs: number; resyncs: number; maxDepth: number; stalls: number };
}

/** Téléphones ouverts par le test en cours : fermés à la fin (sinon ils continuent de jouer pendant le test suivant). */
const opened: BrowserContext[] = [];
test.afterEach(async () => {
  for (const c of opened.splice(0)) await c.close().catch(() => {});
});

async function phone(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  opened.push(ctx);
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('politiclash.save')) localStorage.setItem('politiclash.save', JSON.stringify({ tutorialDone: true }));
  });
  return ctx.newPage();
}

const state = <T = Record<string, unknown>>(p: Page) => p.evaluate(() => window.__slap!.state as unknown) as Promise<T>;

/** L'hôte crée un salon ; l'invité l'ouvre par le lien d'invitation. Les deux arrivent au salon. */
async function connect(browser: Browser, params = '', guestParams = params) {
  const host = await phone(browser);
  const guest = await phone(browser);
  const errors = [...collectErrors(host), ...collectErrors(guest)];
  await host.goto(`./?${PEER}${params ? `&${params}` : ''}`);
  await waitScene(host, 'Title');
  await tapNamed(host, 'Title', 'btn-online');
  await expect(host.locator('#lobby')).toBeVisible();
  await host.fill('#lobby-pseudo', 'Hôte');
  await host.locator('#lobby [data-act="create"]').click();
  await expect(host.locator('#lobby-code-show')).toHaveText(/^[A-HJ-NP-Z]{4}$/, { timeout: 20_000 });
  const code = (await host.locator('#lobby-code-show').textContent()) as string;
  // Le lien d'invitation contient le code du salon.
  const link = await host.evaluate((c) => {
    const u = new URL(location.href);
    u.search = '';
    u.searchParams.set('salon', c);
    return u.toString();
  }, code);
  expect(link).toContain(`salon=${code}`);
  await guest.goto(`./?salon=${code}&${PEER}${guestParams ? `&${guestParams}` : ''}`);
  await waitScene(host, 'Room', 30_000);
  await waitScene(guest, 'Room', 30_000);
  await expect(guest.locator('#lobby')).toBeHidden();
  return { host, guest, code, errors };
}

async function readyUp(host: Page, guest: Page, hostFighter = 'doyen', guestFighter = 'cadet') {
  const room = (p: Page) => p.evaluate(() => JSON.stringify(window.__slap!.state));
  const step = async (what: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      throw new Error(`salon bloqué à l'étape « ${what} »\nhôte : ${await room(host)}\ninvité : ${await room(guest)}\n${(e as Error).message}`);
    }
  };
  await step('choix des persos', async () => {
    await tapNamed(host, 'Room', `card-${hostFighter}`);
    await tapNamed(guest, 'Room', `card-${guestFighter}`);
    await host.waitForFunction((f) => (window.__slap!.state as { them?: { fighter?: string } }).them?.fighter === f, guestFighter, { timeout: 20_000 });
    await guest.waitForFunction((f) => (window.__slap!.state as { them?: { fighter?: string } }).them?.fighter === f, hostFighter, { timeout: 20_000 });
  });
  await step('choix du lieu', async () => {
    await tapNamed(host, 'Room', 'btn-stage');
    await guest.waitForFunction(() => (window.__slap!.state as { stage?: string }).stage !== 'bar', null, { timeout: 20_000 });
  });
  await step('prêts', async () => {
    await tapNamed(host, 'Room', 'btn-ready');
    await tapNamed(guest, 'Room', 'btn-ready');
    await waitScene(host, 'Fight', 30_000);
    await waitScene(guest, 'Fight', 30_000);
  });
}

/** Attend la fin du match sur les deux téléphones et vérifie qu'ils ont joué exactement le même match. */
async function sameMatch(host: Page, guest: Page, timeout = 240_000) {
  // Progrès toutes les 30 s : la machine de test est lente, on distingue « lent » de « bloqué ».
  const t0 = Date.now();
  const timer = setInterval(() => {
    void host
      .evaluate(() => {
        const s = window.__slap!.state as { net?: { frame: number; confirmed: number; status: string }; round?: number };
        return s.net ? `pas ${s.net.frame}, confirmé ${s.net.confirmed}, ${s.net.status}, round ${s.round}` : String(window.__slap!.scene);
      })
      .then((t) => console.log(`  … ${Math.round((Date.now() - t0) / 1000)} s : ${t}`))
      .catch(() => {});
  }, 30_000);
  try {
    await waitScene(host, 'Result', timeout);
    await waitScene(guest, 'Result', timeout);
  } finally {
    clearInterval(timer);
  }
  const a = await state<{ winner: number; wins: number[]; online: OnlineResult }>(host);
  const b = await state<{ winner: number; wins: number[]; online: OnlineResult }>(guest);
  expect(a.online.me).toBe(0);
  expect(b.online.me).toBe(1);
  expect(b.winner).toBe(a.winner);
  expect(b.wins).toEqual(a.wins);
  // Même état final, au pas près.
  expect(b.online.steps).toBe(a.online.steps);
  expect(b.online.hash).toBe(a.online.hash);
  expect(a.online.stats.desyncs + b.online.stats.desyncs).toBe(0);
  return { a, b };
}

test.describe('phase 7b : Entre amis', () => {
  test.describe.configure({ timeout: 360_000 });

  test('salon par lien d’invitation, choix, prêt, match complet sans désynchronisation', async ({ browser }) => {
    const { host, guest, errors } = await connect(browser, 'netbot=hard');
    const room = await state<{ role: string; them: { pseudo: string } }>(guest);
    expect(room.role).toBe('guest');
    expect(room.them.pseudo).toBe('Hôte');
    await host.waitForTimeout(300);
    await host.screenshot({ path: `${SHOTS}/7b-salon-hote.png` });
    await readyUp(host, guest);
    const fh = await state<{ ids: { left: string; right: string }; stage: string; net: NetInfo }>(host);
    const fg = await state<{ ids: { left: string; right: string }; stage: string; net: NetInfo }>(guest);
    expect(fh.ids).toEqual({ left: 'doyen', right: 'cadet' });
    expect(fg.ids).toEqual(fh.ids);
    expect(fg.stage).toBe(fh.stage);
    expect(fh.net.me).toBe(0);
    expect(fg.net.me).toBe(1);
    await host.waitForFunction(() => ((window.__slap!.state as { hits?: number }).hits ?? 0) >= 4, null, { timeout: 60_000 });
    await guest.screenshot({ path: `${SHOTS}/7b-combat-invite.png` });
    const { a } = await sameMatch(host, guest);
    console.log(`sans latence : ${a.online.steps} pas, ${a.online.stats.rollbacks} retours en arrière (hôte), plus long ${a.online.stats.maxDepth}`);
    await host.screenshot({ path: `${SHOTS}/7b-resultat.png` });
    await expectNoErrors(errors);
  });

  test('100 ms de latence dans chaque sens : match complet sans désynchronisation', async ({ browser }) => {
    test.setTimeout(900_000);
    const { host, guest, errors } = await connect(browser, 'netbot=hard&lag=100');
    await readyUp(host, guest, 'binocle', 'aviateur');
    const { a, b } = await sameMatch(host, guest, 780_000);
    console.log(
      `100 ms : ${a.online.steps} pas, retours en arrière ${a.online.stats.rollbacks} / ${b.online.stats.rollbacks}, plus long ${Math.max(a.online.stats.maxDepth, b.online.stats.maxDepth)}, images en attente ${a.online.stats.stalls} / ${b.online.stats.stalls}`,
    );
    expect(a.online.stats.rollbacks + b.online.stats.rollbacks).toBeGreaterThan(0);
    await expectNoErrors(errors);
  });

  test('réactions dans le salon, pendant le choix des candidats', async ({ browser }) => {
    const { host, guest, errors } = await connect(browser);
    const reactions = (p: Page) => p.evaluate(() => (window as unknown as { __slap: { reactions?: string[] } }).__slap.reactions ?? []);
    // L'hôte réagit : la bulle s'affiche chez lui (côté gauche) et chez l'invité.
    await tapNamed(host, 'Room', 'btn-react');
    await tapNamed(host, 'Room', 'btn-react-7');
    await guest.waitForFunction(() => ((window as unknown as { __slap: { reactions?: string[] } }).__slap.reactions ?? []).some((r) => r.startsWith('0:')), null, { timeout: 10_000 });
    expect(await reactions(host)).toContain('0:Eh gros sayez !');
    // L'invité répond.
    await tapNamed(guest, 'Room', 'btn-react');
    await tapNamed(guest, 'Room', 'btn-react-0');
    await host.waitForFunction(() => ((window as unknown as { __slap: { reactions?: string[] } }).__slap.reactions ?? []).some((r) => r.startsWith('1:')), null, { timeout: 10_000 });
    expect(await reactions(host)).toContain('1:Votez pour moi !');
    // Capture : deux bulles, animations figées (avec deux fenêtres, l'horloge du jeu saute et la bulle disparaît avant la capture).
    await host.waitForTimeout(1600);
    await host.evaluate(() => {
      const sc = window.__slap!.game!.scene.getScene('Room') as unknown as { showReaction: (mine: boolean, i: number) => void; tweens: Phaser.Tweens.TweenManager };
      sc.showReaction(true, 9);
      sc.showReaction(false, 4);
      sc.tweens.pauseAll();
    });
    await host.waitForTimeout(250);
    await host.screenshot({ path: `${SHOTS}/7b-reactions-salon.png` });
    await host.evaluate(() => (window.__slap!.game!.scene.getScene('Room') as unknown as { tweens: Phaser.Tweens.TweenManager }).tweens.resumeAll());
    // Coupées : celles de l'adversaire ne s'affichent plus, les siennes si.
    await tapNamed(host, 'Room', 'btn-react');
    await host.screenshot({ path: `${SHOTS}/7b-reactions-salon-menu.png` });
    await tapNamed(host, 'Room', 'btn-react-mute');
    const before = (await reactions(host)).length;
    await tapNamed(guest, 'Room', 'btn-react');
    await tapNamed(guest, 'Room', 'btn-react-1');
    await guest.waitForFunction(() => ((window as unknown as { __slap: { reactions?: string[] } }).__slap.reactions ?? []).length >= 3);
    await host.waitForTimeout(800);
    expect((await reactions(host)).length).toBe(before);
    await expectNoErrors(errors);
  });

  test('réactions, revanche à deux, départ d’un joueur en plein match', async ({ browser }) => {
    // L'invité ne joue pas : le match est court (on vérifie ici le déroulé, pas le combat).
    const { host, guest, errors } = await connect(browser, 'netbot=hard', 'netbot=idle');
    await readyUp(host, guest, 'tailleur', 'barbe');
    // Réaction de l'invité : elle s'affiche chez l'hôte.
    await tapNamed(guest, 'Fight', 'btn-react');
    await tapNamed(guest, 'Fight', 'btn-react-2');
    await host.waitForFunction(() => ((window as unknown as { __slap: { reactions?: string[] } }).__slap.reactions ?? []).some((r) => r.startsWith('1:')), null, { timeout: 10_000 });
    await sameMatch(host, guest);

    // Revanche : il faut les deux.
    await tapNamed(host, 'Result', 'btn-again');
    await guest.waitForFunction(() => window.__slap!.game!.scene.getScene('Result').children.list.some((o) => o.name === 'result-them-again'));
    await guest.screenshot({ path: `${SHOTS}/7b-revanche-demandee.png` });
    await tapNamed(guest, 'Result', 'btn-again');
    await waitScene(host, 'Fight');
    await waitScene(guest, 'Fight');
    const n = await state<{ net: NetInfo }>(guest);
    expect(n.net.n).toBe(2);

    // L'hôte quitte en plein match (bouton maison) : l'invité est prévenu, match annulé, bouton MENU.
    await host.waitForTimeout(1500);
    await tapNamed(host, 'Fight', 'btn-home');
    await waitScene(host, 'Title');
    await guest.waitForFunction(() => window.__slap!.game!.scene.getScene('Fight').children.list.some((o) => o.name === 'btn-net-menu'), null, { timeout: 15_000 });
    await guest.screenshot({ path: `${SHOTS}/7b-adversaire-parti.png` });
    await tapNamed(guest, 'Fight', 'btn-net-menu');
    await waitScene(guest, 'Title');
    await expectNoErrors(errors);
  });

  test('coupure de la liaison en plein match : bandeau, reconnexion, même match ; puis changer de perso et départ', async ({ browser }) => {
    const { host, guest, errors } = await connect(browser, 'netbot=hard', 'netbot=idle');
    await readyUp(host, guest);
    await host.waitForFunction(() => ((window.__slap!.state as { hits?: number }).hits ?? 0) >= 3, null, { timeout: 60_000 });
    await guest.evaluate(() => (window.__slap!.game!.scene.getScene('Fight') as unknown as { room: { link: { simulateDrop(): void } } }).room.link.simulateDrop());
    await host.waitForFunction(() => (window.__slap!.state as { net: NetInfo }).net.status !== 'ok', null, { timeout: 10_000 });
    await host.screenshot({ path: `${SHOTS}/7b-coupure.png` });
    await host.waitForFunction(() => (window.__slap!.state as { net: NetInfo }).net.status === 'ok', null, { timeout: 20_000 });
    await sameMatch(host, guest);

    // Changer de perso : les deux reviennent au salon. Puis l'invité quitte : l'hôte est prévenu.
    await tapNamed(host, 'Result', 'btn-change');
    await waitScene(host, 'Room');
    await waitScene(guest, 'Room');
    expect((await state<{ me: { ready: boolean } }>(guest)).me.ready).toBe(false);
    await tapNamed(guest, 'Room', 'btn-quit');
    await waitScene(host, 'Title', 20_000);
    const notice = await host.evaluate(() => (window.__slap!.game!.scene.getScene('Title').children.list.find((o) => o.name === 'title-notice') as unknown as { text: string })?.text);
    expect(notice).toContain('Joueur');
    await expectNoErrors(errors);
  });

  test('erreurs : code trop court, salon introuvable', async ({ browser }) => {
    const page = await phone(browser);
    const errors = collectErrors(page);
    await page.goto(`./?${PEER}`);
    await waitScene(page, 'Title');
    await tapNamed(page, 'Title', 'btn-online');
    await page.locator('#lobby [data-act="join"]').click();
    await page.fill('#lobby-code', 'AB');
    await page.locator('#lobby [data-act="go"]').click();
    await expect(page.locator('[data-view="join"] .status')).toHaveText('Le code fait 4 lettres.');
    await page.fill('#lobby-code', 'zzzz');
    await page.locator('#lobby [data-act="go"]').click();
    await expect(page.locator('[data-view="join"] .status')).toHaveText('Salon introuvable. Vérifie le code.', { timeout: 30_000 });
    await page.screenshot({ path: `${SHOTS}/7b-erreur.png` });
    // Les erreurs de connexion attendues de PeerJS ne sont pas des erreurs du jeu.
    await expectNoErrors(errors.filter((e) => !/peer|Could not connect|ERR_CONNECTION|Failed to load resource/i.test(e)));
  });
});
