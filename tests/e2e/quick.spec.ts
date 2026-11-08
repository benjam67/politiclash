import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { collectErrors, expectNoErrors, SHOTS, tapNamed, waitScene } from './helpers';

// Primaire ouverte : deux navigateurs qui ne partagent aucun code se trouvent par la file d'attente du serveur
// (vrai Worker lancé en local par Wrangler), puis jouent par le relais (relais local).
const P = 'peer=127.0.0.1:9000&server=http://127.0.0.1:8787';

const opened: BrowserContext[] = [];
test.afterEach(async () => {
  for (const c of opened.splice(0)) await c.close().catch(() => {});
});

async function phone(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  opened.push(ctx);
  await ctx.addInitScript(() => {
    try {
      if (!localStorage.getItem('politiclash.save')) localStorage.setItem('politiclash.save', JSON.stringify({ tutorialDone: true }));
    } catch {
      /* page vide */
    }
  });
  return ctx.newPage();
}

const state = <T = Record<string, unknown>>(p: Page) => p.evaluate(() => window.__slap!.state as unknown) as Promise<T>;
/** Pages sans erreur, hors erreurs de connexion attendues de PeerJS. */
const realErrors = (e: string[]) => e.filter((x) => !/peer|Could not connect|ERR_CONNECTION|Failed to load resource/i.test(x));

/** Ouvre la Primaire ouverte depuis l'accueil. */
async function search(page: Page, extra = '', name = '') {
  await page.goto(`./?${P}${extra ? `&${extra}` : ''}`);
  await waitScene(page, 'Title');
  await tapNamed(page, 'Title', 'btn-online');
  if (name) await page.fill('#lobby-pseudo', name);
  await page.locator('#lobby [data-act="quick"]').click();
  await waitScene(page, 'Quick');
}

/** Types des candidats de la connexion du match (local et distant) : tout doit passer par le relais. */
const candidateTypes = (p: Page) =>
  p.evaluate(async () => {
    const room = (window.__slap!.game!.scene.getScenes(true)[0] as unknown as { room?: { link: { game: { peerConnection: RTCPeerConnection } } } }).room;
    const pc = room?.link.game.peerConnection;
    if (!pc) return null;
    const stats = await pc.getStats();
    const types: string[] = [];
    stats.forEach((r) => {
      if (r.type === 'local-candidate' || r.type === 'remote-candidate') types.push(`${r.type}:${r.candidateType}`);
    });
    const sdp = `${pc.localDescription?.sdp ?? ''}${pc.remoteDescription?.sdp ?? ''}`;
    return { types, hostInSdp: / typ (host|srflx|prflx)/.test(sdp) };
  });

async function bothInRoom(a: Page, b: Page) {
  await waitScene(a, 'Room', 40_000);
  await waitScene(b, 'Room', 40_000);
}

