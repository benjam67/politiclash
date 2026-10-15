import { describe, expect, it } from 'vitest';
import { PLAYABLE_IDS } from '../../src/config/roster';
import { campaignDone, campaignFoe, campaignLevel, campaignLoss, campaignWin, isFinalMatch, levelAt, sanitizeCampaign, startCampaign, withVictory } from '../../src/logic/campaign';
import { createRng } from '../../src/logic/rng';
import { defaultSave, parseSave, sanitize } from '../../src/logic/save';

const me = PLAYABLE_IDS[0];

describe('campagne présidentielle', () => {
  it('affronte une fois chacun des autres candidats, jamais soi-même', () => {
    for (const fighter of PLAYABLE_IDS) {
      const c = startCampaign(fighter, createRng(7));
      expect(c.order).toHaveLength(PLAYABLE_IDS.length - 1);
      expect(c.order).not.toContain(fighter);
      expect(new Set(c.order).size).toBe(c.order.length);
      expect(c).toMatchObject({ fighter, beaten: 0, retries: 0 });
    }
  });

  it('tire l’ordre au hasard', () => {
    const orders = new Set(Array.from({ length: 30 }, (_, i) => startCampaign(me, createRng(i + 1)).order.join()));
    expect(orders.size).toBeGreaterThan(10);
  });

  it('difficulté : match 1 en Facile, 2 et 3 en Normal, 4 et 5 en Difficile', () => {
    expect([0, 1, 2, 3, 4].map((i) => levelAt(i, 5))).toEqual(['easy', 'normal', 'normal', 'hard', 'hard']);
    // Avec plus de candidats plus tard : toujours Facile au début, Difficile à la fin.
    const ten = Array.from({ length: 10 }, (_, i) => levelAt(i, 10));
    expect(ten[0]).toBe('easy');
    expect(ten[9]).toBe('hard');
  });

  it('enchaîne les adversaires et rejoue le même après une défaite', () => {
    let c = startCampaign(me, createRng(3));
    const foes = [];
    expect(campaignLevel(c)).toBe('easy');
    for (let i = 0; i < c.order.length; i++) {
      expect(campaignDone(c)).toBe(false);
      expect(isFinalMatch(c)).toBe(i === c.order.length - 1);
      const foe = campaignFoe(c);
      c = campaignLoss(campaignLoss(c));
      // Deux défaites : toujours le même adversaire, au même niveau.
      expect(campaignFoe(c)).toBe(foe);
      foes.push(foe);
      c = campaignWin(c);
    }
    expect(campaignDone(c)).toBe(true);
    expect(foes).toEqual(c.order);
    expect(c.retries).toBe(2 * c.order.length);
  });

  it('palmarès : nombre de campagnes gagnées et record de recomptages', () => {
    const c = { ...startCampaign(me, createRng(1)), beaten: 5, retries: 3 };
    let p = withVictory({}, c);
    p = withVictory(p, { ...c, retries: 1 });
    p = withVictory(p, { ...c, retries: 4 });
    expect(p[me]).toEqual({ wins: 3, bestRetries: 1 });
  });

  it('sauvegarde : la campagne en cours et le palmarès survivent à la relecture', () => {
    const c = campaignLoss(campaignWin(startCampaign(me, createRng(9))));
    const s = { ...defaultSave(), campaign: c, palmares: { [me]: { wins: 2, bestRetries: 0 } } };
    expect(parseSave(JSON.stringify(s))).toEqual(s);
  });

  it('sauvegarde abîmée : la campagne est oubliée sans planter', () => {
    const c = startCampaign(me, createRng(9));
    expect(sanitizeCampaign({ ...c, fighter: 'bernard' })).toBeNull();
    expect(sanitizeCampaign({ ...c, order: [...c.order, me] })).toBeNull();
    expect(sanitizeCampaign({ ...c, order: c.order.slice(1) })).toBeNull();
    expect(sanitizeCampaign({ ...c, order: [c.order[0], ...c.order.slice(0, -1)] })).toBeNull();
    expect(sanitizeCampaign({ ...c, beaten: c.order.length })).toBeNull();
    expect(sanitizeCampaign({ ...c, beaten: -3, retries: 'x' })).toMatchObject({ beaten: 0, retries: 0 });
    const s = sanitize({ campaign: 'oui', palmares: { [me]: { wins: 0, bestRetries: 1 }, lune: { wins: 3, bestRetries: 0 } } });
    expect(s.campaign).toBeNull();
    expect(s.palmares).toEqual({});
  });
});
