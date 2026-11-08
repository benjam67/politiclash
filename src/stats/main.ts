// Page privée des statistiques de jeu (stats.html) : lit les totaux sur le serveur avec la clé, et les affiche.
// La clé se saisit une fois (elle est gardée dans ce navigateur), ou s'ajoute à l'adresse : stats.html?key=…
import { FIGHTER_IDS, type FighterId } from '../config/roster';
import { serverUrl } from '../config/server';
import { FIGHTER_TEXTS, STAGE_TEXTS, TEXTS_AI } from '../config/texts';
import { DEALT_MOVES, type DealtMove } from '../logic/fight';
import { MODES, summarize, type Mode, type Row, type Summary } from './summary';

const STAGE_NAMES: Record<string, string> = Object.fromEntries(Object.entries(STAGE_TEXTS).map(([k, v]) => [k, v.name]));
const MODE_NAMES: Record<Mode, string> = { libre: 'Combat libre', campagne: 'Campagne', ia: 'IA en attendant (Primaire)', amis: 'Entre amis', primaire: 'Primaire ouverte' };
const MOVE_NAMES: Record<DealtMove, string> = { quick: 'Gifle rapide', air: 'Gifle aérienne', kick: 'Coup de pied', sweep: 'Balayette', big: 'Grosse gifle', special: 'Coup spécial' };
const PERIODS: [number, string][] = [
  [1, 'Aujourd’hui'],
  [7, '7 jours'],
  [30, '30 jours'],
  [365, '1 an'],
  [3660, 'Depuis le début'],
];
const STORE = 'politiclash.statsKey';

