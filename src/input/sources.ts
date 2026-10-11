// Sources d'entrées : chacune produit un InputFrame par pas de simulation.
import { noInput, type InputFrame } from '../logic/input';
import { createRng } from '../logic/rng';

export interface InputSource {
  read(): InputFrame;
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
