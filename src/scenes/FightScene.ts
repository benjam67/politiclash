import Phaser from 'phaser';
import { GABARITS, GUARD, MATCH, SIM, STAGE } from '../config/balance';
import { FIGHTER_IDS, ROSTER, spriteOf, type FighterId } from '../config/roster';
import { STAGES, type StageId } from '../config/stages';
import { FIGHTER_TEXTS } from '../config/texts';
import { fighterKey, poseFor } from '../config/poses';
import { computeLayout, HABITUES, type StageLayout } from '../logic/layout';
import {
  actionOf,
  chargePct,
  createFight,
  createFightStarted,
  GUARD_MAX,
  hashState,
  HP,
  physicsOf,
  ROUND_STEPS,
  step,
  STEP_MS,
  SUB,
  type FightEvent,
  type FighterState,
  type FightState,
} from '../logic/fight';
import { computeCamera, minZoom, type Camera } from '../logic/camera';
import { mergeInputs, type InputFrame } from '../logic/input';
import { DummySource, IdleSource, KeyboardSource, WanderSource, type InputSource } from '../input/sources';
import { AiSource, levelLabel, type AiLevel } from '../ai/ai';
import { sfx } from '../audio/sfx';
import { announceImage, Fx } from '../fx/Fx';
import { Commentator, Crowd } from '../fx/Crowd';
import { ChargeGauge } from '../ui/ChargeGauge';
import { HealthBar } from '../ui/HealthBar';
import { RoundPips, TimerDiamond } from '../ui/hud';
import { safeInsets } from '../ui/safe';
import { COLORS, CSS, FONT_TITLE } from '../ui/theme';
import { TouchControls } from '../ui/TouchControls';
import type { ResultData } from './ResultScene';

export type Side = 'left' | 'right';
/** Qui joue un combattant : l'IA, ou un adversaire d'essai (mannequin, promeneur, immobile). */
export type FoeKind = 'ai' | 'dummy' | 'wander' | 'idle';

export interface FightData {
  /** Combattant de gauche (joueur 1) et de droite. Par défaut : les deux premiers de la liste. */
  left?: FighterId;
  right?: FighterId;
  stage?: StageId;
  /** Qui joue le combattant de droite : l'IA (défaut), ou un adversaire d'essai. */
  p2?: FoeKind;
  /** Niveau de l'IA. */
  level?: AiLevel;
  /** Démo : le combattant de gauche est lui aussi joué par l'IA. */
  autoplay?: boolean;
  /** Faux : pas d'annonce du round, le combat démarre tout de suite (tests). */
  intro?: boolean;
  seed?: number;
}

interface FighterView {
  id: FighterId;
  sprite: Phaser.GameObjects.Image;
  bar: HealthBar;
  pips: RoundPips;
  /** Jauge de garde, au-dessus de la tête. */
  guard: Phaser.GameObjects.Graphics;
  guardShown: number;
  /** Éclat blanc sur le sprite juste après un coup reçu (heure de fin). */
  flashUntil: number;
}

/**
 * Nombre maximal de pas de simulation rattrapés en une image : sur un appareil lent, le jeu garde sa
 * vitesse normale jusqu'à 5 images par seconde ; après un gel de l'onglet, on ne rejoue pas tout.
 */
const MAX_STEPS_PER_FRAME = 12;

/**
 * Scène de combat. Elle fait avancer la simulation à pas fixe, puis lit l'état et l'affiche :
 * elle ne décide de rien. Toutes les règles sont dans `logic/fight.ts`.
 */
export class FightScene extends Phaser.Scene {
  /** Tout ce qui appartient au niveau (décor, figurants, combattants) : c'est lui que la caméra déplace. */
  private world!: Phaser.GameObjects.Container;
  private decors: Phaser.GameObjects.Image[] = [];
  private patron: Phaser.GameObjects.Image | null = null;
  private crowdImgs: Phaser.GameObjects.Image[] = [];
  private crowd: Crowd | null = null;
  private commentator!: Commentator;
  private v!: [FighterView, FighterView];
  private timer!: TimerDiamond;
  private gauge!: ChargeGauge;
  private soundBtn!: Phaser.GameObjects.Image;
  private homeBtn!: Phaser.GameObjects.Image;
  private levelTag!: Phaser.GameObjects.Text;
  private fx!: Fx;
  private touch!: TouchControls;
  layout!: StageLayout;

