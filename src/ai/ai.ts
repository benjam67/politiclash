// L'IA : elle produit des entrées, comme un joueur. Elle ne triche pas : elle voit l'adversaire
// avec un temps de réaction (son état d'il y a quelques pas), jamais ses touches.
import { BIG_SLAP, GABARITS, MOVES } from '../config/balance';
import { ROSTER } from '../config/roster';
import { TEXTS_AI } from '../config/texts';
import { chargePct, moveSteps, physicsOf, SUB, type FighterState, type FightState } from '../logic/fight';
import { noInput, type InputFrame } from '../logic/input';
import { createRng } from '../logic/rng';
import type { InputSource } from '../input/sources';

export type AiLevel = 'easy' | 'normal' | 'hard';
export const AI_LEVELS: AiLevel[] = ['easy', 'normal', 'hard'];
export const levelLabel = (l: AiLevel) => TEXTS_AI[l];

export interface AiProfile {
  /** Temps de réaction : elle voit l'adversaire avec ce retard (pas de simulation). */
  reaction: number;
  /** Pause entre deux décisions quand rien ne presse (pas) : [min, max]. */
  think: [number, number];
  /** Chance de se défendre quand elle voit partir un coup. */
  defend: number;
  /** Chance de s'accroupir sous une gifle haute plutôt que de garder (esquive sans user la garde). */
  duck: number;
  /** Chance de punir une ouverture (coup raté, adversaire sonné, charge trop longue). */
  punish: number;
  /** Chance d'enchaîner une deuxième gifle quand la première a touché (multipliée par `punish`). */
  combo: number;
  /** Part de coups de pied quand elle enchaîne ou attaque une garde : elle varie les hauteurs. */
  mix: number;
  /** Chance de gifler un adversaire qui charge à portée. */
  interrupt: number;
  /** Chance de répondre à une garde par une grosse gifle visée en zone dorée. */
  breakGuard: number;
  /** Part de grosses gifles dans ses attaques. */
  bigShare: number;
  /** Précision de la grosse gifle : écart type autour du milieu de la zone dorée, en % de charge. */
  aimError: number;
}

export const AI_PROFILES: Record<AiLevel, AiProfile> = {
  easy: { reaction: 26, think: [26, 60], defend: 0.12, duck: 0, punish: 0.25, combo: 0.3, mix: 0.1, interrupt: 0.15, breakGuard: 0.05, bigShare: 0.3, aimError: 22 },
  normal: { reaction: 15, think: [12, 32], defend: 0.45, duck: 0.15, punish: 0.6, combo: 0.7, mix: 0.25, interrupt: 0.5, breakGuard: 0.3, bigShare: 0.22, aimError: 9 },
  hard: { reaction: 8, think: [4, 16], defend: 0.8, duck: 0.4, punish: 0.95, combo: 0.9, mix: 0.4, interrupt: 0.85, breakGuard: 0.6, bigShare: 0.2, aimError: 3.5 },
};

interface PlanStep {
  input: InputFrame;
  /** Durée en pas, ou condition d'arrêt (vraie = on passe à la suite). */
  steps: number;
  until?: (me: FighterState, foe: FighterState) => boolean;
}

const key = (...keys: (keyof InputFrame)[]): InputFrame => {
  const i = noInput();
  for (const k of keys) i[k] = true;
  return i;
};

export class AiSource implements InputSource {
  private rng: () => number;
  private profile: AiProfile;
  /** États passés : c'est ce que l'IA « voit » de l'adversaire. */
  private seen: FightState[] = [];
  private plan: PlanStep[] = [];
  private wait = 0;
  /** Le plan en cours est une riposte : elle va au bout, sans se remettre en garde au premier geste adverse. */
  private committed = false;
  /** Dernier coup adverse auquel elle a déjà décidé de réagir (ou non). */
  private judged = -1;
  /** Pas du dernier coup adverse qu'elle a vu partir : un adversaire qui gifle sans arrêt se respecte. */
  private lastSwing = -1000;
  private lastLow = false;
  private round = 0;
  private lastMode = 'free';
  private now = 0;

  constructor(readonly level: AiLevel, seed = 1) {
    this.profile = AI_PROFILES[level];
    this.rng = createRng(seed);
  }

  private between([a, b]: [number, number]) {
    return a + Math.floor(this.rng() * (b - a + 1));
  }

  /** Loi normale approchée (somme de 3 tirages), centrée sur 0, écart type 1. */
  private gauss() {
    return (this.rng() + this.rng() + this.rng() - 1.5) * 2;
  }

