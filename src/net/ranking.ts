// Écran du classement : onglets Jour / Semaine / Toujours, les 100 premiers, la place du joueur, et un bouton
// pour signaler un nom. En HTML par-dessus le jeu (la liste défile bien sur téléphone).
import { RANKING } from '../config/texts';
import { fetchBoard, flagName, rankIdentity, type Period } from './rank';

const SWALLOW = ['touchstart', 'touchend', 'touchmove', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'] as const;
const swallow = (e: Event) => e.stopPropagation();

/** Ouvre le classement ; la promesse se résout quand le joueur le referme. */
export function openRanking(period: Period = 'day'): Promise<void> {
  const root = document.getElementById('ranking') as HTMLElement;
  const list = root.querySelector('#ranking-list') as HTMLOListElement;
  const meLine = root.querySelector('#ranking-me') as HTMLElement;
  for (const el of root.querySelectorAll<HTMLElement>('[data-rank-text]')) el.textContent = (RANKING as Record<string, unknown>)[el.dataset.rankText as string] as string;
  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-period]')) b.textContent = RANKING.tabs[b.dataset.period as string];
  const me = rankIdentity().id;
  let shown: Period = period;
  let seq = 0;

  const row = (cls: string, ...cells: (string | HTMLElement)[]) => {
    const li = document.createElement('li');
    if (cls) li.className = cls;
    li.append(...cells);
    return li;
  };
  const span = (cls: string, text: string) => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    return s;
  };

  const load = async (p: Period) => {
    shown = p;
    const mySeq = ++seq;
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-period]')) b.setAttribute('aria-selected', String(b.dataset.period === p));
    list.replaceChildren(row('empty', RANKING.loading));
    meLine.textContent = '';
    const board = await fetchBoard(p);
    if (mySeq !== seq) return;
    if (!board) {
      list.replaceChildren(row('empty', RANKING.offline));
      return;
    }
    meLine.textContent = board.me ? RANKING.me(board.me.rank, board.me.wins) : '';
    if (!board.top.length) {
      list.replaceChildren(row('empty', RANKING.empty));
    } else {
      list.replaceChildren(
        ...board.top.map((r) => {
          const mine = r.id === me;
          const cells: (string | HTMLElement)[] = [span('r', `${r.rank}`), span('n', mine ? `${r.name} ${RANKING.you}` : r.name), span('w', RANKING.wins(r.wins))];
          if (!mine) {
            // Signaler un nom : deux appuis (« Signaler ? » puis confirmation), pour éviter les erreurs.
            const flag = document.createElement('button');
            flag.className = 'flag';
            flag.textContent = RANKING.flag;
            flag.dataset.target = r.id;
            cells.push(flag);
          }
          return row(mine ? 'mine' : '', ...cells);
        }),
      );
    }
    if (window.__slap) (window.__slap as Record<string, unknown>).ranking = { period: p, rows: board.top.length, me: board.me };
  };

  return new Promise((resolve) => {
    const onClick = (e: Event) => {
      const t = e.target as HTMLElement;
      const period = t.closest('[data-period]')?.getAttribute('data-period');
      if (period) return void load(period as Period);
      if (t.closest('[data-act="close"]')) return close();
      const flag = t.closest('button.flag') as HTMLButtonElement | null;
      if (flag?.dataset.target) {
        if (flag.dataset.armed !== '1') {
          flag.dataset.armed = '1';
          flag.textContent = RANKING.flagConfirm;
          return;
        }
        flag.disabled = true;
        flag.textContent = RANKING.flagged;
        void flagName(flag.dataset.target);
      }
    };
    const close = () => {
      root.hidden = true;
      root.removeEventListener('click', onClick);
      for (const ev of SWALLOW) root.removeEventListener(ev, swallow);
      if (window.__slap) delete (window.__slap as Record<string, unknown>).ranking;
      resolve();
    };
    root.addEventListener('click', onClick);
    for (const ev of SWALLOW) root.addEventListener(ev, swallow);
    root.hidden = false;
    void load(shown);
  });
}
