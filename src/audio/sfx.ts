// Sons générés en code (Web Audio), en attendant des fichiers définitifs.
// Aucun fichier à télécharger : tout est synthétisé à la volée.
import { ROSTER, type FighterId } from '../config/roster';
import type { SpecialEffect } from '../config/specials';
import { MusicPlayer } from './music';

const STORAGE_KEY = 'politiclash.muted';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private music: MusicPlayer | null = null;
  muted = false;
  /** Journal des sons joués (lu par les tests). */
  readonly played: string[] = [];

  constructor() {
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  /** À appeler sur un geste de l'utilisateur (politique d'autoplay des navigateurs). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      // Petit compresseur : les claques peuvent être fortes sans saturer.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      comp.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(comp);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.5;
      this.musicBus.connect(comp);
      const len = this.ctx.sampleRate * 1.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready() {
    return !!this.ctx;
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem(STORAGE_KEY, m ? '1' : '0');
    } catch {
      /* stockage indisponible : tant pis */
    }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.03);
  }

  private log(name: string) {
    this.played.push(name);
    if (this.played.length > 200) this.played.shift();
  }

  // ── Briques de base ────────────────────────────────────────────────────

  private noiseBurst(t: number, dur: number, opts: { type: BiquadFilterType; freq: number; q?: number; gain: number; freqEnd?: number; attack?: number }, bus?: AudioNode) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = opts.type;
    f.frequency.setValueAtTime(opts.freq, t);
    if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus ?? this.sfxBus);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  private tone(t: number, dur: number, opts: { type: OscillatorType; freq: number; freqEnd?: number; gain: number; attack?: number; vibrato?: [number, number] }, bus?: AudioNode) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = opts.type;
    o.frequency.setValueAtTime(opts.freq, t);
    if (opts.freqEnd) o.frequency.exponentialRampToValueAtTime(opts.freqEnd, t + dur);
    if (opts.vibrato) {
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = opts.vibrato[0];
      lg.gain.value = opts.vibrato[1];
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ── Effets ─────────────────────────────────────────────────────────────

  /** Claque : bruit très bref et brillant + « corps » grave selon la puissance (0–1). */
  slap(power: number, critical = false) {
    this.log(critical ? 'slap-crit' : 'slap');
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.005;
    const p = Math.max(0.15, Math.min(1, power));
    this.noiseBurst(t, 0.09 + p * 0.05, { type: 'highpass', freq: 1800, gain: 0.5 + p * 0.5 });
    this.noiseBurst(t, 0.06, { type: 'bandpass', freq: 3200, q: 1.5, gain: 0.6 * p });
    this.tone(t, 0.12 + p * 0.1, { type: 'sine', freq: 180 + p * 60, freqEnd: 60, gain: 0.35 + p * 0.45 });
    if (critical) {
      this.noiseBurst(t + 0.015, 0.22, { type: 'bandpass', freq: 900, freqEnd: 300, q: 0.8, gain: 0.5 });
      this.tone(t, 0.35, { type: 'triangle', freq: 95, freqEnd: 40, gain: 0.6 });
    }
  }

  /** Souffle du bras qui part. */
  whoosh() {
    this.log('whoosh');
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.14, { type: 'bandpass', freq: 500, freqEnd: 2600, q: 2, gain: 0.25, attack: 0.05 });
  }

  /** Cri du perso qui encaisse (voix grave ou aiguë, selon `roster.ts`). */
  cry(id: FighterId, intensity: number) {
    this.log(`cry-${id}`);
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.03;
    const grave = ROSTER[id].voice === 'grave';
    const base = grave ? 150 : 420;
    const dur = 0.22 + intensity * 0.25;
    const peak = base * (1.6 + intensity * 0.6);
    const c = this.ctx;
    // « Aïe ! » : dent de scie filtrée (formant) avec glissando montant puis descendant
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(peak, t + dur * 0.3);
    o.frequency.exponentialRampToValueAtTime(base * 0.8, t + dur);
    const f1 = c.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(grave ? 700 : 1100, t);
    f1.frequency.linearRampToValueAtTime(grave ? 500 : 800, t + dur);
    f1.Q.value = 4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 + intensity * 0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f1).connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Sifflet de l'arbitre (trille). */
  whistle(long = false) {
    this.log('whistle');
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = long ? 0.75 : 0.42;
    this.tone(t, dur, { type: 'sine', freq: 2900, gain: 0.22, attack: 0.02, vibrato: [32, 140] });
    this.noiseBurst(t, dur, { type: 'bandpass', freq: 2900, q: 6, gain: 0.08, attack: 0.02 });
  }

  /** Clameur de la foule (intensité 0–1). */
  crowd(intensity: number, dur = 1.2) {
    this.log('crowd');
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = 3 + Math.round(intensity * 4);
    for (let i = 0; i < n; i++) {
      this.noiseBurst(t + i * 0.06, dur * (0.6 + Math.random() * 0.5), {
        type: 'bandpass',
        freq: 500 + Math.random() * 900,
        q: 1.2,
        gain: 0.05 + intensity * 0.07,
        attack: 0.12,
      });
    }
    // quelques « Ohé ! » tonaux
    for (let i = 0; i < 2 + Math.round(intensity * 3); i++) {
      const f = 220 + Math.random() * 260;
      this.tone(t + 0.05 + Math.random() * 0.4, 0.3, { type: 'sawtooth', freq: f, freqEnd: f * 1.3, gain: 0.03 + intensity * 0.03, attack: 0.05 });
    }
  }

  /** Huées (gifle molle, ratée). */
  boo() {
    this.log('boo');
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const f = 140 + Math.random() * 60;
      this.tone(t + i * 0.05, 0.7, { type: 'sawtooth', freq: f, freqEnd: f * 0.8, gain: 0.04, attack: 0.15 });
    }
    this.noiseBurst(t, 0.8, { type: 'lowpass', freq: 600, gain: 0.08, attack: 0.15 });
  }

  /** Barre Buzz pleine : montée qui grince, façon transformation d'anime. */
  powerUp() {
    this.log('powerup');
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(t, 0.7, { type: 'sawtooth', freq: 180, freqEnd: 1400, gain: 0.12, attack: 0.05 });
    this.tone(t + 0.02, 0.7, { type: 'square', freq: 270, freqEnd: 2100, gain: 0.06, attack: 0.05 });
    this.noiseBurst(t, 0.7, { type: 'bandpass', freq: 600, freqEnd: 5000, q: 3, gain: 0.12, attack: 0.1 });
  }

  /** Perso sonné : petits gazouillis d'oiseaux. */
  dizzy() {
    this.log('dizzy');
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.1;
    for (let i = 0; i < 5; i++) {
      const f = 2400 + Math.random() * 900;
      this.tone(t + i * 0.11, 0.08, { type: 'sine', freq: f, freqEnd: f * 1.25, gain: 0.07, attack: 0.005 });
    }
  }

  /** Le cercle du Buzz se remplit : bourdonnement qui monte (0,5 s). */
  buzzHold() {
    this.log('buzz-hold');
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(t, 0.5, { type: 'sawtooth', freq: 110, freqEnd: 440, gain: 0.08, attack: 0.04, vibrato: [18, 12] });
  }

  /** Le signal du coup spécial : un son sec et clair (« garde, maintenant ! »). */
  signal() {
    this.log('signal');
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(t, 0.16, { type: 'square', freq: 2093, gain: 0.12, attack: 0.002 });
    this.tone(t, 0.22, { type: 'sine', freq: 3136, gain: 0.1, attack: 0.002 });
    this.noiseBurst(t, 0.05, { type: 'highpass', freq: 5000, gain: 0.35 });
  }

  /** Garde au bon moment : choc métallique. */
  parry() {
    this.log('parry');
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const f of [880, 1320, 1975]) this.tone(t, 0.45, { type: 'triangle', freq: f, gain: 0.09, attack: 0.002 });
    this.noiseBurst(t, 0.08, { type: 'bandpass', freq: 4000, q: 2, gain: 0.4 });
  }

  /** Son propre à chaque coup spécial, joué au début de la cinématique (durée ~1,7 s). */
  special(effect: SpecialEffect) {
    this.log(`special-${effect}`);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (effect) {
      case 'glitter':
        // Arpège scintillant puis souffle.
        [1568, 1976, 2349, 3136, 2637, 3951].forEach((f, i) => this.tone(t + 0.12 + i * 0.07, 0.25, { type: 'sine', freq: f, gain: 0.07, attack: 0.005 }));
        this.noiseBurst(t + 0.45, 0.5, { type: 'bandpass', freq: 3000, freqEnd: 900, q: 1, gain: 0.18, attack: 0.08 });
        break;
      case 'dance':
        // Petit groove : grosse caisse, claquements de mains, basse qui swingue.
        for (let i = 0; i < 6; i++) {
          this.tone(t + i * 0.14, 0.12, { type: 'sine', freq: 120, freqEnd: 50, gain: 0.3 });
          if (i % 2) this.noiseBurst(t + i * 0.14, 0.06, { type: 'bandpass', freq: 1800, q: 1.4, gain: 0.35 });
          this.tone(t + i * 0.14, 0.12, { type: 'square', freq: [110, 165, 147, 196, 165, 220][i], gain: 0.05 });
        }
        break;
      case 'beer':
        // Glouglou : bulles graves qui montent.
        for (let i = 0; i < 7; i++) this.tone(t + 0.5 + i * 0.09, 0.08, { type: 'sine', freq: 180 + i * 25, freqEnd: 420 + i * 30, gain: 0.16, attack: 0.005 });
        this.noiseBurst(t + 0.1, 0.25, { type: 'highpass', freq: 3500, gain: 0.08, attack: 0.05 });
        break;
      case 'shout':
        // Inspiration, puis cri saturé.
        this.noiseBurst(t, 0.45, { type: 'bandpass', freq: 600, freqEnd: 1800, q: 1, gain: 0.12, attack: 0.25 });
        this.tone(t + 0.5, 0.9, { type: 'sawtooth', freq: 220, freqEnd: 160, gain: 0.22, attack: 0.03, vibrato: [9, 18] });
        this.tone(t + 0.5, 0.9, { type: 'square', freq: 330, freqEnd: 240, gain: 0.08, attack: 0.03, vibrato: [9, 25] });
        this.noiseBurst(t + 0.5, 0.9, { type: 'lowpass', freq: 1800, gain: 0.18, attack: 0.03 });
        break;
      case 'throw':
        // Élan, puis l'outil qui tournoie.
        this.noiseBurst(t + 0.45, 0.2, { type: 'bandpass', freq: 400, freqEnd: 2400, q: 2, gain: 0.25, attack: 0.05 });
        for (let i = 0; i < 4; i++) this.noiseBurst(t + 0.6 + i * 0.1, 0.08, { type: 'bandpass', freq: 1400, q: 3, gain: 0.2, attack: 0.02 });
        break;
      case 'wind':
        // Pet de dessin animé : basse qui vibre et descend.
        this.tone(t + 0.55, 0.55, { type: 'sawtooth', freq: 95, freqEnd: 55, gain: 0.3, attack: 0.02, vibrato: [26, 20] });
        this.noiseBurst(t + 0.55, 0.5, { type: 'lowpass', freq: 400, gain: 0.25, attack: 0.02 });
        break;
    }
  }

  /** Impact du coup spécial : explosion grave, selon l'effet. */
  specialImpact(effect: SpecialEffect, parried: boolean) {
    this.log(`special-hit-${effect}`);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = parried ? 0.5 : 1;
    this.tone(t, 0.6, { type: 'sine', freq: 140, freqEnd: 35, gain: 0.7 * g });
    this.noiseBurst(t, 0.5, { type: 'lowpass', freq: 2200, freqEnd: 200, gain: 0.6 * g });
    if (effect === 'beer') for (let i = 0; i < 6; i++) this.tone(t + i * 0.03, 0.2, { type: 'triangle', freq: 2500 + Math.random() * 2500, gain: 0.08 });
    if (effect === 'throw') this.tone(t, 0.4, { type: 'triangle', freq: 1240, gain: 0.15 });
    if (effect === 'wind') this.noiseBurst(t, 0.25, { type: 'bandpass', freq: 300, q: 2, gain: 0.4 });
    if (effect === 'glitter') [2093, 2637, 3136].forEach((f, i) => this.tone(t + 0.05 + i * 0.05, 0.6, { type: 'sine', freq: f, gain: 0.06 }));
  }

  /** Cloche de K.O. */
  ko() {
    this.log('ko');
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [f, g] of [
      [523, 0.3],
      [1046, 0.15],
      [1568, 0.08],
    ] as const) {
      this.tone(t, 1.6, { type: 'sine', freq: f, gain: g, attack: 0.005 });
      this.tone(t + 0.35, 1.4, { type: 'sine', freq: f, gain: g * 0.7, attack: 0.005 });
    }
  }

  /** Petit « bip » d'interface (chrono). */
  tick(urgent: boolean) {
    this.log('tick');
    if (!this.ctx) return;
    this.tone(this.ctx.currentTime, 0.07, { type: 'square', freq: urgent ? 1320 : 880, gain: 0.06, attack: 0.003 });
  }

  // ── Musique : générique de combat façon anime 90s (voir music.ts) ─────

  startMusic() {
    if (!this.ctx) return;
    this.music ??= new MusicPlayer(this.ctx, this.musicBus);
    if (this.music.playing) return;
    this.log('music');
    this.music.start();
  }

  stopMusic() {
    this.music?.stop();
  }
}

/** Instance unique partagée par les scènes. */
export const sfx = new Sfx();
