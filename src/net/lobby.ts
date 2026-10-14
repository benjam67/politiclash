// Menu du jeu en ligne : pseudo, puis Entre amis → créer un salon (code à 4 lettres, lien à partager)
// ou le rejoindre. En HTML par-dessus le jeu, pour profiter du clavier du téléphone.
// Renvoie le salon une fois les deux téléphones reliés, ou null si le joueur revient en arrière.
import { PLAYABLE_IDS } from '../config/roster';
import { ONLINE, GAME } from '../config/texts';
import { loadSave, updateSave } from '../logic/save';
import { FriendRoom, setCurrentRoom } from './friends';
import { linkOptionsFromUrl, PeerLink } from './peer';
import { cleanPseudo, inviteLink, makeCode, normalizeCode } from './room';

type View = 'choice' | 'host' | 'join' | 'busy';

/** Pseudo par défaut, s'il n'en a jamais choisi : « Joueur » suivi de deux chiffres. */
const defaultPseudo = () => `Joueur ${10 + Math.floor(Math.random() * 90)}`;

export function openLobby(opts: { join?: string } = {}): Promise<FriendRoom | null> {
  const root = document.getElementById('lobby') as HTMLElement;
  const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const codeIn = q<HTMLInputElement>('#lobby-code');
  const pseudoIn = q<HTMLInputElement>('#lobby-pseudo');
  const codeShow = q<HTMLElement>('#lobby-code-show');
  const linkOpts = linkOptionsFromUrl(location.search);
  let link: PeerLink | null = null;
  let done = false;

  for (const el of root.querySelectorAll<HTMLElement>('[data-text]')) {
    const v = (ONLINE as Record<string, unknown>)[el.dataset.text as string];
    if (typeof v === 'string') el.textContent = v;
  }
  const save = loadSave();
  pseudoIn.value = save.pseudo || defaultPseudo();

  const show = (view: View, status = '', err = false) => {
    root.dataset.show = view;
    const el = root.querySelector(`[data-view="${view}"] [data-status]`) as HTMLElement | null;
    if (el && (status || view !== 'choice')) {
      el.textContent = status || (view === 'choice' ? ONLINE.friendsHelp : '');
      el.classList.toggle('err', err);
    }
    if (window.__slap) (window.__slap as Record<string, unknown>).lobby = { view, status, code: codeShow.textContent };
  };

  const pseudo = () => {
    const p = cleanPseudo(pseudoIn.value) || defaultPseudo();
    pseudoIn.value = p;
    updateSave((s) => ({ ...s, pseudo: p }));
    return p;
  };

  return new Promise((resolve) => {
    const finish = (room: FriendRoom | null) => {
      if (done) return;
      done = true;
      root.hidden = true;
      root.removeEventListener('click', onClick);
      codeIn.removeEventListener('keydown', onKey);
      codeIn.removeEventListener('input', onInput);
      if (window.__slap) delete (window.__slap as Record<string, unknown>).lobby;
      if (room) setCurrentRoom(room);
      resolve(room);
    };
    const makeRoom = (l: PeerLink, name: string) => {
      const s = loadSave();
      return new FriendRoom(l, name, s.lastFighter ?? PLAYABLE_IDS[0], s.lastStage);
    };
    const err = (e: unknown) => ONLINE.errors[(e as Error).message] ?? ONLINE.errors.network;

    const host = async () => {
      const name = pseudo();
      show('busy', ONLINE.creating);
      for (let attempt = 0; attempt < 6 && !done; attempt++) {
        const code = makeCode();
        try {
          link = await PeerLink.open('host', code, linkOpts);
        } catch (e) {
          if ((e as Error).message === 'room-taken') continue;
          return show('choice', err(e), true);
        }
        if (done) return link.destroy();
        codeShow.textContent = code;
        show('host', ONLINE.waiting);
        const l = link;
        l.onStatus = (st) => {
          if (st === 'connected') finish(makeRoom(l, name));
        };
        if (l.connected) finish(makeRoom(l, name));
        return;
      }
      show('choice', ONLINE.errors.network, true);
    };

    const join = async (raw: string) => {
      const code = normalizeCode(raw);
      if (!code) return show('join', ONLINE.errors.badCode, true);
      const name = pseudo();
      show('busy', ONLINE.joining(code));
      try {
        link = await PeerLink.open('guest', code, linkOpts);
      } catch (e) {
        codeIn.value = code;
        return show('join', err(e), true);
      }
      if (done) return link.destroy();
      finish(makeRoom(link, name));
    };

    const share = async () => {
      const code = codeShow.textContent ?? '';
      const url = inviteLink(code);
      const el = q<HTMLElement>('[data-view="host"] [data-status]');
      try {
        if (navigator.share) await navigator.share({ title: GAME.name, text: ONLINE.shareText(code), url });
        else {
          await navigator.clipboard.writeText(url);
          el.textContent = ONLINE.copied;
        }
      } catch {
        el.textContent = url;
      }
    };

    const onClick = (e: Event) => {
      const act = (e.target as HTMLElement).closest('[data-act]')?.getAttribute('data-act');
      if (!act) return;
      if (act === 'create') void host();
      else if (act === 'join') {
        pseudo();
        show('join', '');
        codeIn.value = '';
        codeIn.focus();
      } else if (act === 'go') void join(codeIn.value);
      else if (act === 'share') void share();
      else if (act === 'back') {
        link?.destroy();
        link = null;
        if (root.dataset.show === 'choice') finish(null);
        else show('choice');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') void join(codeIn.value);
    };
    const onInput = () => {
      codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      if (codeIn.value.length === 4) codeIn.blur();
    };

    root.addEventListener('click', onClick);
    codeIn.addEventListener('keydown', onKey);
    codeIn.addEventListener('input', onInput);
    root.hidden = false;
    show('choice');
    if (opts.join) void join(opts.join);
  });
}