const name = (id: FighterId) => FIGHTER_TEXTS[id].name;
const moveName = (m: DealtMove, id?: FighterId) => (m === 'special' && id ? `${FIGHTER_TEXTS[id].special} (spécial)` : MOVE_NAMES[m]);
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)} %` : '–');
const hp = (tenths: number) => Math.round(tenths / 10).toLocaleString('fr-FR');
const nb = (n: number) => n.toLocaleString('fr-FR');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const dur = (secs: number) => `${Math.floor(secs / 60)} min ${String(Math.round(secs % 60)).padStart(2, '0')}`;

function readKey(): string {
  const params = new URLSearchParams(location.search);
  const q = params.get('key');
  if (q) {
    try {
      localStorage.setItem(STORE, q);
    } catch {
      /* navigateur sans stockage */
    }
    // La clé ne reste pas dans l'adresse (historique, capture d'écran).
    params.delete('key');
    history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : ''));
    return q;
  }
  try {
    return localStorage.getItem(STORE) ?? '';
  } catch {
    return '';
  }
}

let key = readKey();
let days = 30;
const app = document.getElementById('app')!;

const CSS = `
  :root { --blue:#002654; --red:#CE1126; --ink:#14161c; --muted:#5b6070; --line:#e3e5ea; --bg:#f6f7f9; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  header { background: var(--blue); color: #fff; padding: 18px 20px 14px; border-bottom: 6px solid var(--red); box-shadow: inset 0 -12px 0 -6px #fff; }
  header h1 { margin: 0; font-size: 22px; letter-spacing: .02em; }
  header p { margin: 4px 0 0; opacity: .8; font-size: 13px; }
  main { max-width: 1040px; margin: 0 auto; padding: 16px; }
  .bar { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 16px; }
  .bar button { border: 1px solid var(--line); background: #fff; border-radius: 999px; padding: 6px 12px; font: inherit; cursor: pointer; }
  .bar button.on { background: var(--blue); color: #fff; border-color: var(--blue); }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 18px; }
  .card { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; }
  .card b { display: block; font-size: 26px; font-variant-numeric: tabular-nums; }
  .card span { color: var(--muted); font-size: 13px; }
  section { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin-bottom: 16px; overflow-x: auto; }
  section h2 { margin: 0 0 10px; font-size: 17px; }
  section p.note { margin: -4px 0 10px; color: var(--muted); font-size: 13px; }
  table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
  th, td { text-align: right; padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  th { color: var(--muted); font-weight: 600; font-size: 13px; }
  td.fav { text-align: left; }
  .meter { display: inline-block; vertical-align: middle; height: 8px; border-radius: 4px; background: var(--blue); margin-right: 6px; }
  .days { display: flex; align-items: flex-end; gap: 2px; height: 90px; }
  .days div { flex: 1; background: var(--blue); min-height: 1px; border-radius: 2px 2px 0 0; }
  .empty { color: var(--muted); }
  form { display: flex; gap: 8px; flex-wrap: wrap; }
  input { font: inherit; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; min-width: 260px; }
  form button { font: inherit; padding: 8px 14px; border: 0; border-radius: 8px; background: var(--red); color: #fff; cursor: pointer; }
  .err { color: var(--red); }
`;

function frame(body: string) {
  app.innerHTML = `<style>${CSS}</style><header><h1>France Bagarre · Statistiques</h1><p>Totaux anonymes des matchs joués sur france-bagarre.fr</p></header><main>${body}</main>`;
}

function askKey(message = '') {
  frame(`<section><h2>Clé de la page</h2>
    <p class="note">La clé est gardée dans ce navigateur. ${message ? `<span class="err">${esc(message)}</span>` : ''}</p>
    <form id="k"><input name="key" type="password" autocomplete="off" placeholder="Clé des statistiques" autofocus /><button>Ouvrir</button></form></section>`);
  document.getElementById('k')!.addEventListener('submit', (e) => {
    e.preventDefault();
    key = String(new FormData(e.target as HTMLFormElement).get('key') ?? '').trim();
    try {
      localStorage.setItem(STORE, key);
    } catch {
      /* rien */
    }
    void load();
  });
}

async function load() {
  if (!key) return askKey();
  frame('<p class="empty">Chargement…</p>');
  let r: Response;
  try {
    r = await fetch(`${serverUrl()}/stats/data?days=${days}&key=${encodeURIComponent(key)}`, { cache: 'no-store' });
  } catch {
    frame('<p class="err">Le serveur ne répond pas. Réessaie dans un instant.</p>');
    return;
  }
  if (r.status === 403) return askKey('Clé refusée.');
  if (!r.ok) return frame(`<p class="err">Erreur du serveur (${r.status}).</p>`);
  const { rows } = (await r.json()) as { rows: Row[] };
  render(summarize(rows, FIGHTER_IDS));
}

function render(s: Summary) {
  const periods = PERIODS.map(([d, label]) => `<button data-days="${d}" class="${d === days ? 'on' : ''}">${label}</button>`).join('');
  const online = s.byMode.amis.matches + s.byMode.primaire.matches;
  const allSecs = MODES.reduce((t, m) => t + s.byMode[m].secs, 0);
  const campStart = s.fighters.reduce((t, f) => t + f.campStart, 0);
  const campDone = s.fighters.reduce((t, f) => t + f.campDone, 0);

  const cards = `<div class="cards">
    <div class="card"><b>${nb(s.matches)}</b><span>matchs joués</span></div>
    <div class="card"><b>${nb(online)}</b><span>matchs en ligne</span></div>
    <div class="card"><b>${s.matches ? dur(allSecs / s.matches) : '–'}</b><span>durée moyenne d’un match</span></div>
    <div class="card"><b>${nb(campStart)}</b><span>campagnes commencées</span></div>
    <div class="card"><b>${nb(campDone)}</b><span>présidents élus (${pct(campDone, campStart)})</span></div>
  </div>`;

  const maxDay = Math.max(1, ...s.perDay.map(([, n]) => n));
  const perDay = s.perDay.length > 1 ? `<section><h2>Matchs par jour</h2><div class="days">${s.perDay.map(([d, n]) => `<div title="${d} : ${n}" style="height:${(100 * n) / maxDay}%"></div>`).join('')}</div></section>` : '';

  const byPicks = [...s.fighters].sort((a, b) => b.picks - a.picks);
  const maxPick = Math.max(1, ...byPicks.map((f) => f.picks));
  const fighters = `<section><h2>Les candidats</h2>
    <p class="note">« Choisi » : par un joueur, tous modes confondus. « Victoires » : celles des joueurs qui l’ont choisi. Le coup de prédilection est celui qui a fait le plus de dégâts en cumulé, tous modes confondus (IA comprise).</p>
    <table><tr><th>Candidat</th><th>Choisi</th><th>Victoires</th><th>Tous ses matchs</th><th>Coup de prédilection</th><th>Dégâts infligés</th></tr>
    ${byPicks
      .map((f) => {
        const total = DEALT_MOVES.reduce((t, m) => t + f.dmg[m], 0);
        return `<tr><td>${esc(name(f.id))}</td>
          <td><span class="meter" style="width:${(60 * f.picks) / maxPick}px"></span>${nb(f.picks)}</td>
          <td>${pct(f.pickWins, f.picks)}</td>
          <td>${nb(f.plays)} · ${pct(f.wins, f.plays)} gagnés</td>
          <td class="fav">${f.favorite ? `${esc(moveName(f.favorite, f.id))} <span class="empty">(${pct(f.favoriteShare, 1)})</span>` : '<span class="empty">–</span>'}</td>
          <td>${hp(total)} PV</td></tr>`;
      })
      .join('')}</table></section>`;

  const allDmg = DEALT_MOVES.reduce((t, m) => t + s.dmgAll[m], 0);
  const moves = `<section><h2>Les coups</h2><p class="note">Dégâts infligés par chaque coup, coups bloqués compris, tous candidats confondus ; puis la part de chaque coup pour chaque candidat.</p>
    <table><tr><th>Coup</th><th>Dégâts</th><th>Part</th>${s.fighters.map((f) => `<th>${esc(FIGHTER_TEXTS[f.id].short)}</th>`).join('')}</tr>
    ${[...DEALT_MOVES]
      .sort((a, b) => s.dmgAll[b] - s.dmgAll[a])
      .map((m) => {
        const cells = s.fighters
          .map((f) => {
            const t = DEALT_MOVES.reduce((x, k) => x + f.dmg[k], 0);
            const strong = f.favorite === m ? ' style="font-weight:700"' : '';
            return `<td${strong}>${pct(f.dmg[m], t)}</td>`;
          })
          .join('');
        return `<tr><td>${MOVE_NAMES[m]}</td><td>${hp(s.dmgAll[m])} PV</td><td>${pct(s.dmgAll[m], allDmg)}</td>${cells}</tr>`;
      })
      .join('')}</table></section>`;

  const modes = `<section><h2>Les modes</h2><table><tr><th>Mode</th><th>Matchs</th><th>Durée moyenne</th><th>Rounds par match</th><th>Abandons</th></tr>
    ${MODES.map((m) => {
      const x = s.byMode[m];
      return `<tr><td>${MODE_NAMES[m]}</td><td>${nb(x.matches)}</td><td>${x.matches ? dur(x.secs / x.matches) : '–'}</td><td>${x.matches ? (x.rounds / x.matches).toFixed(1).replace('.', ',') : '–'}</td><td>${nb(x.forfeits)}</td></tr>`;
    }).join('')}</table></section>`;

  const camp = `<section><h2>La campagne présidentielle</h2>
    <p class="note">« Le plus dur à battre » : victoires de ce candidat, joué par l’IA, contre le joueur en campagne.</p>
    <table><tr><th>Candidat</th><th>Commencées</th><th>Gagnées</th><th>Abandonnées</th><th>Recomptages par victoire</th><th>Le plus dur à battre</th></tr>
    ${[...s.fighters]
      .sort((a, b) => b.campStart - a.campStart)
      .map(
        (f) => `<tr><td>${esc(name(f.id))}</td><td>${nb(f.campStart)}</td><td>${nb(f.campDone)}</td><td>${nb(f.campQuit)}</td>
          <td>${f.campDone ? (f.campRetries / f.campDone).toFixed(1).replace('.', ',') : '–'}</td>
          <td>${f.rivalPlays ? `${pct(f.rivalWins, f.rivalPlays)} de ${nb(f.rivalPlays)} matchs` : '–'}</td></tr>`,
      )
      .join('')}</table></section>`;

  const list = (title: string, items: [string, number][], label: (k: string) => string) => {
    const t = items.reduce((x, [, n]) => x + n, 0);
    return `<section><h2>${title}</h2>${items.length ? `<table>${items.map(([k, n]) => `<tr><td>${esc(label(k))}</td><td>${nb(n)}</td><td>${pct(n, t)}</td></tr>`).join('')}</table>` : '<p class="empty">Rien pour l’instant.</p>'}</section>`;
  };
  const levelName = (k: string) => (k in TEXTS_AI ? TEXTS_AI[k as keyof typeof TEXTS_AI] : k);

  frame(`<div class="bar">${periods}</div>${
    s.matches === 0 && campStart === 0
      ? '<section><p class="empty">Aucun match sur cette période.</p></section>'
      : cards + perDay + fighters + moves + modes + camp + list('Les lieux', s.stages, (k) => STAGE_NAMES[k] ?? k) + list('Niveaux de l’IA (solo)', s.levels, levelName)
  }`);
  for (const b of app.querySelectorAll<HTMLButtonElement>('.bar button')) {
    b.addEventListener('click', () => {
      days = Number(b.dataset.days);
      void load();
    });
  }
}

void load();