  read(state?: FightState, me: 0 | 1 = 1): InputFrame {
    if (!state) return noInput();
    if (state.round !== this.round || state.phase !== 'fight') {
      // Nouveau round ou pause : on repart de zéro.
      this.round = state.round;
      this.plan = [];
      this.seen = [];
      this.wait = 0;
      this.judged = -1;
      this.lastSwing = -1000;
      this.lastLow = false;
      this.lastMode = 'free';
      if (state.phase !== 'fight') return noInput();
    }
    const p = this.profile;
    this.now = state.step;
    this.seen.push(state);
    if (this.seen.length > p.reaction + 1) this.seen.shift();
    const self = state.f[me];
    const other = me === 0 ? 1 : 0;
    // L'adversaire tel qu'elle le voit : en retard de son temps de réaction.
    const old = this.seen[0];
    const foe = old.f[other];
    const dist = Math.abs(foe.x - self.x) / SUB;

    // Elle ne peut rien décider pendant qu'elle subit.
    const was = this.lastMode;
    this.lastMode = self.mode;
    if (self.mode !== 'free' && self.mode !== 'guard' && self.mode !== 'charge') {
      if (self.mode === 'block') {
        // Elle vient de bloquer : elle garde encore un instant à la même hauteur, le temps de voir venir la suite.
        this.plan = [{ input: self.stance === 'crouch' ? key('garde', 'bas') : key('garde'), steps: 3 }];
      } else if (self.mode !== 'attack' && self.mode !== 'recover') this.plan = [];
      return this.follow(self, foe);
    }

    // Sa gifle vient de toucher : elle enchaîne tant que l'adversaire est figé (elle sent son propre coup, sans retard).
    const now = state.f[other];
    if (was === 'attack' && self.mode === 'free' && (now.mode === 'hit' || now.mode === 'stun') && dist <= this.range(self, now) && this.rng() < p.punish * p.combo) {
      // Elle varie : parfois un coup de pied, pour passer sous une garde haute.
      this.plan = this.rng() < p.mix ? this.tap('pied') : this.tap('gifle');
      this.wait = 0;
      return this.follow(self, foe);
    }

    // Sous pression : elle sort d'un coup reçu ou bloqué, l'adversaire est encore au contact.
    if (dist < this.range(foe, self) + 14) {
      if (was === 'block' && this.rng() < p.punish) {
        // Après un blocage, elle a la main : sa gifle part avant la suivante de l'adversaire.
        this.plan = this.tap('gifle');
        this.wait = 0;
        return this.follow(self, foe);
      }
      if (was === 'hit' && this.rng() < p.defend) {
        // Après un coup reçu, elle se couvre au lieu de rendre coup pour coup. Sans voir le coup, elle doit deviner la hauteur.
        this.plan = [{ input: this.guess(), steps: 22 }];
        this.wait = 0;
        return this.follow(self, foe);
      }
    }

    // 1. Réflexe de défense : elle voit partir un coup à portée. Un seul jugement par coup.
    const threat = foe.mode === 'attack' && foe.move !== null && !foe.hitDone && dist < this.range(foe, self) + 55;
    if (foe.mode === 'attack') {
      this.lastSwing = state.step;
      if (foe.move) this.lastLow = MOVES[foe.move].level === 'low';
    }
    if (threat) {
      const id = old.step - foe.mt;
      if (id !== this.judged) {
        this.judged = id;
        if (self.mode !== 'charge' && !(this.committed && this.plan.length > 0) && this.rng() < p.defend) {
          const m = moveSteps(foe.move as keyof typeof MOVES, foe.id);
          // Elle voit le coup avec du retard : elle se couvre assez longtemps pour arrêter aussi le suivant,
          // si l'adversaire enchaîne les gifles sans réfléchir.
          const left = Math.max(20, m.startup + Math.max(0, m.active) - foe.mt + 4);
          if (MOVES[foe.move as keyof typeof MOVES].level === 'low') {
            // Coup de pied : garde basse, ou un saut par-dessus.
            this.plan = this.rng() < p.duck * 0.5 ? [{ input: key('haut'), steps: 3 }] : [{ input: key('garde', 'bas'), steps: left }];
          } else {
            // Une gifle haute passe au-dessus d'un adversaire accroupi ; le critique traverse la garde.
            const duckable = foe.move === 'quick' || foe.move === 'big';
            const duck = duckable && (this.rng() < p.duck || (foe.move === 'big' && foe.bigCrit && this.rng() < p.defend));
            this.plan = [{ input: key(duck ? 'bas' : 'garde'), steps: left }];
          }
          this.wait = 0;
        }
      }
    }

    // En garde ou en attente, elle guette l'ouverture : dès qu'elle en voit une, elle sort de sa garde.
    const open = (self.mode === 'free' || self.mode === 'guard') && this.opening(self, foe, dist);
    if (open && this.plan[0]?.input.garde && !this.committed) this.plan = [];
    if (this.plan.length > 0) return this.follow(self, foe);
    this.committed = false;
    if (this.wait > 0 && !open) {
      // À portée de l'adversaire, elle ne traîne pas : sa réflexion va trois fois plus vite.
      this.wait -= dist < this.range(foe, self) + 14 ? 3 : 1;
      // En attendant, elle avance si elle est loin.
      return dist > this.range(self, foe) + 16 ? key(this.toward(self, foe)) : noInput();
    }

    this.decide(self, foe, dist);
    return this.follow(self, foe);
  }