  private ids: [FighterId, FighterId] = ['bernard', 'lola'];
  private stageId: StageId = 'bar';
  private p2Kind: FoeKind = 'ai';
  private level: AiLevel = 'normal';
  private autoplay = false;
  private p1Ai: InputSource | null = null;
  private intro = true;
  private seed = 1;

  private state!: FightState;
  private acc = 0;
  private lastNow = -1;
  private breaks = 0;
  private keyboard!: KeyboardSource;
  private p2!: InputSource;
  private cam: Camera = { x: 0, zoom: 1 };
  /** Px de l'écran par px de l'écran logique. */
  private k = 1;
  private feetY = 0;
  private charging = false;
  private hits = 0;
  private lastHit: FightEvent | null = null;
  private lastTick = -1;

  constructor() {
    super('Fight');
  }

  init(data: FightData) {
    const left = data.left ?? FIGHTER_IDS[0];
    this.ids = [left, data.right ?? FIGHTER_IDS.find((id) => id !== left) ?? left];
    this.stageId = data.stage ?? 'bar';
    this.p2Kind = data.p2 ?? 'ai';
    this.level = data.level ?? 'normal';
    this.autoplay = !!data.autoplay;
    this.p1Ai = null;
    this.intro = data.intro ?? true;
    this.seed = data.seed ?? Math.floor(Math.random() * 1e9);
    this.crowd = null;
    this.patron = null;
    this.crowdImgs = [];
    this.decors = [];
    this.acc = 0;
    this.lastNow = -1;
    this.breaks = 0;
    this.charging = false;
    this.hits = 0;
    this.lastHit = null;
    this.lastTick = -1;
  }