test.describe('phase 7d : Primaire ouverte', () => {
  test.describe.configure({ timeout: 420_000 });

  test('deux inconnus se trouvent, choisissent en 15 s et jouent un match complet par le relais, sans voir l’IP de l’autre ; le classement compte la victoire', async ({ browser, request }) => {
    const a = await phone(browser);
    const b = await phone(browser);
    const errors = [...collectErrors(a), ...collectErrors(b)];
    const tag = Math.random().toString(36).slice(2, 6);
    const names = [`Alpha ${tag}`, `Bravo ${tag}`];
    await search(a, 'netbot=hard', names[0]);
    await expect.poll(async () => (await state<{ online: number }>(a)).online).toBeGreaterThanOrEqual(1);
    await a.screenshot({ path: `${SHOTS}/7d-recherche.png` });
    await search(b, 'netbot=hard', names[1]);
    await bothInRoom(a, b);
    // Salon de la Primaire : titre, pas de code, pseudos de la liste du jeu, lieu tiré au hasard.
    const ra = await state<{ role: string; them: { pseudo: string }; route: string | null }>(a);
    const rb = await state<{ role: string; them: { pseudo: string } }>(b);
    expect([ra.role, rb.role].sort()).toEqual(['guest', 'host']);
    expect(ra.them.pseudo.length).toBeGreaterThan(3);
    await a.waitForFunction(() => (window.__slap!.state as { route?: string }).route === 'relay', null, { timeout: 20_000 });
    // Aucune adresse de l'autre : seulement des candidats du relais, dans les deux sens.
    for (const p of [a, b]) {
      const c = await candidateTypes(p);
      expect(c).not.toBeNull();
      expect(c!.hostInSdp).toBe(false);
      for (const t of c!.types) expect(t).toMatch(/:relay$/);
    }
    await a.screenshot({ path: `${SHOTS}/7d-salon.png` });
    // A choisit ; B ne fait rien : au bout de 15 s, perso au hasard et prêt d'office.
    await tapNamed(a, 'Room', 'card-doyen');
    await tapNamed(a, 'Room', 'btn-ready');
    await waitScene(a, 'Fight', 40_000);
    await waitScene(b, 'Fight', 40_000);
    const fa = await state<{ stage: string; net: { me: number } }>(a);
    const fb = await state<{ stage: string; net: { me: number } }>(b);
    expect(fb.stage).toBe(fa.stage);
    await waitScene(a, 'Result', 300_000);
    await waitScene(b, 'Result', 300_000);
    const xa = await state<{ winner: number; online: { hash: number; steps: number; stats: { desyncs: number } } }>(a);
    const xb = await state<{ winner: number; online: { hash: number; steps: number; stats: { desyncs: number } } }>(b);
    expect(xb.winner).toBe(xa.winner);
    expect(xb.online.steps).toBe(xa.online.steps);
    expect(xb.online.hash).toBe(xa.online.hash);
    expect(xa.online.stats.desyncs + xb.online.stats.desyncs).toBe(0);
    await a.screenshot({ path: `${SHOTS}/7d-resultat.png` });
    // Classement : les deux téléphones ont déclaré le même résultat, la victoire est comptée au gagnant, sous son nom.
    const winnerName = names[xa.winner === (await state<{ online: { me: number } }>(a)).online.me ? 0 : 1];
    await expect
      .poll(async () => {
        const board = (await (await request.get('http://127.0.0.1:8787/rank/board?period=day')).json()) as { top: { name: string; wins: number }[] };
        return board.top.find((r) => r.name === winnerName)?.wins ?? 0;
      }, { timeout: 15_000 })
      .toBe(1);
    // Personne ne demande la revanche : au bout de 10 s, chacun repart chercher un adversaire.
    await waitScene(a, 'Quick', 20_000);
    await waitScene(b, 'Quick', 20_000);
    await expectNoErrors(realErrors(errors));
  });

  test('écran du classement : onglets Jour, Semaine, Toujours ; nom grossier ou déjà pris refusé dans le menu', async ({ browser }) => {
    const page = await phone(browser);
    const errors = collectErrors(page);
    await page.goto(`./?${P}`);
    await waitScene(page, 'Title');
    await tapNamed(page, 'Title', 'btn-online');
    // Nom grossier : refusé tout de suite, on reste dans le menu.
    await page.fill('#lobby-pseudo', 'Gros c0nnard');
    await page.locator('#lobby [data-act="quick"]').click();
    await expect(page.locator('[data-view="choice"] .err')).toContainText('n’est pas accepté');
    expect(await page.evaluate(() => window.__slap!.scene)).toBe('Title');
    // Pseudo déjà porté par un autre joueur (même écrit autrement) : refusé aussi.
    const taken = `Pris ${Math.random().toString(36).slice(2, 6)}`;
    const other = { rid: 'f'.repeat(31) + Math.floor(Math.random() * 10), secret: 'e'.repeat(64) };
    const r = await page.request.post('http://127.0.0.1:8787/rank/name', { headers: { Origin: 'http://localhost:4173' }, data: { ...other, name: taken } });
    expect(r.status()).toBe(200);
    await page.fill('#lobby-pseudo', taken.toUpperCase());
    await page.locator('#lobby [data-act="quick"]').click();
    await expect(page.locator('[data-view="choice"] .err')).toContainText('déjà pris');
    expect(await page.evaluate(() => window.__slap!.scene)).toBe('Title');
    await page.locator('#lobby [data-act="ranking"]').click();
    await expect(page.locator('#ranking')).toBeVisible();
    for (const p of ['day', 'week', 'all']) {
      await page.locator(`#ranking [data-period="${p}"]`).click();
      await page.waitForFunction((pp) => (window.__slap as unknown as { ranking?: { period: string } }).ranking?.period === pp, p, { timeout: 10_000 });
    }
    await expect(page.locator('#ranking-me')).not.toBeEmpty();
    await page.screenshot({ path: `${SHOTS}/7d-classement.png` });
    await page.locator('#ranking [data-act="close"]').click();
    await expect(page.locator('#ranking')).toBeHidden();
    await expect(page.locator('#lobby')).toBeVisible();
    await expectNoErrors(realErrors(errors));
  });

  test('personne en vue : match contre l’IA en attendant, puis un adversaire arrive et on le rejoint', async ({ browser }) => {
    const a = await phone(browser);
    const b = await phone(browser);
    const errors = [...collectErrors(a), ...collectErrors(b)];
    await search(a, 'quickwait=3');
    await a.waitForFunction(() => (window.__slap!.state as { offerAi?: boolean }).offerAi === true, null, { timeout: 15_000 });
    await a.screenshot({ path: `${SHOTS}/7d-proposition-ia.png` });
    await tapNamed(a, 'Quick', 'btn-quick-ai');
    await waitScene(a, 'Fight');
    await search(b);
    // Chez A, en plein match contre l'IA : bandeau « … veut t'affronter ! REJOINDRE ».
    await a.waitForFunction(() => window.__slap!.game!.scene.getScene('Fight').children.list.some((o) => o.name === 'btn-quick-join'), null, { timeout: 20_000 });
    await a.screenshot({ path: `${SHOTS}/7d-adversaire-pendant-ia.png` });
    await tapNamed(a, 'Fight', 'btn-quick-join');
    await bothInRoom(a, b);
    await expectNoErrors(realErrors(errors));
  });

  test('l’adversaire quitte en plein match : victoire pour celui qui reste', async ({ browser }) => {
    const a = await phone(browser);
    const b = await phone(browser);
    const errors = [...collectErrors(a), ...collectErrors(b)];
    await search(a, 'netbot=idle');
    await search(b, 'netbot=idle');
    await bothInRoom(a, b);
    await tapNamed(a, 'Room', 'btn-ready');
    await tapNamed(b, 'Room', 'btn-ready');
    await waitScene(a, 'Fight', 40_000);
    await waitScene(b, 'Fight', 40_000);
    await a.waitForTimeout(1500);
    const meB = (await state<{ net: { me: number } }>(b)).net.me;
    await tapNamed(a, 'Fight', 'btn-home');
    await waitScene(b, 'Result', 20_000);
    const r = await state<{ winner: number; online: { forfeit?: boolean } }>(b);
    expect(r.winner).toBe(meB);
    expect(r.online.forfeit).toBe(true);
    await b.screenshot({ path: `${SHOTS}/7d-victoire-abandon.png` });
    await expectNoErrors(realErrors(errors));
  });
});
