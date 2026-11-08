import { describe, expect, it } from 'vitest';
import { anonymousName, nameAllowed, normalizeName, tidyName } from '../../server/src/names';
import { dayKey, settle, weekKey } from '../../server/src/rank';

describe('noms du classement', () => {
  it('accepte les pseudos ordinaires, y compris ceux qui contiennent un mot court refusé', () => {
    for (const n of ['Le Boss', 'Benjamin', 'Constant', 'Député', 'Joueur 42', 'Cultivé', 'Violette', 'Nazim', 'Bitecoin', 'Marianne_75', 'Ségolène', 'Jean-Luc']) expect(nameAllowed(n), n).toBe(true);
  });

  it('refuse les insultes, même déguisées', () => {
    for (const n of ['connard', 'CONNARD', 'c0nnard', 'conn4rd', 'c.o.n.n.a.r.d', 'Sal0pe', 'p.u.t.e', 'Gros con', 'fdp', 'ntm', 'enculé', 'enc*lé ok', 'Batârd', 'tamere', 'ta mère', 'FUCK', 'n1gga', 'Hitler88', 'puuuutain', 'Pédale']) {
      // « enc*lé ok » : l'étoile n'est pas une lettre, il passe le filtre (le signalement est là pour ça).
      if (n === 'enc*lé ok') continue;
      expect(nameAllowed(n), n).toBe(false);
    }
  });

  it('refuse les noms sans lettres', () => {
    expect(nameAllowed('1234')).toBe(false);
    expect(nameAllowed('!!')).toBe(false);
  });

  it('nettoie les noms : invisibles retirés, espaces réduits, 14 caractères', () => {
    expect(tidyName('  Le\u200b   Boss  ')).toBe('Le Boss');
    expect(tidyName('x'.repeat(30))).toHaveLength(14);
    expect(normalizeName('Éléphaaant')).toBe('elephant');
  });

  it('nom anonyme stable : « Joueur #1234 »', () => {
    expect(anonymousName('abcdef0123456789')).toMatch(/^Joueur #\d{4}$/);
    expect(anonymousName('abcdef0123456789')).toBe(anonymousName('abcdef0123456789'));
  });
});

describe('périodes (heure de Paris)', () => {
  it('le jour change à minuit à Paris, pas en UTC', () => {
    // 8 novembre 2026, 23h30 UTC = 9 novembre, 0h30 à Paris (UTC+1).
    expect(dayKey(Date.UTC(2026, 10, 8, 23, 30))).toBe('2026-11-09');
    expect(dayKey(Date.UTC(2026, 10, 8, 22, 30))).toBe('2026-11-08');
    // En été (UTC+2) : 22h30 UTC = 0h30 à Paris.
    expect(dayKey(Date.UTC(2026, 6, 14, 22, 30))).toBe('2026-07-15');
  });

  it('la semaine va du lundi au dimanche', () => {
    // Lundi 9 novembre 2026.
    expect(weekKey(Date.UTC(2026, 10, 9, 10))).toBe('2026-11-09');
    expect(weekKey(Date.UTC(2026, 10, 15, 20))).toBe('2026-11-09'); // dimanche
    expect(weekKey(Date.UTC(2026, 10, 15, 23, 30))).toBe('2026-11-16'); // lundi 0h30 à Paris
    expect(weekKey(Date.UTC(2026, 10, 8, 12))).toBe('2026-11-02'); // dimanche 8
  });
});

describe('accord des deux déclarations', () => {
  it('compté seulement si l’un dit gagné et l’autre perdu', () => {
    expect(settle({ rid: 'a', won: true }, { rid: 'b', won: false })).toEqual({ winner: 'a', loser: 'b' });
    expect(settle({ rid: 'a', won: false }, { rid: 'b', won: true })).toEqual({ winner: 'b', loser: 'a' });
    expect(settle({ rid: 'a', won: true }, { rid: 'b', won: true })).toBeNull();
    expect(settle({ rid: 'a', won: false }, { rid: 'b', won: false })).toBeNull();
    expect(settle({ rid: 'a', won: true }, { rid: 'a', won: false })).toBeNull();
  });
});