  create() {
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    const stage = STAGES[this.stageId];
    this.state = (this.intro ? createFight : createFightStarted)(this.ids[0], this.ids[1], this.stageId, this.seed);

    this.world = this.add.container(0, 0);
    // Le décor est répété en miroir sur les côtés tant que sa version large n'est pas fournie.
    for (let i = -3; i <= 3; i++) this.decors.push(this.add.image(0, 0, stage.image).setOrigin(0, 0).setFlipX(i % 2 !== 0));
    this.world.add(this.decors);
    if (stage.crowd) {
      this.crowdImgs = HABITUES.map((id) => this.add.image(0, 0, `habitue_${id}`).setOrigin(0.5, 1).setTint(STAGE.crowdTint));
      this.patron = this.add.image(0, 0, 'patron').setOrigin(0.5, 1).setTint(STAGE.patronTint);
      this.world.add([...this.crowdImgs, this.patron]);
      this.crowd = new Crowd(this, this.crowdImgs, this.patron);
    }

    this.v = [this.makeFighter(0), this.makeFighter(1)];

    this.fx = new Fx(this);
    this.commentator = new Commentator(this);
    this.gauge = new ChargeGauge(this).setDepth(100);
    this.timer = new TimerDiamond(this).setDepth(100);
    this.timer.set(MATCH.roundTimeS, 1);

    this.soundBtn = this.add
      .image(0, 0, sfx.muted ? 'ico_sound_off' : 'ico_sound_on')
      .setDepth(130)
      .setInteractive({ useHandCursor: true });
    this.soundBtn.on('pointerup', () => {
      sfx.unlock();
      sfx.setMuted(!sfx.muted);
      this.soundBtn.setTexture(sfx.muted ? 'ico_sound_off' : 'ico_sound_on');
      if (!sfx.muted) sfx.startMusic();
    });
    this.homeBtn = this.add.image(0, 0, 'ico_home').setDepth(130).setInteractive({ useHandCursor: true });
    this.homeBtn.on('pointerup', () => this.scene.start('Title'));
    // Niveau de l'IA, discret, sous le chrono.
    this.levelTag = this.add
      .text(0, 0, this.p2Kind === 'ai' ? (this.autoplay ? `DÉMO · ${levelLabel(this.level).toUpperCase()}` : `IA ${levelLabel(this.level).toUpperCase()}`) : '', { fontFamily: FONT_TITLE, fontSize: '15px', color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 })
      .setOrigin(0.5, 0)
      .setDepth(100);

    // Entrées : clavier et tactile pour le joueur 1 ; adversaire provisoire à droite.
    this.keyboard = new KeyboardSource();
    this.touch = new TouchControls(this);
    const q = new URLSearchParams(location.search);
    const isTouch = matchMedia('(pointer: coarse)').matches || q.get('touch') === '1';
    this.touch.setVisible(isTouch);
    // Un écran tactile détecté après coup (ordinateur hybride) : les contrôles apparaissent au premier toucher.
    const reveal = () => this.touch.setVisible(!this.autoplay);
    window.addEventListener('touchstart', reveal, { once: true });
    const k = this.p2Kind;
    this.p2 = k === 'idle' ? new IdleSource() : k === 'wander' ? new WanderSource(this.seed + 6) : k === 'dummy' ? new DummySource(this.seed + 6) : new AiSource(this.level, this.seed + 6);
    if (this.autoplay) {
      this.p1Ai = new AiSource(this.level, this.seed + 7);
      this.touch.setVisible(false);
    }

    this.applyLayout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
      window.removeEventListener('touchstart', reveal);
      this.keyboard.destroy();
    });

    // Le son ne peut démarrer qu'après un geste de l'utilisateur.
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => {
      sfx.unlock();
      sfx.startMusic();
    });

    if (window.__slap) {
      window.__slap.ready = true;
      window.__slap.scene = 'Fight';
      window.__slap.inputs = {};
    }
    this.render(true);
    for (const e of this.state.ev) this.onEvent(e);
    this.publish();
  }

  update(time: number) {
    // Simulation à pas fixe, indépendante de la fréquence d'affichage. On mesure le temps réel nous-mêmes :
    // celui que donne Phaser est lissé et plafonné, ce qui ralentirait le combat sur un appareil lent.
    const now = performance.now();
    const delta = this.lastNow < 0 ? STEP_MS : now - this.lastNow;
    this.lastNow = now;
    this.acc = Math.min(this.acc + delta, STEP_MS * MAX_STEPS_PER_FRAME);
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      const forced = window.__slap?.inputs ?? {};
      const f1 = typeof forced.p1 === 'function' ? forced.p1(this.state) : forced.p1;
      const f2 = typeof forced.p2 === 'function' ? forced.p2(this.state) : forced.p2;
      const in0 = this.p1Ai ? this.p1Ai.read(this.state, 0) : mergeInputs(this.keyboard.read(), this.touch.read(), f1 ?? {});
      const in1: InputFrame = f2 ? mergeInputs(f2) : this.p2.read(this.state, 1);
      this.state = step(this.state, in0, in1);
      for (const e of this.state.ev) this.onEvent(e);
      if (this.state.phase === 'matchEnd') break;
    }
    this.crowd?.update(time);
    this.render(false);
    this.publish();
  }

  // ── Construction et placement ──────────────────────────────────────────

  private makeFighter(i: 0 | 1): FighterView {
    const id = this.ids[i];
    const side: Side = i === 0 ? 'left' : 'right';
    const sprite = this.add.image(0, 0, fighterKey(id, 'idle'));
    this.world.add(sprite);
    const t = FIGHTER_TEXTS[id];
    const bar = new HealthBar(this, side, t.name, t.katakana).setDepth(100);
    const pips = new RoundPips(this, side, MATCH.roundsToWin).setDepth(100);
    const guard = this.add.graphics().setDepth(60).setVisible(false);
    return { id, sprite, bar, pips, guard, guardShown: -1, flashUntil: 0 };
  }

  private applyLayout() {
    const { width, height } = this.scale;
    this.k = height / SIM.screenH;
    const viewW = width / this.k;
    const L = computeLayout(width, height, this.ids[0], this.ids[1], this.stageId, minZoom(viewW));
    this.layout = L;
    this.feetY = L.left.y;
    this.cameras.main.setSize(width, height);

    // Dans le conteneur du niveau, le centre du niveau est au milieu de l'écran.
    const tile = STAGES[this.stageId].width * L.decor.scale;
    this.decors.forEach((d, n) => d.setPosition(L.decor.x + (n - 3) * tile, L.decor.y).setScale(L.decor.scale));
    this.patron?.setPosition(L.patron.x, L.patron.y).setScale(L.patron.scale);
    L.crowd.forEach((c, i) => this.crowdImgs[i]?.setPosition(c.x, c.y).setScale(c.scale));
    this.crowd?.layout();

    // Interface : barres en haut, chrono au centre, losanges des rounds sous les barres.
    // Encoche et barre d'accueil (iPhone) : l'interface reste dans la zone sûre, la même marge des deux
    // côtés pour rester symétrique.
    const safe = safeInsets(this);
    const side = Math.max(safe.left, safe.right);
    const margin = 22 + side;
    const centerGap = 64;
    const barW = width / 2 - margin - centerGap;
    this.v[0].bar.layout(margin, 16, barW);
    this.v[1].bar.layout(width - margin, 16, barW);
    this.v[0].pips.setPosition(width / 2 - centerGap - 20, 66);
    this.v[1].pips.setPosition(width / 2 + centerGap + 20, 66);
    this.timer.setPosition(width / 2, 48);
    this.levelTag.setPosition(width / 2, 104);
    // Sous le bouton d'accueil, au-dessus du stick.
    this.gauge.layout(margin + 6, 204, Math.max(160, height - safe.bottom - 213 - 204 - 60));
    this.soundBtn.setPosition(width - 44 - side, 120);
    this.homeBtn.setPosition(44 + side, 120);
    this.fx.layout(width, height);
    this.commentator.layout(width, height, side, safe.bottom);
    this.touch.layout(width, height, safe);

    if (window.__slap) window.__slap.layout = L;
    if (this.state) {
      this.v.forEach((view, i) => view.bar.setValue(this.state.f[i].hp / (MATCH.hp * HP), true));
      this.render(true);
    }
  }

  // ── Affichage de l'état ────────────────────────────────────────────────

  /** Abscisse dans le conteneur du niveau d'un point du niveau (px logiques). */
  private localX(x: number) {
    return this.scale.width / 2 + (x - this.stageW() / 2) * this.k;
  }

  private stageW() {
    return STAGES[this.stageId].widthScreens * SIM.screenW;
  }

  /** Point de l'écran correspondant à un point du niveau (px logiques, y au-dessus du sol). */
  private toScreen(x: number, y: number) {
    return { x: this.world.x + this.localX(x) * this.world.scaleX, y: this.world.y + (this.feetY - y * this.k) * this.world.scaleY };
  }

  private render(snap: boolean) {
    const { width } = this.scale;
    const s = this.state;
    const [a, b] = s.f;
    const target = computeCamera(width / this.k, a.x / SUB, b.x / SUB, this.stageW());
    // La caméra suit en douceur ; au démarrage et après un redimensionnement, elle se cale d'un coup.
    const ease = snap ? 1 : 0.18;
    this.cam.x += (target.x - this.cam.x) * ease;
    this.cam.zoom += (target.zoom - this.cam.zoom) * ease;
    const z = this.cam.zoom;
    // Le recul se fait autour de la ligne des pieds, qui ne bouge pas à l'écran.
    this.world.setScale(z).setPosition(width / 2 - this.localX(this.cam.x) * z, this.feetY * (1 - z));

    this.renderFighter(this.v[0], a);
    this.renderFighter(this.v[1], b);
    // Devant : celui qui est en l'air, sinon celui qui frappe.
    const front = a.y !== b.y ? (a.y > b.y ? 0 : 1) : a.mode === 'attack' ? 0 : b.mode === 'attack' ? 1 : -1;
    if (front === 0 || front === 1) this.world.bringToTop(this.v[front].sprite);

    // Interface.
    this.v.forEach((view, i) => {
      view.bar.setValue(s.f[i].hp / (MATCH.hp * HP));
      view.pips.setWon(s.wins[i]);
    });
    this.timer.set(Math.ceil(s.timeLeft / SIM.stepsPerSecond), s.timeLeft / ROUND_STEPS);
    const sec = Math.ceil(s.timeLeft / SIM.stepsPerSecond);
    if (s.phase === 'fight' && sec <= 10 && sec !== this.lastTick && sec > 0) {
      this.lastTick = sec;
      sfx.tick(sec <= 3);
    }

    // Jauge de charge du joueur 1.
    const charging = a.mode === 'charge';
    if (charging !== this.charging) {
      this.charging = charging;
      if (charging) this.gauge.setZone(GABARITS[ROSTER[a.id].gabarit].goldenZone);
      this.gauge.show(charging);
    }
    if (charging) this.gauge.setValue(chargePct(a.id, a.mt), a.mt > physicsOf(a.id).chargeSteps);
  }

  private renderFighter(view: FighterView, f: FighterState) {
    const def = poseFor(f.id, actionOf(f));
    const a = spriteOf(f.id);
    const flip = f.facing === -1;
    const s = this.layout.fighterScale;
    const fx = def.fx ?? {};
    // Phaser retourne la texture dans son cadre sans bouger l'origine :
    // pour un perso en miroir, l'ancrage (entre les pieds) passe à 1 - originX.
    const bob = fx.bob ? Math.abs(Math.sin(f.t * 0.3)) * fx.bob * this.k : 0;
    // Tremblement pendant la charge, de plus en plus fort.
    const shake = f.mode === 'charge' ? Math.sin(f.mt * 1.9) * (1 + chargePct(f.id, f.mt) / 40) : 0;
    const x = this.localX(f.x / SUB);
    const y = this.feetY - (f.y / SUB) * this.k;
    view.sprite
      .setTexture(fighterKey(f.id, def.pose))
      .setFlipX(flip)
      .setOrigin(flip ? 1 - a.originX : a.originX, a.originY)
      .setPosition(x + shake, y - bob)
      .setScale(s, s * (fx.squashY ?? 1))
      .setAngle(fx.tilt ? -f.facing * fx.tilt : 0);

    // Teinte : éclat blanc après un coup reçu ; bleutée pour le second d'un combat miroir.
    const mirror = view === this.v[1] && this.ids[0] === this.ids[1];
    if (this.time.now < view.flashUntil) view.sprite.setTintFill(0xffffff);
    else if (mirror) view.sprite.setTint(0x9fc4ff);
    else view.sprite.clearTint();

    // Jauge de garde : visible quand on garde ou qu'elle n'est pas pleine.
    const show = f.mode === 'guard' || f.mode === 'block' || f.guard < GUARD_MAX;
    view.guard.setVisible(show);
    if (show) {
      const top = this.toScreen(f.x / SUB, f.y / SUB + ROSTER[f.id].body.stand.h + 22);
      view.guard.setPosition(top.x, top.y);
      const q = Math.round((f.guard / GUARD_MAX) * 40);
      if (q !== view.guardShown) {
        view.guardShown = q;
        const w = 96;
        const low = f.guard < GUARD_MAX * 0.3;
        view.guard.clear();
        view.guard.fillStyle(COLORS.ink, 0.9).fillRect(-w / 2 - 3, -3, w + 6, 14);
        view.guard.fillStyle(low ? COLORS.red : COLORS.cyan, 1).fillRect(-w / 2, 0, (w * q) / 40, 8);
        view.guard.lineStyle(2, COLORS.cream, 1).strokeRect(-w / 2 - 3, -3, w + 6, 14);
      }
    }
  }

  // ── Effets et sons : ce qui vient de se passer dans la simulation ──────

  private onEvent(e: FightEvent) {
    const s = this.state;
    switch (e.t) {
      case 'round':
        this.fx.clearTransient();
        announceImage(this, e.n >= MATCH.maxRounds ? 'ann_round_final' : `ann_round_${e.n}`, 650);
        this.crowd?.whistle();
        sfx.whistle();
        break;
      case 'fight':
        announceImage(this, 'ann_fight', 450);
        this.commentator.say('roundStart');
        sfx.crowd(0.5);
        break;
      case 'swing':
        if (e.move === 'big') sfx.whoosh();
        break;
      case 'hit':
        this.onHit(e);
        break;
      case 'self': {
        const f = s.f[e.who];
        const p = this.toScreen(f.x / SUB, ROSTER[f.id].body.stand.h * 0.85);
        this.v[e.who].flashUntil = this.time.now + 70;
        this.fx.flash(p.x, p.y, 0.7);
        this.fx.onomatopoeia('self', p.x, p.y, -f.facing);
        this.fx.damageNumber(p.x, p.y - 60, Math.round(e.dmg / HP), 'r', 'lbl_self');
        sfx.slap(0.5);
        sfx.cry(f.id, 0.5);
        this.crowd?.boo();
        sfx.boo();
        this.commentator.say('self');
        break;
      }
      case 'ko':
        this.fx.clearTransient();
        announceImage(this, e.who === 2 ? 'ann_double_ko' : 'ann_ko', 900, 0.36);
        this.fx.screenFlash(0.8);
        this.cameras.main.shake(320, 0.014);
        sfx.ko();
        sfx.crowd(1, 2);
        this.crowd?.cheer(1);
        this.commentator.say('ko');
        break;
      case 'timeup':
        announceImage(this, 'ann_timeup', 900, 0.36);
        sfx.whistle(true);
        this.commentator.say('timeUp');
        break;
      case 'roundEnd': {
        const key = e.winner === 2 ? 'ann_draw' : `ann_roundfor_${this.ids[e.winner]}`;
        this.time.delayedCall(1350, () => announceImage(this, key, 800, 0.36));
        break;
      }
      case 'matchEnd': {
        const data: ResultData = { ids: this.ids, stage: this.stageId, winner: e.winner, wins: [s.wins[0], s.wins[1]], p2: this.p2Kind, level: this.level, autoplay: this.autoplay };
        this.scene.start('Result', data);
        break;
      }
    }
  }

  private onHit(e: Extract<FightEvent, { t: 'hit' }>) {
    const s = this.state;
    const victim = e.by === 0 ? 1 : 0;
    const def = s.f[victim];
    const dir = def.x >= s.f[e.by].x ? 1 : -1;
    const p = this.toScreen(e.x / SUB, e.y / SUB);
    const dmg = e.dmg / HP;
    this.hits += 1;
    this.lastHit = e;

    if (e.blocked) {
      this.fx.flash(p.x, p.y, 0.45);
      sfx.slap(0.25);
      if (e.guardBreak) {
        this.breaks += 1;
        this.fx.damageNumber(p.x, p.y - 70, Math.max(1, Math.round(dmg)), 'r', 'lbl_break');
        this.fx.screenFlash(0.35, COLORS.cyan);
        this.cameras.main.shake(160, 0.006);
        sfx.dizzy();
        this.crowd?.cheer(0.6);
        this.commentator.say('guardBreak');
      } else if (e.move === 'big' || e.move === 'kick' || e.move === 'sweep') {
        this.fx.damageNumber(p.x, p.y - 70, Math.max(1, Math.round(dmg)), 'n', 'lbl_block');
        this.commentator.say('guard');
      }
      return;
    }

    // Intensité de 0 à 1 : une gifle rapide vaut ~0,2, un gros critique 1.
    const power = Math.min(1, dmg / 25);
    const big = e.move === 'big';
    this.v[victim].flashUntil = this.time.now + (big ? 110 : 70);
    this.fx.flash(p.x, p.y, 0.5 + power * 0.9);
    this.fx.damageNumber(p.x, p.y - 70, Math.max(1, Math.round(dmg)), e.crit ? 'c' : 'n', e.crit ? 'lbl_crit' : e.knockdown ? 'lbl_down' : e.wrongGuard ? 'lbl_wrong' : undefined);
    this.fx.debris(p.x, p.y, dir as 1 | -1, Math.round(2 + power * 8), e.crit ? 2 : big && power > 0.5 ? 1 : 0);
    sfx.slap(0.25 + power * 0.75, e.crit);
    sfx.cry(def.id, power);
    if (big) {
      this.fx.onomatopoeia(e.crit ? 'crit' : 'slap', p.x, p.y, dir);
      this.fx.focusLines(p.x, p.y, power);
      this.cameras.main.shake(e.crit ? 260 : 150, e.crit ? 0.012 : 0.006);
      this.crowd?.cheer(0.4 + power * 0.6);
      sfx.crowd(0.4 + power * 0.6);
      this.commentator.say(e.crit ? 'crit' : power > 0.5 ? 'big' : 'normal');
      if (e.crit) this.fx.screenFlash(0.6);
    } else if (this.hits % 4 === 0) {
      this.crowd?.cheer(0.3);
    }
  }

  // ── État visible par les tests ─────────────────────────────────────────

  private publish() {
    if (!window.__slap) return;
    const s = this.state;
    const one = (f: FighterState) => ({
      x: f.x / SUB,
      y: f.y / SUB,
      facing: f.facing,
      action: actionOf(f),
      mode: f.mode,
      move: f.move,
      hp: f.hp / HP,
      guard: f.guard / (GUARD_MAX / GUARD.max),
      charge: f.mode === 'charge' ? chargePct(f.id, f.mt) : 0,
    });
    window.__slap.state = {
      mode: 'fight',
      ids: { left: this.ids[0], right: this.ids[1] },
      stage: this.stageId,
      foe: this.p2Kind,
      level: this.level,
      autoplay: this.autoplay,
      step: s.step,
      hash: hashState(s),
      phase: s.phase,
      round: s.round,
      wins: [s.wins[0], s.wins[1]],
      winner: s.winner,
      p1: one(s.f[0]),
      p2: one(s.f[1]),
      hits: this.hits,
      guardBreaks: this.breaks,
      lastHit: this.lastHit,
      camera: { ...this.cam },
      fps: this.game.loop.actualFps,
      timeLeft: Math.ceil(s.timeLeft / SIM.stepsPerSecond),
    };
    window.__slap.fx = { ...this.fx.stats, ...(this.crowd?.stats ?? {}), ...this.commentator.stats, sounds: sfx.played.slice(-30) };
  }
}
