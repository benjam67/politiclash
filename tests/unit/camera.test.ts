import { describe, expect, it } from 'vitest';
import { ARENA, SIM } from '../../src/config/balance';
import { computeCamera, minZoom } from '../../src/logic/camera';

const STAGE_W = 2 * SIM.screenW;

describe('caméra', () => {
  it('suit le milieu entre les deux combattants', () => {
    expect(computeCamera(844, 700, 900, STAGE_W)).toEqual({ x: 800, zoom: 1 });
  });

  it('ne sort pas du niveau', () => {
    expect(computeCamera(844, 140, 300, STAGE_W).x).toBe(422);
    expect(computeCamera(844, STAGE_W - 300, STAGE_W - 140, STAGE_W).x).toBe(STAGE_W - 422);
  });

  it('sur un téléphone 19,5:9, les deux tiennent à l’écran sans recul, même au plus loin', () => {
    expect(computeCamera(844, 400, 400 + ARENA.maxSeparation, STAGE_W).zoom).toBe(1);
    expect(minZoom(844)).toBe(1);
  });

  it('sur un écran plus étroit, elle recule juste assez pour garder les deux à l’écran', () => {
    for (const viewW of [693, 520]) {
      const x0 = 500;
      const x1 = x0 + ARENA.maxSeparation;
      const c = computeCamera(viewW, x0, x1, STAGE_W);
      expect(c.zoom).toBeLessThan(1);
      expect(c.zoom).toBeCloseTo(minZoom(viewW), 6);
      const half = viewW / (2 * c.zoom);
      expect(x0 - ARENA.wallMargin).toBeGreaterThanOrEqual(c.x - half - 1e-6);
      expect(x1 + ARENA.wallMargin).toBeLessThanOrEqual(c.x + half + 1e-6);
    }
  });
});
