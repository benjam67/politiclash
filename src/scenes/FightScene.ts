import Phaser from 'phaser';
import { MATCH, SIM, STAGE } from '../config/balance';
import { FIGHTER_IDS, spriteOf, type FighterId } from '../config/roster';
import { STAGES, type StageId } from '../config/stages';
import { FIGHTER_TEXTS } from '../config/texts';
import { fighterKey, poseFor } from '../config/poses';
import { computeLayout, HABITUES, type StageLayout } from '../logic/layout';
import { actionOf, createFight, hashState, step, STEP_MS, SUB, type FighterState, type FightState } from '../logic/fight';
import { computeCamera, minZoom, type Camera } from '../logic/camera';
import { mergeInputs, type InputFrame } from '../logic/input';
import { IdleSource, KeyboardSource, WanderSource, type InputSource } from '../input/sources';
import { sfx } from '../audio/sfx';
import { Fx } from '../fx/Fx';
import { Crowd } from '../fx/Crowd';
import { HealthBar } from '../ui/HealthBar';
import { RoundPips, TimerDiamond } from '../ui/hud';
import { safeInsets } from '../ui/safe';
import { TouchControls } from '../ui/TouchControls';

export type Side = 'left' | 'right';

export interface FightData {
  /** Combattant de gauche (joueur 1) et de droite. Par défaut : les deux premiers de la liste. */
  left?: FighterId;
  right?: FighterId;
  stage?: StageId;
  /** Qui joue le combattant de droite : il se promène (défaut), ne fait rien, ou rien que les entrées des tests. */
  p2?: 'wander' | 'idle';
  seed?: number;
}

interface FighterView {
  id: FighterId;
  sprite: Phaser.GameObjects.Image;
  bar: HealthBar;
  pips: RoundPips;
}

