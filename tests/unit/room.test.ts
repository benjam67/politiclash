import { afterEach, describe, expect, it, vi } from 'vitest';
import { FriendRoom } from '../../src/net/friends';
import type { PeerLink } from '../../src/net/peer';
import { CODE_ALPHABET, cleanPseudo, inviteLink, makeCode, normalizeCode, peerIdFor, RULES_VERSION, type CtlMsg, type MatchStart, type Role } from '../../src/net/room';

describe('code de salon, lien, pseudo', () => {
  it('codes de 4 lettres sans I, O, 0 ni 1', () => {
    for (const ch of 'IO01') expect(CODE_ALPHABET).not.toContain(ch);
    for (let i = 0; i < 200; i++) expect(makeCode()).toMatch(/^[A-HJ-NP-Z]{4}$/);
  });

  it('un code saisi est nettoyé ; un code invalide est refusé', () => {
    expect(normalizeCode(' abcd ')).toBe('ABCD');
    expect(normalizeCode('ab-cd')).toBe('ABCD');
    expect(normalizeCode('abc')).toBeNull();
    expect(normalizeCode('ABCO')).toBeNull();
    expect(normalizeCode('AB1D')).toBeNull();
    expect(peerIdFor('ABCD')).toMatch(/^politiclash-v\d+-ABCD$/);
  });

  it('lien d’invitation : …/politiclash/?salon=ABCD, sans les autres réglages sauf ceux de test', () => {
    expect(inviteLink('ABCD', 'https://benjam67.github.io/politiclash/?scene=fight&seed=3#x')).toBe('https://benjam67.github.io/politiclash/?salon=ABCD');
    expect(inviteLink('ABCD', 'http://localhost:4173/politiclash/?peer=127.0.0.1:9000&lag=100')).toBe('http://localhost:4173/politiclash/?salon=ABCD&peer=127.0.0.1%3A9000&lag=100');
  });

  it('pseudo : espaces et caractères invisibles retirés, 14 caractères au plus', () => {
    expect(cleanPseudo('  Le   Député  ')).toBe('Le Député');
    expect(cleanPseudo('a\u0000b‮c​')).toBe('abc');
    expect(cleanPseudo('x'.repeat(40))).toHaveLength(14);
    expect(cleanPseudo('   ')).toBe('');
  });
});

/** Deux salons reliés par une fausse liaison (messages remis tout de suite, dans l'ordre). */
function pair() {
  const mk = (role: Role) => {
    const l = {
      role,
      code: 'ABCD',
      connected: true,
      onCtl: (_: CtlMsg) => {},
      onGame: () => {},
      onStatus: () => {},
      other: null as null | { onCtl: (m: CtlMsg) => void },
      sendCtl(m: CtlMsg) {
        l.other?.onCtl(JSON.parse(JSON.stringify(m)));
        return true;
      },
      sendGame() {},
      destroy() {},
    };
    return l;
  };
  const hl = mk('host');
  const gl = mk('guest');
  hl.other = gl;
  gl.other = hl;
  const host = new FriendRoom(hl as unknown as PeerLink, 'Hôte', 'doyen', 'elysee');
  const guest = new FriendRoom(gl as unknown as PeerLink, 'Invité', 'cadet', null);
  // L'invité se présente (à l'ouverture de la liaison, c'est l'événement `connected` qui le fait).
  (guest as unknown as { hello(): void }).hello();
  return { host, guest, hl, gl };
}

describe('salon Entre amis', () => {
  afterEach(() => vi.useRealTimers());

  it('chacun voit le pseudo et le perso de l’autre ; le lieu est celui de l’hôte', () => {
    const { host, guest } = pair();
    expect(host.them).toMatchObject({ pseudo: 'Invité', fighter: 'cadet', ready: false });
    expect(guest.them).toMatchObject({ pseudo: 'Hôte', fighter: 'doyen' });
    expect(guest.stage).toBe('elysee');
    // L'invité ne peut pas changer le lieu.
    guest.setStage('bar');
    expect(host.stage).toBe('elysee');
    host.close('self');
    guest.close('self');
  });

  it('le match part quand les deux sont prêts, avec les mêmes réglages des deux côtés', () => {
    const { host, guest } = pair();
    const starts: MatchStart[] = [];
    host.listen({ start: (s) => starts.push(s) });
    guest.listen({ start: (s) => starts.push(s) });
    host.setReady(true);
    expect(starts).toHaveLength(0);
    guest.setReady(true);
    expect(starts).toHaveLength(2);
    expect(starts[1]).toEqual(starts[0]);
    expect(starts[0]).toMatchObject({ n: 1, stage: 'elysee', fighters: ['doyen', 'cadet'] });
    expect(starts[0].delay).toBeGreaterThanOrEqual(3);
    host.close('self');
    guest.close('self');
  });

  it('changer de perso ou de lieu remet « Prêt » à zéro', () => {
    const { host, guest } = pair();
    guest.setReady(true);
    expect(host.them?.ready).toBe(true);
    guest.pick('barbe');
    expect(host.them).toMatchObject({ fighter: 'barbe', ready: false });
    guest.setReady(true);
    host.setStage('bastille');
    expect(guest.me.ready).toBe(false);
    expect(host.them?.ready).toBe(false);
    host.close('self');
    guest.close('self');
  });

  it('l’hôte se présente de nouveau (reconnexion) : l’invité reste prêt, et le match peut partir', () => {
    const { host, guest } = pair();
    const starts: MatchStart[] = [];
    host.listen({ start: (s) => starts.push(s) });
    guest.setReady(true);
    (host as unknown as { hello(): void }).hello();
    expect(guest.me.ready).toBe(true);
    expect(host.them?.ready).toBe(true);
    host.setReady(true);
    expect(starts).toHaveLength(1);
    host.close('self');
    guest.close('self');
  });

  it('revanche : il faut que les deux la demandent ; nouveau numéro de match', () => {
    const { host, guest } = pair();
    const starts: MatchStart[] = [];
    guest.listen({ start: (s) => starts.push(s) });
    host.setReady(true);
    guest.setReady(true);
    guest.askAgain();
    expect(host.again.them).toBe(true);
    expect(starts).toHaveLength(1);
    host.askAgain();
    expect(starts).toHaveLength(2);
    expect(starts[1].n).toBe(2);
    expect(starts[1].seed).not.toBe(starts[0].seed);
    host.close('self');
    guest.close('self');
  });

  it('retour au salon, départ, versions différentes', () => {
    const { host, guest, gl } = pair();
    let roomCalls = 0;
    const left: string[] = [];
    host.listen({ room: () => roomCalls++, leave: (w) => left.push(`h:${w}`) });
    guest.listen({ leave: (w) => left.push(`g:${w}`) });
    guest.backToRoom();
    expect(roomCalls).toBe(1);
    vi.useFakeTimers();
    guest.leave();
    vi.advanceTimersByTime(200);
    expect(left).toEqual(['h:bye', 'g:self']);
    // Un téléphone aux règles différentes est refusé.
    const p2 = pair();
    p2.gl.onCtl({ t: 'hello', pseudo: 'X', v: RULES_VERSION + 'x' });
    expect(p2.guest.closed).toBe('version');
    p2.host.close('self');
    void gl;
  });
});
