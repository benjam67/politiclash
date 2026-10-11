// Sources d'entrées : chacune produit un InputFrame par pas de simulation.
import { GABARITS } from '../config/balance';
import { ROSTER } from '../config/roster';
import { SUB, type FightState } from '../logic/fight';
import { noInput, type InputFrame } from '../logic/input';
import { createRng } from '../logic/rng';

export interface InputSource {
  /** `state` et `me` : ce que voit la source (l'adversaire provisoire et l'IA en ont besoin, pas le joueur). */
  read(state?: FightState, me?: 0 | 1): InputFrame;
  destroy?(): void;
}

/** Clavier : flèches ou ZQSD (touches physiques, donc WASD sur un clavier anglais), J gifle, K grosse gifle, L garde. */
export class KeyboardSource implements InputSource {
  private down = new Set<string>();
  private static readonly USED = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyJ', 'KeyK', 'KeyL']);
  private onDown = (e: KeyboardEvent) => {
    if (!KeyboardSource.USED.has(e.code)) return;
    this.down.add(e.code);
    e.preventDefault();
  };
  private onUp = (e: KeyboardEvent) => this.down.delete(e.code);
  private onBlur = () => this.down.clear();

  constructor() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  read(): InputFrame {
    const d = this.down;
    return {
      gauche: d.has('ArrowLeft') || d.has('KeyA'),
      droite: d.has('ArrowRight') || d.has('KeyD'),
      haut: d.has('ArrowUp') || d.has('KeyW'),
      bas: d.has('ArrowDown') || d.has('KeyS'),
      gifle: d.has('KeyJ'),
      grosseGifle: d.has('KeyK'),
      garde: d.has('KeyL'),
    };
  }

  destroy() {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }
}

/** Ne fait rien. */
export class IdleSource implements InputSource {
  read() {
    return noInput();
  }
}

/**
 * Adversaire provisoire de la phase 1 : il se promène (avance, recule, saute, s'accroupit)
 * pour qu'on voie les deux combattants bouger. Remplacé par le mannequin (phase 2) puis l'IA (phase 3).
 */
export class WanderSource implements InputSource {
  private rng: () => number;
  private current = noInput();
  private left = 0;

  constructor(seed = 7) {
    this.rng = createRng(seed);
  }

  read(): InputFrame {
    if (this.left-- <= 0) {
      const r = this.rng();
      const i = noInput();
      if (r < 0.3) i.gauche = true;
      else if (r < 0.6) i.droite = true;
      else if (r < 0.7) i.bas = true;
      else if (r < 0.8) i.haut = true;
      else if (r < 0.87) i.haut = i.gauche = true;
      else if (r < 0.94) i.haut = i.droite = true;
      this.current = i;
      this.left = 15 + Math.floor(this.rng() * 45);
    }
    return this.current;
  }
}

/**
 * Mannequin de la phase 2 : il avance, garde et gifle au hasard, sans regarder ce que fait le joueur.
 * Remplacé par la vraie IA en phase 3.
 */
export class DummySource implements InputSource {
  private rng: () => number;
  private plan = noInput();
  private left = 0;
  /** Petite pause sans bouton entre deux décisions : chaque appui est un nouvel appui. */
  private pause = 0;

  constructor(seed = 7) {
    this.rng = createRng(seed);
  }

  read(state?: FightState, me: 0 | 1 = 1): InputFrame {
    if (!state || state.phase !== 'fight') return noInput();
    if (this.left > 0) {
      this.left -= 1;
      return this.plan;
    }
    if (this.pause > 0) {
      this.pause -= 1;
      return noInput();
    }
    const self = state.f[me];
    const foe = state.f[me === 0 ? 1 : 0];
    const dx = (foe.x - self.x) / SUB;
    const toward = dx >= 0 ? 'droite' : 'gauche';
    const away = dx >= 0 ? 'gauche' : 'droite';
    const dist = Math.abs(dx);
    const r = this.rng();
    const i = noInput();
    let hold = 10 + Math.floor(this.rng() * 20);

    if (dist > 150) {
      // Loin : il se rapproche, parfois en sautant.
      i[toward] = true;
      if (r < 0.12) i.haut = true;
      else if (r > 0.9) i[toward] = false;
    } else if (r < 0.34) {
      i.gifle = true;
      hold = 3;
    } else if (r < 0.44) {
      i.bas = i.gifle = true;
      hold = 3;
    } else if (r < 0.62) {
      i.garde = true;
      hold = 25 + Math.floor(this.rng() * 40);
    } else if (r < 0.78) {
      // Grosse gifle : il vise autour de la zone dorée, sans la trouver à tous les coups.
      const g = GABARITS[ROSTER[self.id].gabarit];
      const target = (g.goldenZone[0] + g.goldenZone[1]) / 200 + (this.rng() - 0.5) * 0.5;
      i.grosseGifle = true;
      hold = Math.max(8, Math.round((g.chargeTimeMs / 1000) * 60 * Math.min(1.15, Math.max(0.3, target))));
    } else if (r < 0.88) {
      i[away] = true;
    } else if (r < 0.94) {
      i.haut = true;
      i[toward] = true;
      hold = 4;
    } else {
      i.bas = true;
    }
    this.plan = i;
    this.left = hold;
    this.pause = 4 + Math.floor(this.rng() * 14);
    return i;
  }
}
