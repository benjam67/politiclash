import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GABARITS, MATCH, MOVES } from '../../src/config/balance';
import { ACTIONS, POSE_FILES, poseFor } from '../../src/config/poses';
import { FIGHTER_IDS, ROSTER, ROSTER_SLOTS, spriteOf } from '../../src/config/roster';
import { STAGE_IDS, STAGES } from '../../src/config/stages';
import { COMMENTS, FIGHTER_TEXTS, STAGE_TEXTS } from '../../src/config/texts';

const ASSETS = path.resolve(__dirname, '../../public/assets');

describe('configuration des combattants', () => {
  it('tient dans l’écran de sélection', () => {
    expect(FIGHTER_IDS.length).toBeGreaterThanOrEqual(2);
    expect(FIGHTER_IDS.length).toBeLessThanOrEqual(ROSTER_SLOTS);
  });

  for (const id of FIGHTER_IDS) {
    describe(id, () => {
      it('a un gabarit, des mesures d’image et des textes', () => {
        expect(GABARITS[ROSTER[id].gabarit]).toBeDefined();
        expect(spriteOf(id).idle.height).toBeGreaterThan(0);
        const t = FIGHTER_TEXTS[id];
        for (const v of [t.name, t.short, t.special]) expect(v.length).toBeGreaterThan(0);
      });

      it('a une image pour chaque pose fournie', () => {
        for (const pose of POSE_FILES) expect(fs.existsSync(path.join(ASSETS, 'fighters', id, `${pose}.webp`)), pose).toBe(true);
      });

      it('associe chaque action à une image existante', () => {
        for (const action of ACTIONS) expect(POSE_FILES).toContain(poseFor(id, action).pose);
      });

      it('est plus bas accroupi que debout', () => {
        expect(ROSTER[id].body.crouch.h).toBeLessThan(ROSTER[id].body.stand.h);
      });
    });
  }
});

describe('gabarits', () => {
  for (const [name, g] of Object.entries(GABARITS)) {
    it(`${name} : valeurs cohérentes`, () => {
      expect(g.walkSpeed).toBeGreaterThan(0);
      expect(g.jumpMs).toBeGreaterThan(0);
      expect(g.goldenZone[0]).toBeLessThan(g.goldenZone[1]);
      expect(g.goldenZone[1]).toBeLessThanOrEqual(100);
      expect(g.special.hits).toBeGreaterThanOrEqual(1);
    });
  }

  it('aucun coup simple ne met K.O. d’un seul coup', () => {
    for (const m of [MOVES.quick, MOVES.crouch, MOVES.air]) expect(m.damage).toBeLessThan(MATCH.hp / 4);
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