/** Nombre maximal de pas de simulation rattrapés en une image (après un gel de l'onglet, on ne rejoue pas tout). */
const MAX_STEPS_PER_FRAME = 5;

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
  private v!: [FighterView, FighterView];
  private timer!: TimerDiamond;
  private soundBtn!: Phaser.GameObjects.Image;
  private homeBtn!: Phaser.GameObjects.Image;
  private fx!: Fx;
  private touch!: TouchControls;
  layout!: StageLayout;

  private ids: [FighterId, FighterId] = ['bernard', 'lola'];
  private stageId: StageId = 'bar';
  private p2Kind: 'wander' | 'idle' = 'wander';
  private seed = 1;

  private state!: FightState;
  private acc = 0;
  private keyboard!: KeyboardSource;
  private p2!: InputSource;
  private cam: Camera = { x: 0, zoom: 1 };
  /** Px de l'écran par px de l'écran logique. */
  private k = 1;
  private feetY = 0;

  constructor() {
    super('Fight');
  }

  init(data: FightData) {
    const left = data.left ?? FIGHTER_IDS[0];
    this.ids = [left, data.right ?? FIGHTER_IDS.find((id) => id !== left) ?? left];
    this.stageId = data.stage ?? 'bar';
    this.p2Kind = data.p2 ?? 'wander';
    this.seed = data.seed ?? 1;
    this.crowd = null;
    this.patron = null;
    this.crowdImgs = [];
    this.decors = [];
    this.acc = 0;
  }

  create() {
    this.time.timeScale = 1;
    this.tweens.timeScale = 1;
    const stage = STAGES[this.stageId];
    this.state = createFight(this.ids[0], this.ids[1], this.stageId, this.seed);

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

    // Entrées : clavier et tactile pour le joueur 1 ; adversaire provisoire à droite.
    this.keyboard = new KeyboardSource();
    this.touch = new TouchControls(this);
    const q = new URLSearchParams(location.search);
    const isTouch = matchMedia('(pointer: coarse)').matches || q.get('touch') === '1';
    this.touch.setVisible(isTouch);
    // Un écran tactile détecté après coup (ordinateur hybride) : les contrôles apparaissent au premier toucher.
    const reveal = () => this.touch.setVisible(true);
    window.addEventListener('touchstart', reveal, { once: true });
    this.p2 = this.p2Kind === 'idle' ? new IdleSource() : new WanderSource(this.seed + 6);

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
    this.publish();
  }

  update(time: number, delta: number) {
    // Simulation à pas fixe, indépendante de la fréquence d'affichage.
    this.acc = Math.min(this.acc + delta, STEP_MS * MAX_STEPS_PER_FRAME);
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      const forced = window.__slap?.inputs ?? {};
      const in0 = mergeInputs(this.keyboard.read(), this.touch.read(), forced.p1 ?? {});
      const in1: InputFrame = forced.p2 ? mergeInputs(forced.p2) : this.p2.read();
      this.state = step(this.state, in0, in1);
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
    // Combat miroir : le second porte une teinte pour qu'on les distingue.
    if (i === 1 && this.ids[0] === this.ids[1]) sprite.setTint(0x9fc4ff);
    this.world.add(sprite);
    const t = FIGHTER_TEXTS[id];
    const bar = new HealthBar(this, side, t.name, t.katakana).setDepth(100);
    const pips = new RoundPips(this, side, MATCH.roundsToWin).setDepth(100);
    return { id, sprite, bar, pips };
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
    this.v[0].bar.setValue(1, true);
    this.v[1].bar.setValue(1, true);
    this.v[0].pips.setPosition(width / 2 - centerGap - 20, 66);
    this.v[1].pips.setPosition(width / 2 + centerGap + 20, 66);
    this.timer.setPosition(width / 2, 48);
    this.soundBtn.setPosition(width - 44 - side, 120);
    this.homeBtn.setPosition(44 + side, 120);
    this.fx.layout(width, height);
    this.touch.layout(width, height, safe);

    if (window.__slap) window.__slap.layout = L;
    if (this.state) this.render(true);
  }

  // ── Affichage de l'état ────────────────────────────────────────────────

  /** Abscisse dans le conteneur du niveau d'un point du niveau (px logiques). */
  private localX(x: number) {
    return this.scale.width / 2 + (x - this.stageW() / 2) * this.k;
  }

  private stageW() {
    return STAGES[this.stageId].widthScreens * SIM.screenW;
  }

  private render(snap: boolean) {
    const { width } = this.scale;
    const [a, b] = this.state.f;
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
    // Celui qui est en l'air passe devant.
    if (b.y > a.y) this.world.bringToTop(this.v[1].sprite);
    else if (a.y > b.y) this.world.bringToTop(this.v[0].sprite);
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
    view.sprite
      .setTexture(fighterKey(f.id, def.pose))
      .setFlipX(flip)
      .setOrigin(flip ? 1 - a.originX : a.originX, a.originY)
      .setPosition(this.localX(f.x / SUB), this.feetY - (f.y / SUB) * this.k - bob)
      .setScale(s, s * (fx.squashY ?? 1))
      .setAngle(fx.tilt ? -f.facing * fx.tilt : 0);
  }

  // ── État visible par les tests ─────────────────────────────────────────

  private publish() {
    if (!window.__slap) return;
    const [a, b] = this.state.f;
    const one = (f: FighterState) => ({ x: f.x / SUB, y: f.y / SUB, facing: f.facing, action: actionOf(f) });
    window.__slap.state = {
      mode: 'fight',
      ids: { left: this.ids[0], right: this.ids[1] },
      stage: this.stageId,
      step: this.state.step,
      hash: hashState(this.state),
      p1: one(a),
      p2: one(b),
      hp: { left: MATCH.hp, right: MATCH.hp },
      camera: { ...this.cam },
      fps: this.game.loop.actualFps,
      timeLeft: MATCH.roundTimeS,
    };
  }
}