  /**
   * L'adversaire (tel qu'elle le voit) est-il ouvert, et a-t-elle le temps de le gifler avant qu'il ne se reprenne ?
   * Elle sait qu'elle le voit avec du retard et en tient compte, comme un joueur qui a pris le rythme.
   */
  private opening(self: FighterState, foe: FighterState, dist: number) {
    const reach = this.range(self, foe);
    if (dist > reach + 30) return false;
    if (foe.mode === 'stun' || foe.mode === 'self') return true;
    if (foe.mode !== 'attack' || foe.move === null || foe.move === 'air') return false;
    const m = moveSteps(foe.move, foe.id);
    if (foe.mt < m.startup) return false;
    // Temps qu'il lui reste avant de pouvoir frapper de nouveau, vu d'aujourd'hui.
    const available = m.startup + Math.max(0, m.active) + m.recovery - (foe.mt + this.profile.reaction) + m.startup;
    const walk = Math.max(0, Math.ceil(((dist - reach + 2) * SUB) / physicsOf(self.id).walk));
    return walk + moveSteps('quick', self.id).startup + 2 <= available;
  }

  /**
   * Garde prise sans avoir vu le coup : elle parie sur la hauteur du dernier coup adverse qu'elle a vu,
   * d'autant plus sûrement que le niveau est élevé. Sans indice : haute, les gifles étant plus fréquentes.
   */
  private guess(): InputFrame {
    const low = this.rng() < this.profile.defend ? this.lastLow : this.rng() < 0.3;
    return low ? key('garde', 'bas') : key('garde');
  }

  private toward(self: FighterState, foe: FighterState): 'gauche' | 'droite' {
    return foe.x >= self.x ? 'droite' : 'gauche';
  }

  /** Portée utile de `att` sur `def` : la distance jusqu'où sa gifle rapide touche (px), avec une petite marge. */
  private range(att: FighterState, def: FighterState) {
    return MOVES.quick.box.x1 * ROSTER[att.id].reach + ROSTER[def.id].body.stand.halfW - 6;
  }

  /** Grosse gifle visée : maintenir jusqu'à la charge voulue, puis relâcher. */
  private chargeTo(self: FighterState, pct: number): PlanStep[] {
    const target = Math.max(BIG_SLAP.minChargePct + 2, Math.min(100, pct));
    const mt = Math.ceil((target * physicsOf(self.id).chargeSteps) / 100);
    return [
      { input: key('grosseGifle'), steps: mt + 4, until: (me) => me.mode === 'charge' && me.mt >= mt },
      { input: noInput(), steps: 2 },
    ];
  }

  private aimed(self: FighterState): PlanStep[] {
    const [a, b] = GABARITS[ROSTER[self.id].gabarit].goldenZone;
    return this.chargeTo(self, (a + b) / 2 + this.gauss() * this.profile.aimError);
  }

  private tap(...keys: (keyof InputFrame)[]): PlanStep[] {
    return [
      { input: key(...keys), steps: 2 },
      { input: noInput(), steps: 2 },
    ];
  }

