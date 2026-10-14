import Phaser from 'phaser';
import { BUZZ, GUARD, MATCH, SIM, STAGE, STYLE } from '../config/balance';
import { PLAYABLE_IDS, ROSTER, spriteOf, type FighterId } from '../config/roster';
import { CHEEK } from '../config/sprites';
import { queueStageImages, STAGES, type StageId } from '../config/stages';
import { FIGHTER_TEXTS, ONLINE, REACTIONS, TUTORIAL } from '../config/texts';
import { currentRoom, type FriendRoom } from '../net/friends';
import { NetSession, type NetStatus } from '../net/rollback';
import type { MatchStart } from '../net/room';
import { fighterKey, frameOf, poseFor } from '../config/poses';
import { computeLayout, HABITUES, type StageLayout } from '../logic/layout';
import {
  actionIn,
  BUZZ_STEPS,
  chargePct,
  createFight,
  createFightStarted,
  GUARD_MAX,
  hashState,
  HP,
  ROUND_STEPS,
  specialOf,
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
import { SpecialFx } from '../fx/SpecialFx';
import { Commentator, Crowd } from '../fx/Crowd';
import { ChargeGauge } from '../ui/ChargeGauge';
import { HealthBar } from '../ui/HealthBar';
import { RoundPips, TimerDiamond } from '../ui/hud';
import { safeInsets } from '../ui/safe';
import { COLORS, CSS, FONT_TITLE } from '../ui/theme';
import { TouchControls } from '../ui/TouchControls';
import type { ResultData } from './ResultScene';
import { queueFighterImages } from './BootScene';
import { showLoadingBar } from '../ui/loading';
import { createTuto, TUTO_STEPS, tutoAfterStep, tutoDone, tutoPartner, tutoProgress, tutoStep, type Tuto } from '../logic/tutorial';
import { loadSave, updateSave } from '../logic/save';
import { makeButton } from '../ui/button';
import { FONT_UI } from '../ui/theme';

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
  /** Barres Buzz au départ (essais du coup spécial). */
  buzz?: number;
  /** Tutoriel : exercices guidés contre un partenaire d'entraînement. */
  tutorial?: boolean;
  /** Essai de charge du jeu en ligne : à chaque pas, rejoue en plus les N derniers pas (pire cas du retour en arrière). */
  rollback?: number;
  /** Match en ligne (mode Entre amis) : réglages envoyés par l'hôte. */
  online?: MatchStart;
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
  /** Cercle du Buzz, autour du combattant (visible des deux joueurs). */
  ring: Phaser.GameObjects.Graphics;
  ringShown: number;
  /** Étoiles qui tournent au-dessus de la tête d'un combattant sonné. */
  stars: Phaser.GameObjects.Image[];
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
  private sfxSpecial!: SpecialFx;
  private touch!: TouchControls;
  /** Ralenti : jusqu'à cette heure (performance.now), le combat avance moins vite. Affichage seulement. */
  private slowUntil = 0;
  private specials = 0;
  private dodges = 0;
  private darkened = false;
  layout!: StageLayout;

  private ids: [FighterId, FighterId] = [PLAYABLE_IDS[0], PLAYABLE_IDS[1] ?? PLAYABLE_IDS[0]];
  private stageId: StageId = 'bar';
  private p2Kind: FoeKind = 'ai';
  private level: AiLevel = 'normal';
  private autoplay = false;
  private p1Ai: InputSource | null = null;
  private intro = true;
  private seed = 1;
  private startBuzz = 0;
  /** Tutoriel en cours (null : combat normal). */
  private tuto: Tuto | null = null;
  private tutoUi: Phaser.GameObjects.GameObject[] = [];
  /** Ce que montre le panneau du tutoriel (pour ne le redessiner que quand ça change). */
  private tutoShown = '';
  private touchMode = false;
  private rollbackLoad = 0;
  private history: { s: FightState; a: InputFrame; b: InputFrame }[] = [];
  /** Temps passé à rejouer, par image (ms), pour les mesures. */
  private rollbackMs: number[] = [];

  // Jeu en ligne.
  private online: MatchStart | null = null;
  private room: FriendRoom | null = null;
  private net: NetSession | null = null;
  /** Le joueur de ce téléphone : 0 à gauche (hôte, ou hors ligne), 1 à droite (invité). */
  private me: 0 | 1 = 0;
  private netBot: AiSource | null = null;
  private netShown: NetStatus | 'gone' = 'ok';
  private netUi: Phaser.GameObjects.GameObject[] = [];
  private ended = false;
  private offRoom: (() => void) | null = null;
  private reactBtn: Phaser.GameObjects.Text | null = null;
  private reactMenu: Phaser.GameObjects.GameObject[] = [];
  private lastReact = 0;
  private muted = false;

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
    const left = data.left ?? PLAYABLE_IDS[0];
    this.ids = [left, data.right ?? PLAYABLE_IDS.find((id) => id !== left) ?? left];
    this.stageId = data.stage ?? 'bar';
    this.p2Kind = data.p2 ?? 'ai';
    this.level = data.level ?? 'normal';
    this.autoplay = !!data.autoplay;
    this.p1Ai = null;
    this.intro = data.intro ?? true;
    this.seed = data.seed ?? Math.floor(Math.random() * 1e9);
    this.startBuzz = data.buzz ?? 0;
    this.tuto = data.tutorial ? createTuto() : null;
    this.rollbackLoad = data.rollback ?? 0;
    this.online = data.online ?? null;
    this.room = this.online ? currentRoom() : null;
    this.net = null;
    this.me = 0;
    this.netBot = null;
    this.netShown = 'ok';
    this.netUi = [];
    this.ended = false;
    this.offRoom = null;
    this.reactBtn = null;
    this.reactMenu = [];
    this.lastReact = 0;
    this.muted = loadSave().muteReactions;
    if (this.online) {
      this.ids = [...this.online.fighters];
      this.stageId = this.online.stage;
      this.seed = this.online.seed;
      this.intro = true;
      this.autoplay = false;
      this.tuto = null;
      this.me = this.room?.index ?? 0;
    }
    this.history = [];
    this.rollbackMs = [];
    this.tutoUi = [];
    this.tutoShown = '';
    if (this.tuto) {
      this.p2Kind = 'idle';
      this.intro = false;
      this.autoplay = false;
    }
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
    this.slowUntil = 0;
    this.specials = 0;
    this.dodges = 0;
    this.darkened = false;
  }

  preload() {
    queueStageImages(this, this.stageId);
    queueFighterImages(this, this.ids);
    showLoadingBar(this);
  }

  create() {
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    const stage = STAGES[this.stageId];
    this.state = (this.intro ? createFight : createFightStarted)(this.ids[0], this.ids[1], this.stageId, this.seed);
    for (const f of this.state.f) f.buzz = this.startBuzz;

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
    this.sfxSpecial = new SpecialFx(this, (name) => (this.textures.exists(`prop_${name}`) ? `prop_${name}` : `propfx_${name}`));
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
    this.homeBtn = this.add.image(0, 0, 'ico_home').setDepth(130).setInteractive({ useHandCursor: true }).setName('btn-home');
    this.homeBtn.on('pointerup', () => {
      this.room?.leave();
      this.scene.start('Title');
    });
    // Niveau de l'IA, discret, sous le chrono.
    this.levelTag = this.add
      .text(0, 0, this.online ? ONLINE.vs(this.room?.them?.pseudo ?? '') : this.tuto ? '' : this.p2Kind === 'ai' ? (this.autoplay ? `DÉMO · ${levelLabel(this.level).toUpperCase()}` : `IA ${levelLabel(this.level).toUpperCase()}`) : '', { fontFamily: FONT_TITLE, fontSize: '15px', color: CSS.cream, stroke: CSS.ink, strokeThickness: 5 })
      .setOrigin(0.5, 0)
      .setDepth(100);

    // Entrées : clavier et tactile pour le joueur 1 ; adversaire provisoire à droite.
    this.keyboard = new KeyboardSource();
    this.touch = new TouchControls(this);
    const q = new URLSearchParams(location.search);
    const isTouch = matchMedia('(pointer: coarse)').matches || q.get('touch') === '1';
    this.touch.setVisible(isTouch);
    this.touchMode = isTouch;
    // Un écran tactile détecté après coup (ordinateur hybride) : les contrôles apparaissent au premier toucher.
    const reveal = () => {
      this.touch.setVisible(!this.autoplay);
      if (!this.autoplay && !this.touchMode) {
        this.touchMode = true;
        this.tutoShown = '';
      }
    };
    window.addEventListener('touchstart', reveal, { once: true });
    const k = this.p2Kind;
    this.p2 = k === 'idle' ? new IdleSource() : k === 'wander' ? new WanderSource(this.seed + 6) : k === 'dummy' ? new DummySource(this.seed + 6) : new AiSource(this.level, this.seed + 6);
    if (this.autoplay) {
      this.p1Ai = new AiSource(this.level, this.seed + 7);
      this.touch.setVisible(false);
    }

    if (this.online) this.startOnline();

    this.applyLayout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
      window.removeEventListener('touchstart', reveal);
      this.keyboard.destroy();
      this.offRoom?.();
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
    if (this.online) {
      this.updateOnline(time);
      return;
    }
    // Simulation à pas fixe, indépendante de la fréquence d'affichage. On mesure le temps réel nous-mêmes :
    // celui que donne Phaser est lissé et plafonné, ce qui ralentirait le combat sur un appareil lent.
    const now = performance.now();
    const delta = (this.lastNow < 0 ? STEP_MS : now - this.lastNow) * (now < this.slowUntil ? 0.35 : 1);
    this.lastNow = now;
    this.acc = Math.min(this.acc + delta, STEP_MS * MAX_STEPS_PER_FRAME);
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      const forced = window.__slap?.inputs ?? {};
      const f1 = typeof forced.p1 === 'function' ? forced.p1(this.state) : forced.p1;
      const f2 = typeof forced.p2 === 'function' ? forced.p2(this.state) : forced.p2;
      const in0 = this.p1Ai ? this.p1Ai.read(this.state, 0) : mergeInputs(this.keyboard.read(), this.touch.read(), f1 ?? {});
      const in1: InputFrame = f2 ? mergeInputs(f2) : this.tuto ? tutoPartner(this.tuto, this.state) : this.p2.read(this.state, 1);
      if (this.rollbackLoad > 0) this.replayLoad(in0, in1);
      this.state = step(this.state, in0, in1);
      if (this.tuto) this.tuto = tutoAfterStep(this.tuto, this.state);
      for (const e of this.state.ev) this.onEvent(e);
      if (this.state.phase === 'matchEnd') break;
    }
    this.crowd?.update(time);
    if (this.tuto) this.renderTuto();
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
    const ring = this.add.graphics().setDepth(61);
    const stars = [0, 1, 2].map(() => this.add.image(0, 0, 'fx_dizzy').setDepth(62).setVisible(false));
    return { id, sprite, bar, pips, guard, guardShown: -1, flashUntil: 0, ring, ringShown: -1, stars };
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
    this.timer.setPosition(width / 2, 48).setVisible(!this.tuto);
    this.levelTag.setPosition(width / 2, 104);
    // Sous le bouton d'accueil, au-dessus du stick.
    this.gauge.layout(margin + 6, 204, Math.max(160, height - safe.bottom - 213 - 204 - 60));
    this.soundBtn.setPosition(width - 44 - side, 120);
    this.reactBtn?.setPosition(width - 44 - side, 196);
    this.homeBtn.setPosition(44 + side, 120);
    this.fx.layout(width, height);
    this.commentator.layout(width, height, side, safe.bottom);
    this.touch.layout(width, height, safe);

    if (window.__slap) window.__slap.layout = L;
    this.tutoShown = '';
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

    this.renderFighter(this.v[0], a, 0);
    this.renderFighter(this.v[1], b, 1);
    // Devant : le lanceur d'un coup spécial, celui qui est en l'air, sinon celui qui frappe.
    const front = s.cine ? s.cine.who : a.y !== b.y ? (a.y > b.y ? 0 : 1) : a.mode === 'attack' ? 0 : b.mode === 'attack' ? 1 : -1;
    if (front === 0 || front === 1) this.world.bringToTop(this.v[front].sprite);

    // Cinématique : le décor s'assombrit, les effets suivent le déroulé de la simulation.
    const dark = !!s.cine;
    if (dark !== this.darkened) {
      this.darkened = dark;
      for (const d of this.decors) {
        if (dark) d.setTint(0x6a5878);
        else d.clearTint();
      }
      for (const c of [...this.crowdImgs, ...(this.patron ? [this.patron] : [])]) c.setTint(dark ? 0x5a4a66 : c === this.patron ? STAGE.patronTint : STAGE.crowdTint);
    }
    this.sfxSpecial.setScale(this.k * this.world.scaleX);
    if (s.cine) this.sfxSpecial.update(s, (x, y) => this.toScreen(x, y));

    // Interface.
    this.v.forEach((view, i) => {
      view.bar.setValue(s.f[i].hp / (MATCH.hp * HP));
      view.bar.setBuzz(s.f[i].buzz / BUZZ.max);
      view.pips.setWon(s.wins[i]);
    });
    // Le joueur de ce téléphone (à droite pour l'invité en ligne).
    const mine = s.f[this.me];
    this.touch.setBuzz(mine.buzz >= BUZZ.max && !s.cine);
    this.touch.setRing(mine.mode === 'buzz' ? mine.mt / BUZZ_STEPS : 0);
    this.timer.set(Math.ceil(s.timeLeft / SIM.stepsPerSecond), s.timeLeft / ROUND_STEPS);
    const sec = Math.ceil(s.timeLeft / SIM.stepsPerSecond);
    if (s.phase === 'fight' && sec <= 10 && sec !== this.lastTick && sec > 0) {
      this.lastTick = sec;
      sfx.tick(sec <= 3);
    }

    // Jauge de charge du joueur 1.
    const charging = mine.mode === 'charge';
    if (charging !== this.charging) {
      this.charging = charging;
      if (charging) this.gauge.setZone(STYLE.goldenZone);
      this.gauge.show(charging);
    }
    if (charging) this.gauge.setValue(chargePct(mine.chg), mine.hot > 0);
  }

  private renderFighter(view: FighterView, f: FighterState, i: 0 | 1) {
    const def = poseFor(f.id, actionIn(this.state, i));
    const a = spriteOf(f.id);
    const flip = f.facing === -1;
    const s = this.layout.fighterScale;
    const fx = def.fx ?? {};
    // Phaser retourne la texture dans son cadre sans bouger l'origine :
    // pour un perso en miroir, l'ancrage (entre les pieds) passe à 1 - originX.
    const bob = fx.bob ? Math.abs(Math.sin(f.t * 0.3)) * fx.bob * this.k : 0;
    // Tremblement pendant la charge, de plus en plus fort.
    const shake = f.mode === 'charge' ? Math.sin(f.mt * 1.9) * (1 + chargePct(f.chg) / 40) : f.mode === 'buzz' ? Math.sin(f.mt * 2.3) * (1 + f.mt / 12) : 0;
    const x = this.localX(f.x / SUB);
    const y = this.feetY - (f.y / SUB) * this.k;
    view.sprite
      .setTexture(fighterKey(f.id, frameOf(def, f.t)))
      .setFlipX(flip)
      .setOrigin(flip ? 1 - a.originX : a.originX, a.originY)
      .setPosition(x + shake, y - bob)
      .setScale(s, s * (fx.squashY ?? 1))
      .setAngle(fx.tilt ? -f.facing * fx.tilt : 0);

    // Teinte : éclat blanc après un coup reçu ; bleutée pour le second d'un combat miroir.
    const mirror = view === this.v[1] && this.ids[0] === this.ids[1];
    if (this.time.now < view.flashUntil) view.sprite.setTintFill(0xffffff);
    else if (f.mode === 'buzz') view.sprite.setTint(Math.floor(this.time.now / 90) % 2 ? 0xfff0a0 : 0xffffff);
    else if (mirror) view.sprite.setTint(0x9fc4ff);
    else view.sprite.clearTint();

    // Cercle du Buzz autour du combattant : l'adversaire le voit se remplir, et peut le couper d'une gifle.
    const ringQ = f.mode === 'buzz' ? Math.min(48, Math.round((f.mt / BUZZ_STEPS) * 48)) : 0;
    const center = this.toScreen(f.x / SUB, f.y / SUB + ROSTER[f.id].body.stand.h * 0.55);
    view.ring.setPosition(center.x, center.y);
    if (ringQ !== view.ringShown) {
      view.ringShown = ringQ;
      view.ring.clear();
      if (ringQ > 0) {
        const r = ROSTER[f.id].body.stand.h * 0.62 * this.k * this.world.scaleX;
        view.ring.lineStyle(12, COLORS.ink, 0.7).beginPath().arc(0, 0, r, 0, Math.PI * 2).strokePath();
        view.ring.lineStyle(7, COLORS.yellow, 1).beginPath().arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + (ringQ / 48) * Math.PI * 2).strokePath();
      }
    }

    // Sonné : trois étoiles tournent au-dessus de sa tête.
    const dizzy = f.dizzy > 0 && f.mode !== 'down' && f.mode !== 'ko' && f.mode !== 'win';
    const head = this.toScreen(f.x / SUB, f.y / SUB + ROSTER[f.id].body.stand.h + 6);
    view.stars.forEach((st, n) => {
      st.setVisible(dizzy);
      if (!dizzy) return;
      const ang = this.time.now / 260 + (n * Math.PI * 2) / 3;
      st.setPosition(head.x + Math.cos(ang) * 38 * this.k, head.y + Math.sin(ang) * 10 * this.k).setScale(0.9 + Math.sin(ang) * 0.2);
    });

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
      case 'buzzFull': {
        sfx.powerUp();
        this.crowd?.cheer(0.5);
        if (e.who === this.me || this.autoplay) this.commentator.say('buzz');
        break;
      }
      case 'buzzStart':
        sfx.buzzHold();
        break;
      case 'buzzCancel':
        break;
      case 'dodge': {
        this.dodges += 1;
        const p = this.toScreen(e.x / SUB, e.y / SUB);
        this.fx.damageNumber(p.x, p.y - 40, BUZZ.dodge, 'n', 'lbl_dodge');
        sfx.whoosh();
        if (this.dodges % 2 === 1) this.commentator.say('dodge');
        break;
      }
      case 'dizzy': {
        const f = s.f[e.who];
        const p = this.toScreen(f.x / SUB, ROSTER[f.id].body.stand.h + 30);
        const tag = this.add.image(p.x, p.y, 'lbl_stun').setDepth(72).setAngle(-6);
        this.tweens.add({ targets: tag, y: p.y - 40, alpha: 0, delay: 700, duration: 400, onComplete: () => tag.destroy() });
        sfx.dizzy();
        this.commentator.say('stun');
        break;
      }
      case 'special': {
        this.specials += 1;
        const id = s.f[e.who].id;
        this.fx.clearTransient();
        this.sfxSpecial.start();
        announceImage(this, `ann_special_${id}`, 900, 0.24);
        this.fx.screenFlash(0.5, COLORS.yellow);
        this.commentator.sayLine(id);
        sfx.special(specialOf(id).effect);
        sfx.crowd(0.8);
        this.crowd?.cheer(0.8);
        break;
      }
      case 'launch':
        this.sfxSpecial.launch();
        break;
      case 'signal': {
        const f = s.f[e.who];
        this.sfxSpecial.signal(this.toScreen(f.x / SUB, ROSTER[f.id].body.stand.h));
        this.fx.screenFlash(0.4);
        sfx.signal();
        break;
      }
      case 'parry': {
        const f = s.f[e.who];
        const p = this.toScreen(f.x / SUB, ROSTER[f.id].body.stand.h + 40);
        const tag = this.add.image(p.x, p.y, e.ok ? 'lbl_parried' : 'lbl_early').setDepth(72).setAngle(-6).setScale(0.4);
        this.tweens.add({ targets: tag, scale: 1, duration: 120, ease: 'Back.Out' });
        this.tweens.add({ targets: tag, y: p.y - 40, alpha: 0, delay: 650, duration: 350, onComplete: () => tag.destroy() });
        if (e.ok) {
          sfx.parry();
          this.commentator.say('parry');
        }
        break;
      }
      case 'specialHit':
        this.onSpecialHit(e);
        break;
      case 'cineEnd':
        this.sfxSpecial.end();
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
      this.handMark(victim);
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

  /** Trace de main rouge sur la joue après une grosse gifle : elle s'efface en une seconde. */
  private handMark(victim: 0 | 1) {
    const f = this.state.f[victim];
    const s = this.layout.fighterScale;
    const cheek = CHEEK[f.id];
    // CHEEK est en px de texture, vers l'avant du perso : on le ramène au niveau (px logiques).
    const p = this.toScreen(f.x / SUB + (f.facing * cheek.x * s) / this.k, f.y / SUB + (cheek.y * s) / this.k);
    const img = this.add.image(p.x, p.y, 'fx_hand').setDepth(43).setAlpha(0.85).setScale(0.55 * this.world.scaleX).setFlipX(f.facing === -1).setAngle(-f.facing * 12);
    this.tweens.add({ targets: img, alpha: 0, delay: 500, duration: 700, onComplete: () => img.destroy() });
  }

  private onSpecialHit(e: Extract<FightEvent, { t: 'specialHit' }>) {
    const s = this.state;
    const victim = e.by === 0 ? 1 : 0;
    const def = s.f[victim];
    const dir = (def.x >= s.f[e.by].x ? 1 : -1) as 1 | -1;
    const p = this.toScreen(e.x / SUB, e.y / SUB);
    const effect = specialOf(s.f[e.by].id).effect;
    this.hits += 1;
    this.v[victim].flashUntil = this.time.now + 140;
    this.sfxSpecial.impact(effect, p, dir, e.parried);
    this.fx.flash(p.x, p.y, e.parried ? 1 : 1.6);
    this.fx.focusLines(p.x, p.y, e.parried ? 0.5 : 1);
    this.fx.onomatopoeia('crit', p.x, p.y, dir);
    this.fx.damageNumber(p.x, p.y - 70, Math.round(e.dmg / HP), e.parried ? 'n' : 'c', e.parried ? 'lbl_parried' : 'lbl_down');
    this.fx.debris(p.x, p.y, dir, e.parried ? 4 : 10, e.parried ? 0 : 2);
    this.fx.screenFlash(e.parried ? 0.3 : 0.7, effect === 'glitter' ? COLORS.yellow : 0xffffff);
    this.cameras.main.shake(e.parried ? 180 : 340, e.parried ? 0.008 : 0.016);
    sfx.specialImpact(effect, e.parried);
    sfx.cry(def.id, 1);
    sfx.crowd(1, 1.6);
    this.crowd?.cheer(1);
    // Ralenti juste après l'impact (affichage seulement : la simulation reste la même, elle avance moins vite).
    if (!e.parried) this.slowUntil = performance.now() + 420;
  }

  /** Essai de charge : rejoue les derniers pas comme le ferait un retour en arrière, et garde la durée. */
  private replayLoad(in0: InputFrame, in1: InputFrame) {
    this.history.push({ s: this.state, a: in0, b: in1 });
    if (this.history.length > this.rollbackLoad) this.history.shift();
    const t0 = performance.now();
    let s = this.history[0].s;
    for (const h of this.history) s = step(s, h.a, h.b);
    hashState(s);
    this.rollbackMs.push(performance.now() - t0);
    if (this.rollbackMs.length > 600) this.rollbackMs.shift();
  }

  // ── Jeu en ligne ───────────────────────────────────────────────────────

  private startOnline() {
    const start = this.online as MatchStart;
    const room = this.room;
    this.net = new NetSession(this.me, this.state, (m) => room?.sendGame({ n: start.n, m }), { delay: start.delay });
    // Essais : `?netbot=hard` fait jouer ce téléphone par l'IA (elle ne voit que son écran, prédictions comprises) ;
    // `?netbot=idle` : il ne touche à rien.
    const bot = new URLSearchParams(location.search).get('netbot');
    if (bot === 'idle') {
      this.netBot = new IdleSource() as unknown as AiSource;
      this.touch.setVisible(false);
    } else if (bot === 'easy' || bot === 'normal' || bot === 'hard') {
      this.netBot = new AiSource(bot, start.seed + this.me);
      this.touch.setVisible(false);
    }
    if (!room) return;
    this.offRoom = room.listen({
      game: (g) => {
        if (g.n === start.n) this.net?.receive(performance.now(), g.m);
      },
      react: (i) => this.showReaction(1 - this.me as 0 | 1, i),
      leave: (why) => {
        if (why === 'self' || this.ended) return;
        this.ended = true;
        this.netOverlay(why === 'version' ? ONLINE.version : ONLINE.left(room.them?.pseudo ?? ''), ONLINE.cancelled, true);
      },
    });
    // Réactions : un bouton sous celui du son.
    this.reactBtn = this.add
      .text(0, 0, '💬', { fontSize: '40px' })
      .setOrigin(0.5)
      .setDepth(130)
      .setInteractive({ useHandCursor: true })
      .setName('btn-react');
    this.reactBtn.on('pointerup', () => this.toggleReactMenu());
  }

  /** Entrée de ce téléphone pour le prochain pas. */
  private localInput(): InputFrame {
    if (this.netBot && this.net) return this.netBot.read(this.net.state, this.me);
    const forced = window.__slap?.inputs ?? {};
    const f1 = typeof forced.p1 === 'function' ? forced.p1(this.state) : forced.p1;
    return mergeInputs(this.keyboard.read(), this.touch.read(), f1 ?? {});
  }

  private updateOnline(time: number) {
    const net = this.net as NetSession;
    const now = performance.now();
    const delta = (this.lastNow < 0 ? STEP_MS : now - this.lastNow) * (now < this.slowUntil ? 0.35 : 1);
    this.lastNow = now;
    this.acc = Math.min(this.acc + delta, STEP_MS * MAX_STEPS_PER_FRAME);
    while (this.acc >= STEP_MS && !this.ended) {
      this.acc -= STEP_MS;
      net.tick(now, this.localInput());
      this.state = net.state;
      for (const e of net.drainEvents()) this.onEvent(e);
      if (net.finished) break;
    }
    this.state = net.state;
    this.crowd?.update(time);
    this.render(false);
    if (!this.ended) {
      const st = net.status(now);
      if (st !== this.netShown) {
        this.netShown = st;
        if (st === 'ok') this.clearNetUi();
        else if (st === 'unstable') this.netOverlay(ONLINE.unstable);
        else if (st === 'paused') this.netOverlay(ONLINE.paused, ONLINE.pausedHelp);
        else {
          // Entre amis : au-delà de 15 s, le match est annulé.
          this.ended = true;
          this.netOverlay(ONLINE.lostTitle, ONLINE.cancelled, true);
          this.room?.close('lost');
        }
      }
      if (net.finished) this.endOnline();
    }
    this.publish();
  }

  private endOnline() {
    this.ended = true;
    const s = this.net!.confirmedState;
    const data: ResultData = {
      ids: this.ids,
      stage: this.stageId,
      winner: s.winner as 0 | 1,
      wins: [s.wins[0], s.wins[1]],
      p2: 'ai',
      level: this.level,
      autoplay: false,
      online: { me: this.me, hash: hashState(s), steps: this.net!.confirmedFrame, stats: { ...this.net!.stats } },
    };
    // Laisse voir le K.O. un instant, comme hors ligne.
    this.time.delayedCall(300, () => this.scene.start('Result', data));
  }

  private clearNetUi() {
    for (const o of this.netUi) o.destroy();
    this.netUi = [];
  }

  /** Bandeau de connexion ; `menu` : le match est fini, bouton pour revenir au menu. */
  private netOverlay(title: string, help = '', menu = false) {
    this.clearNetUi();
    const { width, height } = this.scale;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.netUi.push(o), o);
    if (menu) add(this.add.rectangle(0, 0, width, height, COLORS.ink, 0.6).setOrigin(0).setDepth(160));
    add(this.add.rectangle(width / 2, height * 0.32, Math.min(width * 0.8, 760), help ? 110 : 70, COLORS.ink, 0.92).setStrokeStyle(5, COLORS.pink).setAngle(-2).setDepth(161));
    add(
      this.add
        .text(width / 2, height * 0.32 - (help ? 18 : 0), title.toUpperCase(), { fontFamily: FONT_TITLE, fontSize: '30px', color: CSS.cream, stroke: CSS.ink, strokeThickness: 6 })
        .setOrigin(0.5)
        .setAngle(-2)
        .setDepth(162)
        .setName('net-title'),
    );
    if (help)
      add(
        this.add
          .text(width / 2, height * 0.32 + 24, help, { fontFamily: FONT_UI, fontStyle: '800', fontSize: '18px', color: CSS.cyan, stroke: CSS.ink, strokeThickness: 4, align: 'center', wordWrap: { width: Math.min(width * 0.75, 720) } })
          .setOrigin(0.5)
          .setAngle(-2)
          .setDepth(162),
      );
    if (menu) {
      add(
        makeButton(this, width / 2, height * 0.6, ONLINE.menu, COLORS.yellow, () => {
          this.room?.leave();
          this.scene.start('Title');
        }, { w: 240, h: 66, font: 28 })
          .setDepth(163)
          .setName('btn-net-menu'),
      );
      this.touch.setVisible(false);
    }
  }

  private toggleReactMenu() {
    if (this.reactMenu.length) {
      for (const o of this.reactMenu) o.destroy();
      this.reactMenu = [];
      return;
    }
    const { width } = this.scale;
    const items = [...REACTIONS, this.muted ? ONLINE.muteOn : ONLINE.muteOff];
    const w = 190;
    // Une ligne jusqu'à 8 boutons, sinon deux lignes.
    const perRow = items.length > 8 ? Math.ceil(items.length / 2) : items.length;
    items.forEach((label, i) => {
      const mute = i === REACTIONS.length;
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, items.length - row * perRow);
      const x0 = width / 2 - ((inRow - 1) * (w + 8)) / 2;
      const b = makeButton(this, x0 + (i % perRow) * (w + 8), 150 + row * 56, label, mute ? (this.muted ? COLORS.pink : COLORS.cream) : COLORS.cyan, () => {
        if (mute) {
          this.muted = !this.muted;
          updateSave((sv) => ({ ...sv, muteReactions: this.muted }));
        } else this.sendReaction(i);
        this.toggleReactMenu();
      }, { w, h: 46, font: 16 })
        .setDepth(140)
        .setName(mute ? 'btn-react-mute' : `btn-react-${i}`);
      this.reactMenu.push(b);
    });
  }

  private sendReaction(i: number) {
    // Au plus une réaction toutes les 1,5 s.
    const now = performance.now();
    if (now - this.lastReact < 1500) return;
    this.lastReact = now;
    this.room?.react(i);
    this.showReaction(this.me, i);
  }

  /** Bulle au-dessus d'un combattant pendant 2 s. Celles de l'adversaire sont cachées s'il a été coupé. */
  private showReaction(who: 0 | 1, i: number) {
    if (who !== this.me && this.muted) return;
    const text = REACTIONS[i];
    if (!text) return;
    const f = this.state.f[who];
    const p = this.toScreen(f.x / SUB, f.y / SUB + ROSTER[f.id].body.stand.h + 60);
    const bubble = this.add
      .text(p.x, p.y, text, { fontFamily: FONT_UI, fontStyle: '800', fontSize: '22px', color: CSS.ink, backgroundColor: CSS.cream, padding: { x: 12, y: 6 } })
      .setOrigin(0.5, 1)
      .setDepth(120)
      .setName(`reaction-${who}`);
    if (window.__slap) {
      const w = window.__slap as unknown as { reactions?: string[] };
      (w.reactions ??= []).push(`${who}:${text}`);
    }
    this.tweens.add({ targets: bubble, y: p.y - 30, alpha: 0, delay: 1600, duration: 400, onComplete: () => bubble.destroy() });
  }

  // ── Tutoriel ───────────────────────────────────────────────────────────

  /** Panneau de consigne sous les barres de vie, puis écran de fin. Redessiné seulement quand il change. */
  private renderTuto() {
    const t = this.tuto as Tuto;
    const id = tutoStep(t);
    // Pendant la cinématique d'un coup spécial, le panneau s'efface pour laisser voir le nom du coup.
    const cine = !!this.state.cine;
    const key = `${t.i}|${Math.round(tutoProgress(t) * 20)}|${t.pause > 0}|${this.touchMode}|${cine}|${this.scale.width}x${this.scale.height}`;
    if (key === this.tutoShown) return;
    this.tutoShown = key;
    for (const o of this.tutoUi) o.destroy();
    this.tutoUi = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.tutoUi.push(o), o);
    const { width, height } = this.scale;
    const cx = width / 2;
    const side = Math.max(safeInsets(this).left, safeInsets(this).right);

    if (!id) {
      // Fin : grand bandeau, astuce, et le bouton pour aller choisir son combattant.
      add(this.add.rectangle(0, 0, width, height, COLORS.ink, 0.55).setOrigin(0).setDepth(150));
      add(this.add.rectangle(cx, height * 0.3, width * 1.3, 130, COLORS.red).setStrokeStyle(8, COLORS.ink).setAngle(-3).setDepth(151));
      const title = add(
        this.add
          .text(cx, height * 0.29, TUTORIAL.done, { fontFamily: FONT_TITLE, fontSize: '76px', color: CSS.yellow, stroke: CSS.ink, strokeThickness: 14 })
          .setOrigin(0.5)
          .setAngle(-3)
          .setDepth(152)
          .setName('tuto-done'),
      );
      if (title.width > width * 0.8) title.setScale((width * 0.8) / title.width);
      const tip = add(
        this.add
          .text(cx, height * 0.47, this.touchMode ? TUTORIAL.doneHelp.touch : TUTORIAL.doneHelp.keys, { fontFamily: FONT_UI, fontStyle: '800', fontSize: '22px', color: CSS.cream, stroke: CSS.ink, strokeThickness: 6, align: 'center', wordWrap: { width: width * 0.7 } })
          .setOrigin(0.5)
          .setDepth(152),
      );
      tip.setName('tuto-tip');
      add(makeButton(this, cx, height * 0.66, TUTORIAL.go, COLORS.yellow, () => this.endTuto(), { w: 340, h: 80, font: 34 }).setDepth(153).setName('btn-tuto-go'));
      this.touch.setVisible(false);
      return;
    }

    if (cine) return;
    const txt = TUTORIAL.steps[id];
    const top = 112;
    const w = Math.min(width - 2 * (150 + side), 680);
    add(this.add.rectangle(cx, top + 44, w, 92, COLORS.ink, 0.72).setStrokeStyle(4, t.pause > 0 ? COLORS.yellow : COLORS.cream).setDepth(140));
    add(
      this.add
        .text(cx, top + 18, `${t.i + 1}/${TUTO_STEPS.length} · ${txt.title.toUpperCase()}`, { fontFamily: FONT_TITLE, fontSize: '28px', color: CSS.yellow, stroke: CSS.ink, strokeThickness: 7 })
        .setOrigin(0.5)
        .setDepth(141)
        .setName('tuto-title'),
    );
    const line = add(
      this.add
        .text(cx, top + 54, t.pause > 0 ? TUTORIAL.good : this.touchMode ? txt.touch : txt.keys, {
          fontFamily: t.pause > 0 ? FONT_TITLE : FONT_UI,
          fontStyle: '800',
          fontSize: t.pause > 0 ? '30px' : '20px',
          color: t.pause > 0 ? CSS.yellow : CSS.cream,
          stroke: CSS.ink,
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(141)
        .setName('tuto-line'),
    );
    if (line.width > w - 24) line.setScale((w - 24) / line.width);
    // Barre de progrès de l'exercice.
    const bw = w - 60;
    const bar = add(this.add.graphics().setDepth(141));
    bar.fillStyle(COLORS.cream, 0.25).fillRect(cx - bw / 2, top + 78, bw, 6);
    bar.fillStyle(COLORS.yellow, 1).fillRect(cx - bw / 2, top + 78, bw * tutoProgress(t), 6);
    add(makeButton(this, width - 92 - side, 190, TUTORIAL.skip, COLORS.cream, () => this.endTuto(), { w: 130, h: 44, font: 17 }).setDepth(142).setName('btn-tuto-skip'));
  }

  /** Tutoriel fini ou passé : il ne sera plus proposé ; on va choisir son combattant. */
  private endTuto() {
    updateSave((sv) => ({ ...sv, tutorialDone: true }));
    this.scene.start('CharacterSelect', { left: this.ids[0] });
  }

  // ── État visible par les tests ─────────────────────────────────────────

  private publish() {
    if (!window.__slap) return;
    const s = this.state;
    const one = (f: FighterState) => ({
      x: f.x / SUB,
      y: f.y / SUB,
      facing: f.facing,
      action: actionIn(s, f === s.f[0] ? 0 : 1),
      pose: frameOf(poseFor(f.id, actionIn(s, f === s.f[0] ? 0 : 1)), f.t),
      mode: f.mode,
      move: f.move,
      hp: f.hp / HP,
      guard: f.guard / (GUARD_MAX / GUARD.max),
      charge: f.mode === 'charge' ? chargePct(f.chg) : 0,
      buzz: f.buzz,
      dizzy: f.dizzy,
      ring: f.mode === 'buzz' ? Math.min(1, f.mt / BUZZ_STEPS) : 0,
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
      specials: this.specials,
      dodges: this.dodges,
      cine: s.cine ? { ...s.cine } : null,
      buzzButton: this.touch.buzzShown,
      lastHit: this.lastHit,
      camera: { ...this.cam },
      fps: this.game.loop.actualFps,
      timeLeft: Math.ceil(s.timeLeft / SIM.stepsPerSecond),
      rollbackMs: this.rollbackMs.length ? [...this.rollbackMs] : null,
      net: this.net
        ? {
            me: this.me,
            n: this.online?.n,
            delay: this.online?.delay,
            frame: this.net.frame,
            confirmed: this.net.confirmedFrame,
            status: this.net.status(performance.now()),
            stats: { ...this.net.stats },
          }
        : null,
      tuto: this.tuto ? { step: tutoStep(this.tuto), index: this.tuto.i, n: this.tuto.n, pause: this.tuto.pause, done: tutoDone(this.tuto) } : null,
    };
    window.__slap.fx = { ...this.fx.stats, special: { ...this.sfxSpecial.stats }, ...(this.crowd?.stats ?? {}), ...this.commentator.stats, sounds: sfx.played.slice(-40) };
  }
}
