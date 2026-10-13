import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BUZZ, MATCH, MOVES, SPECIAL, STYLE } from '../../src/config/balance';
import { ACTIONS, frameOf, hasSpecialPoses, POSES_COMMON, posesOf, poseFor } from '../../src/config/poses';
import { PROP_FILES, SPECIALS } from '../../src/config/specials';
import assets from '../../src/config/assets.json';
import { FIGHTER_IDS, PLAYABLE_IDS, ROSTER, ROSTER_SLOTS, spriteOf } from '../../src/config/roster';
import { STAGE_IDS, STAGES } from '../../src/config/stages';
import { BUZZ_TEXTS, COMMENTS, FIGHTER_TEXTS, STAGE_TEXTS } from '../../src/config/texts';
import { PARRY_STEPS } from '../../src/logic/fight';

const ASSETS = path.resolve(__dirname, '../../public/assets');

describe('configuration des combattants', () => {
  it('tient dans l’écran de sélection', () => {
    expect(PLAYABLE_IDS.length).toBeGreaterThanOrEqual(2);
    expect(PLAYABLE_IDS.length).toBeLessThanOrEqual(ROSTER_SLOTS);
  });

  for (const id of FIGHTER_IDS) {
    describe(id, () => {
      it('a un coup spécial, des mesures d’image et des textes', () => {
        expect(SPECIALS[ROSTER[id].special]).toBeDefined();
        expect(FIGHTER_TEXTS[id].specialLines.length).toBeGreaterThan(0);
        expect(spriteOf(id).idle.height).toBeGreaterThan(0);
        const t = FIGHTER_TEXTS[id];
        for (const v of [t.name, t.short, t.special]) expect(v.length).toBeGreaterThan(0);
      });

      it('a ses poses communes, et une image pour chaque pose fournie', () => {
        // L'ancienne pose « special » n'est plus chargée quand les 3 poses du coup spécial sont là.
        for (const pose of POSES_COMMON) if (!(pose === 'special' && hasSpecialPoses(id))) expect(posesOf(id)).toContain(pose);
        for (const pose of posesOf(id)) expect(fs.existsSync(path.join(ASSETS, 'fighters', id, `${pose}.webp`)), pose).toBe(true);
      });

      it('associe chaque action à une image existante', () => {
        for (const action of ACTIONS) {
          const def = poseFor(id, action);
          expect(posesOf(id)).toContain(def.pose);
          for (const alt of def.alt ?? []) expect(posesOf(id)).toContain(alt);
          for (let t = 0; t < 60; t++) expect(posesOf(id)).toContain(frameOf(def, t));
        }
      });

      it('est plus bas accroupi que debout', () => {
        expect(ROSTER[id].body.crouch.h).toBeLessThan(ROSTER[id].body.stand.h);
      });
    });
  }
});

describe('style de combat commun', () => {
  it('valeurs cohérentes', () => {
    expect(STYLE.walkSpeed).toBeGreaterThan(0);
    expect(STYLE.jumpMs).toBeGreaterThan(0);
    expect(STYLE.goldenZone[0]).toBeLessThan(STYLE.goldenZone[1]);
    expect(STYLE.goldenZone[1]).toBeLessThanOrEqual(100);
  });

  it('aucun coup simple ne met K.O. d’un seul coup', () => {
    for (const m of [MOVES.quick, MOVES.air, MOVES.kick, MOVES.sweep]) expect(m.damage).toBeLessThan(MATCH.hp / 4);
  });

  it('tous les combattants ont les mêmes boîtes de corps ou presque (seules les mesures varient)', () => {
    for (const id of FIGHTER_IDS) expect(ROSTER[id].body.stand.h).toBeGreaterThan(ROSTER[id].body.crouch.h);
  });
});

describe('coups spéciaux', () => {
  it('chaque combattant a un coup spécial différent', () => {
    const used = FIGHTER_IDS.map((id) => ROSTER[id].special);
    expect(new Set(used).size).toBe(used.length);
  });

  for (const [name, sp] of Object.entries(SPECIALS)) {
    it(`${name} : déroulé dans l’ordre, signal avant l’impact, fenêtre de garde avant l’impact`, () => {
      expect(sp.poses[0]).toBeLessThan(sp.poses[1]);
      expect(sp.poses[1]).toBeLessThan(sp.end);
      expect(sp.signal + PARRY_STEPS).toBeLessThan(sp.impact);
      expect(sp.impact).toBeLessThan(sp.end);
      if (sp.range === 'far') expect(sp.launch).toBeLessThan(sp.impact);
      if ('prop' in sp && sp.prop) expect(PROP_FILES).toContain(sp.prop);
    });
  }

  it('35 PV, 18 avec une garde au bon moment ; un coup spécial ne met pas K.O. depuis la vie pleine', () => {
    expect(SPECIAL.damage).toBe(35);
    expect(SPECIAL.parriedDamage).toBe(18);
    expect(SPECIAL.damage).toBeLessThan(MATCH.hp);
    expect(PARRY_STEPS).toBe(6);
  });

  it('les accessoires fournis ont leur image', () => {
    for (const name of Object.keys(assets.specialProps)) expect(fs.existsSync(path.join(ASSETS, 'props', `${name}.webp`))).toBe(true);
  });

  it('barre Buzz : gains positifs, rien pour un coup reçu ou bloqué', () => {
    for (const v of [BUZZ.lightHit, BUZZ.bigHit, BUZZ.critHit, BUZZ.dodge]) expect(v).toBeGreaterThan(0);
    expect(BUZZ.critHit).toBeGreaterThan(BUZZ.bigHit);
    expect(BUZZ.bigHit).toBeGreaterThan(BUZZ.lightHit);
    expect(BUZZ.max).toBe(100);
    expect(BUZZ_TEXTS.button.length).toBeGreaterThan(0);
  });
});

describe('niveaux', () => {
  for (const id of STAGE_IDS) {
    it(`${id} : image présente, nom défini, sol dans l’image`, () => {
      expect(fs.existsSync(path.join(ASSETS, STAGES[id].file))).toBe(true);
      expect(STAGE_TEXTS[id].name.length).toBeGreaterThan(0);
      expect(STAGES[id].floorY).toBeLessThan(STAGES[id].height);
    });
  }
});

describe('textes', () => {
  it('chaque situation du commentateur a au moins une phrase', () => {
    for (const list of Object.values(COMMENTS)) expect(list.length).toBeGreaterThan(0);
  });
});

describe('poses du coup spécial', () => {
  for (const id of FIGHTER_IDS) {
    it(`${id} : ses trois vraies poses sont utilisées par la cinématique`, () => {
      expect(hasSpecialPoses(id)).toBe(true);
      expect(poseFor(id, 'special1')).toEqual({ pose: 'special1' });
      expect(poseFor(id, 'special3')).toEqual({ pose: 'special3' });
    });
  }

  it('les deux accessoires sont fournis', () => {
    expect(Object.keys(assets.specialProps).sort()).toEqual([...PROP_FILES].sort());
  });
});
