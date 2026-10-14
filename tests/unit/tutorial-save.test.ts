import { describe, expect, it } from 'vitest';
import { BUZZ, MATCH } from '../../src/config/balance';
import { PLAYABLE_IDS } from '../../src/config/roster';
import { chargePct, createFightStarted, HP, inGolden, ROUND_STEPS, step, SUB, type FightState } from '../../src/logic/fight';
import { noInput, type InputFrame } from '../../src/logic/input';
import { defaultSave, parseSave, sanitize, totalWins, withResult } from '../../src/logic/save';
import { createTuto, TUTO_PAUSE, TUTO_STEPS, tutoAfterStep, tutoDone, tutoPartner, tutoStep, type Tuto } from '../../src/logic/tutorial';

describe('sauvegarde', () => {
  it('rend une sauvegarde neuve quand il n’y a rien ou que c’est illisible', () => {
    expect(parseSave(null)).toEqual(defaultSave());
    expect(parseSave('{pas du json')).toEqual(defaultSave());
    expect(parseSave('42')).toEqual(defaultSave());
  });

  it('garde ce qui est valide et remet le reste d’aplomb', () => {
    const id = PLAYABLE_IDS[2];
    const s = sanitize({ tutorialDone: true, level: 'hard', lastFighter: id, lastStage: 'elysee', record: { easy: { w: 3, l: -2 }, hard: { w: 'x', l: 1.7 } } });
    expect(s.tutorialDone).toBe(true);
    expect(s.level).toBe('hard');
    expect(s.lastFighter).toBe(id);
    expect(s.lastStage).toBe('elysee');
    expect(s.record).toEqual({ easy: { w: 3, l: 0 }, normal: { w: 0, l: 0 }, hard: { w: 0, l: 1 } });
    const bad = sanitize({ tutorialDone: 'oui', level: 'impossible', lastFighter: 'bernard', lastStage: 'lune' });
    expect(bad).toEqual(defaultSave());
  });

  it('compte victoires et défaites par niveau', () => {
    let s = defaultSave();
    s = withResult(s, 'easy', true);
    s = withResult(s, 'easy', true);
    s = withResult(s, 'hard', false);
    expect(s.record.easy).toEqual({ w: 2, l: 0 });
    expect(s.record.hard).toEqual({ w: 0, l: 1 });
    expect(totalWins(s)).toBe(2);
    // Aller-retour par le texte enregistré.
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });
});

/** Un joueur scripté qui fait ce que demande chaque exercice. */
function student(t: Tuto, s: FightState): InputFrame {
  const i = noInput();
  const me = s.f[0];
  const foe = s.f[1];
  const dx = (foe.x - me.x) / SUB;
  const near = Math.abs(dx) < 120;
  const toward = () => (dx > 0 ? (i.droite = true) : (i.gauche = true));
  const tick = s.step % 12 < 2;
  switch (tutoStep(t)) {
    case 'walk':
      i.droite = true;
      break;
    case 'jumpCrouch':
      if (!t.jumped) i.haut = me.y === 0;
      else i.bas = true;
      break;
    case 'slap':
      if (!near) toward();
      else i.gifle = tick;
      break;
    case 'kick':
      if (!near) toward();
      else i.pied = tick;
      break;
    case 'big':
      if (!near) toward();
      // Maintient, et relâche dans la zone dorée.
      else i.grosseGifle = !(me.mode === 'charge' && inGolden(chargePct(me.chg)));
      break;
    case 'guard':
      i.garde = true;
      break;
    case 'buzz':
      // Un nouvel appui, maintenu jusqu'à remplir le cercle.
      i.grosseGifle = s.step % 90 > 2;
      break;
  }
  return i;
}

describe('tutoriel', () => {
  const play = (limit: number, who: (t: Tuto, s: FightState) => InputFrame = student) => {
    let s = createFightStarted(PLAYABLE_IDS[0], PLAYABLE_IDS[1], 'bar', 3);
    let t = createTuto();
    const seen: string[] = [];
    let n = 0;
    for (; n < limit && !tutoDone(t); n++) {
      s = step(s, who(t, s), tutoPartner(t, s));
      t = tutoAfterStep(t, s);
      const id = tutoStep(t);
      if (id && seen[seen.length - 1] !== id) seen.push(id);
      expect(s.phase).not.toBe('matchEnd');
    }
    return { s, t, seen, n };
  };

  it('un joueur qui suit les consignes finit les 7 exercices, dans l’ordre', () => {
    const { t, seen, n } = play(60 * 120);
    expect(tutoDone(t)).toBe(true);
    expect(seen).toEqual([...TUTO_STEPS]);
    // Court : moins d'une minute de jeu pour un joueur qui fait juste ce qu'on demande.
    expect(n).toBeLessThan(60 * 60);
  });

  it('le combat reste ouvert : chrono arrêté, PV remis, pas de K.O. même sans rien faire', () => {
    let s = createFightStarted(PLAYABLE_IDS[0], PLAYABLE_IDS[1], 'bar', 3);
    // On saute directement à l'exercice de garde : le partenaire attaque, le joueur ne garde pas.
    let t: Tuto = { ...createTuto(), i: TUTO_STEPS.indexOf('guard') };
    let hits = 0;
    for (let n = 0; n < 60 * 90; n++) {
      s = step(s, noInput(), tutoPartner(t, s));
      t = tutoAfterStep(t, s);
      hits += s.ev.filter((e) => e.t === 'hit' && e.by === 1).length;
      expect(s.timeLeft).toBe(ROUND_STEPS);
      expect(s.f[0].hp).toBeGreaterThan(0);
    }
    expect(hits).toBeGreaterThan(10);
    expect(s.phase).toBe('fight');
    expect(tutoStep(t)).toBe('guard');
  });

  it('pas de coup spécial avant le dernier exercice ; barre pleine au dernier', () => {
    let s = createFightStarted(PLAYABLE_IDS[0], PLAYABLE_IDS[1], 'bar', 3);
    s.f[0].buzz = BUZZ.max;
    let t = createTuto();
    s = step(s, noInput(), noInput());
    t = tutoAfterStep(t, s);
    expect(s.f[0].buzz).toBeLessThan(BUZZ.max);
    t = { ...createTuto(), i: TUTO_STEPS.indexOf('buzz') };
    t = tutoAfterStep(t, s);
    expect(s.f[0].buzz).toBe(BUZZ.max);
  });

  it('un exercice réussi est suivi d’une pause « BIEN ! » avant le suivant', () => {
    let s = createFightStarted(PLAYABLE_IDS[0], PLAYABLE_IDS[1], 'bar', 3);
    let t = createTuto();
    let n = 0;
    while (t.pause === 0 && n++ < 600) {
      s = step(s, student(t, s), tutoPartner(t, s));
      t = tutoAfterStep(t, s);
    }
    expect(tutoStep(t)).toBe('walk');
    for (let k = 0; k < TUTO_PAUSE; k++) {
      s = step(s, noInput(), tutoPartner(t, s));
      t = tutoAfterStep(t, s);
    }
    expect(tutoStep(t)).toBe('jumpCrouch');
    expect(t.n).toBe(0);
    expect(s.f[1].hp).toBe(MATCH.hp * HP);
  });
});