  private decide(self: FighterState, foe: FighterState, dist: number) {
    const p = this.profile;
    const r = this.rng();
    const reach = this.range(self, foe);
    const inRange = dist <= reach;
    const toward = this.toward(self, foe);
    const away = toward === 'droite' ? 'gauche' : 'droite';
    this.wait = this.between(p.think);

    // 2. Ouverture : adversaire sonné, qui vient de se gifler, ou dont le coup est parti (raté ou non, il doit récupérer).
    if (this.opening(self, foe, dist) && this.rng() < p.punish) {
      this.committed = true;
      if (!inRange) {
        this.plan = [{ input: key(toward), steps: 10, until: (me, f) => Math.abs(f.x - me.x) / SUB <= reach - 2 }, ...this.tap('gifle')];
        this.wait = 0;
      } else if (foe.mode === 'stun' && foe.left > physicsOf(self.id).chargeSteps * 0.9) {
        this.plan = this.aimed(self);
      } else {
        this.plan = this.tap('gifle');
        this.wait = Math.min(this.wait, 6);
      }
      return;
    }

    // L'adversaire gifle sans arrêt et il est près : elle se couvre et attend l'ouverture au lieu d'avancer dans ses coups.
    if (this.now - this.lastSwing < 50 && dist < this.range(foe, self) + 60 && this.rng() < p.defend) {
      const edge = this.range(foe, self) + 12;
      // Hors de sa portée, elle vient se placer juste au bord ; à sa portée, elle garde.
      this.plan = dist > edge + 4 ? [{ input: key(toward), steps: 12, until: (me, f) => Math.abs(f.x - me.x) / SUB <= edge }] : [{ input: this.guess(), steps: 16 }];
      this.wait = 0;
      return;
    }

    // 3. L'adversaire charge : on le coupe, ou on se met hors de portée.
    if (foe.mode === 'charge') {
      if (this.rng() < p.interrupt) {
        if (inRange) this.plan = this.tap('gifle');
        else this.plan = [{ input: key(toward), steps: 24, until: (me, f) => Math.abs(f.x - me.x) / SUB <= reach - 8 }, ...this.tap('gifle')];
        this.wait = 2;
        return;
      }
      if (inRange && r < 0.5) {
        this.plan = [{ input: key(away), steps: 18 }];
        return;
      }
    }

    // 4. L'adversaire garde : elle frappe à l'autre hauteur, ou brise la garde haute d'une grosse gifle en zone dorée.
    if (foe.mode === 'guard' && inRange) {
      if (this.rng() < p.mix * 2) {
        this.plan = foe.stance === 'crouch' ? this.tap('gifle') : this.tap('pied');
        this.wait = Math.min(this.wait, 6);
        return;
      }
      if (foe.stance !== 'crouch' && this.rng() < p.breakGuard) {
        this.plan = this.aimed(self);
        return;
      }
    }

    // 5. Loin : on se rapproche, parfois en sautant avec une gifle aérienne.
    if (!inRange) {
      if (dist < reach + 110 && r < 0.14) {
        this.plan = [{ input: key('haut', toward), steps: 3 }, { input: noInput(), steps: 8 }, ...this.tap('gifle')];
      } else {
        this.plan = [{ input: key(toward), steps: 40, until: (me, f) => Math.abs(f.x - me.x) / SUB <= reach - 6 }];
        this.wait = Math.min(this.wait, 8);
      }
      return;
    }

    // 6. À portée : un coup, un peu de garde, ou un pas en arrière.
    if (r < p.bigShare) {
      // Les niveaux faibles relâchent souvent trop tôt ou trop tard.
      this.plan = this.aimed(self);
    } else if (r < 0.58) {
      this.plan = this.tap('gifle');
    } else if (r < 0.74) {
      this.plan = this.tap('pied');
    } else if (r < 0.8) {
      // Balayette : accroupie, elle passe sous les gifles hautes.
      this.plan = [{ input: key('bas'), steps: 3 }, { input: key('bas', 'pied'), steps: 2 }, { input: key('bas'), steps: 2 }];
    } else if (r < 0.9) {
      this.plan = [{ input: this.guess(), steps: this.between([14, 34]) }];
    } else {
      this.plan = [{ input: key(away), steps: this.between([10, 22]) }];
    }
  }

  /** Exécute le plan en cours, un pas à la fois. */
  private follow(self: FighterState, foe: FighterState): InputFrame {
    const step = this.plan[0];
    if (!step) return noInput();
    step.steps -= 1;
    if (step.steps <= 0 || step.until?.(self, foe)) this.plan.shift();
    // Sécurité : elle ne reste jamais à charger jusqu'à la surchauffe.
    if (step.input.grosseGifle && self.mode === 'charge' && chargePct(self.id, self.mt) >= 99) return noInput();
    return step.input;
  }
}
