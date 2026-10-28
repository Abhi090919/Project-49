// Environmental recordings. Sources and license: public/audio/CREDITS.md.
//
// Every film has its own sound: a looping bed, plus an optional accent played
// once as the film begins ([file, level, delay s]). Opening another film or
// idea cuts straight to its sound. The home page and SILENCE are silent.
// Levels are balanced against each file's measured loudness, so a quiet
// recording can sit at 0.9 and a loud one at 0.06 and still feel even.

// The home page carries the Project 11:59 score, softly, under everything (public/audio/score.mp3).
const HOME = { bed: ['score', 0.62] };

const IDEAS = {
  LIGHT: { bed: ['morning-birds', 0.25] },
  AIR: { bed: ['breeze', 0.16] },
  ART: { bed: ['art-room-tone', 0.06] },
  ROOTS: { bed: ['roots-courtyard-birds', 0.3] },
  EARTH: { bed: ['earth-garden-morning', 0.9] },
  SILENCE: { bed: null }, // pin-drop silence
  FUTURE: { bed: ['future-refrigerator-hum', 0.55] },
};

const SCENES = {
  // LIGHT — the day passing: dawn, daytime, evening
  gradient: { bed: ['morning-birds', 0.25] },
  day: { bed: ['garden', 0.9] },
  shadow: { bed: ['light-evening-crickets', 0.5] },
  // AIR — breeze outside, air moving through rooms, chimes in a doorway
  wind: { bed: ['breeze', 0.16] },
  breath: { bed: ['air-soft-wind-interior', 0.22] },
  trace: { bed: ['air-soft-wind-interior', 0.16], accent: ['air-wind-chimes', 0.2, 0.8] },
  // ART — a quiet gallery room
  gallery: { bed: ['art-room-tone', 0.06], accent: ['art-footsteps', 0.8, 0.6] },
  mural: { bed: ['art-room-tone', 0.07] },
  sculpture: { bed: ['art-room-tone', 0.06], accent: ['art-stone-scratch', 0.28, 1.2] },
  // ROOTS — a courtyard house, a heavy door, hand work on stone
  'root-entrance': { bed: ['roots-courtyard-birds', 0.3], accent: ['roots-wooden-door', 0.45, 0.5] },
  'root-material': { bed: ['roots-courtyard-birds', 0.26], accent: ['art-stone-scratch', 0.26, 1.4] },
  // EARTH — garden, stone underfoot, earth being worked
  garden: { bed: ['earth-garden-morning', 0.9] },
  stone: { bed: ['earth-walking-on-stones', 0.9] },
  courtyard: { bed: ['breeze', 0.1], accent: ['earth-digging', 0.7, 0.8] },
  // SILENCE — nothing at all
  silence: { bed: null },
  // FUTURE — a quiet home hum with small signs of technology
  grown: { bed: ['future-refrigerator-hum', 0.55], accent: ['future-water-bubble', 0.35, 1] },
  'smart-glass': { bed: ['future-refrigerator-hum', 0.45], accent: ['future-glass-slide', 0.6, 1] },
  'ceiling-tv': { bed: ['future-refrigerator-hum', 0.45], accent: ['future-power-up', 0.07, 0.8] },
};

// Films of each idea, in order, so an idea's sounds can load as soon as it opens.
const IDEA_FILMS = {
  LIGHT: ['gradient', 'day', 'shadow'], AIR: ['wind', 'breath', 'trace'], ART: ['gallery', 'mural', 'sculpture'],
  ROOTS: ['root-entrance', 'root-material'], EARTH: ['garden', 'stone', 'courtyard'], SILENCE: ['silence'],
  FUTURE: ['grown', 'smart-glass', 'ceiling-tv'],
};
const ORDER = Object.keys(IDEA_FILMS);

export class Soundscape {
  constructor() { this.cache = new Map(); this.generation = 0; this.bed = null; this.accents = new Set(); this.themeLayer = null; this.themeName = null; }

  async start() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
      // A cinematic bus: everything sent here is heard inside a large, soft room.
      this.reverb = this.ctx.createConvolver(); this.reverb.buffer = this.impulse(3.4, 2.4);
      this.fx = this.ctx.createGain(); this.fx.gain.value = 1;
      const wet = this.ctx.createGain(); wet.gain.value = 0.42;
      this.fx.connect(this.master); this.fx.connect(this.reverb); this.reverb.connect(wet).connect(this.master);
      this.noise = { brown: this.makeNoise('brown'), pink: this.makeNoise('pink'), white: this.makeNoise('white') };
    }
    await this.ctx.resume();
  }

  // ---------- synthesis primitives for the entry signatures ----------
  impulse(seconds, decay) {
    const c = this.ctx, len = Math.floor(c.sampleRate * seconds), buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return buf;
  }

  makeNoise(type) {
    const c = this.ctx, len = c.sampleRate * 3, buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let last = 0, b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (type === 'white') d[i] = w * 0.5;
        else if (type === 'pink') { b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.084; b2 = 0.95 * b2 + w * 0.169; d[i] = (b0 + b1 + b2 + w * 0.18) * 0.4; }
        else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      }
    }
    return buf;
  }

  tone(freq, { at = 0, peak = 0.02, attack = 0.5, decay = 2.4, type = 'sine' } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g).connect(this.fx); o.start(t); o.stop(t + attack + decay + 0.1);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  swell(kind, { at = 0, peak = 0.12, attack = 1.6, hold = 0.6, release = 2.2, freq = 600, q = 0.8, filter = 'bandpass' } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const src = c.createBufferSource(); src.buffer = this.noise[kind]; src.loop = true;
    const f = c.createBiquadFilter(); f.type = filter; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold); g.gain.linearRampToValueAtTime(0.0001, t + attack + hold + release);
    src.connect(f).connect(g).connect(this.fx); src.start(t); src.stop(t + attack + hold + release + 0.1);
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
    return f;
  }

  impact({ at = 0, peak = 0.9, low = 48 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const src = c.createBufferSource(); src.buffer = this.noise.brown;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 170;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    src.connect(f).connect(g).connect(this.fx); src.start(t); src.stop(t + 0.8);
    const o = c.createOscillator(), og = c.createGain(); o.frequency.value = low;
    og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(peak * 0.5, t + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(og).connect(this.fx); o.start(t); o.stop(t + 1);
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
    o.onended = () => { o.disconnect(); og.disconnect(); };
  }

  /**
   * THE ENTRY STING — the cinematic moment of walking into an idea.
   *
   * Five seconds, built like a title sequence: a riser that lifts the room,
   * a sub-heavy impact, a brass-weight chord in that idea's own key, and a
   * long shimmering tail inside a big reverb. The environment recording ducks
   * underneath and returns as the tail decays.
   *
   * A produced piece of music always wins: drop a file at
   * /public/audio/sting-light.mp3 (air, art, roots, earth, silence, future)
   * and it is played instead of the synthesised version.
   */
  async sting(id) {
    if (!this.ctx || this.ctx.state === 'closed') return;
    this.duckBed(0.18, 4.6);
    const file = `sting-${id.toLowerCase()}`;
    try {
      const buffer = await this.load(file);
      if (!this.ctx || this.ctx.state === 'closed') return;
      const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
      src.buffer = buffer; g.gain.value = 0.9;
      src.connect(g).connect(this.master); src.start(); // the composed piece carries its own hall
      src.onended = () => { src.disconnect(); g.disconnect(); };
      return;
    } catch { /* no produced sting yet — play the synthesised one */ }
    this.synthSting(id);
  }

  /**
   * THE THEME — each idea has its own piece of music, written to loop for as
   * long as the idea is open (/public/audio/theme-light.mp3 and so on).
   * It blooms in under the entry sting and crossfades when you move to another
   * idea; the environmental recording stays underneath, quieter.
   */
  async theme(id) {
    if (!this.ctx || this.ctx.state === 'closed') return;
    const name = id ? `theme-${id.toLowerCase()}` : null;
    if (name === this.themeName) return;
    this.themeName = name;
    const now = this.ctx.currentTime;
    const old = this.themeLayer;
    if (old) {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setTargetAtTime(0, now, 0.5);
      const src = old.source; setTimeout(() => { try { src.stop(); } catch { /* */ } }, 2500);
      this.themeLayer = null;
    }
    if (!name) { this.rebalanceBed(); return; }
    try {
      const buffer = await this.load(name);
      if (this.themeName !== name || !this.ctx || this.ctx.state === 'closed') return;
      const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
      source.buffer = buffer; source.loop = true; gain.gain.value = 0;
      source.connect(gain).connect(this.master); source.start();
      // slow bloom, so the entry sting is still the first thing you hear
      gain.gain.setTargetAtTime(0.55, this.ctx.currentTime + 1.2, 1.6);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      this.themeLayer = { name, source, gain };
      this.rebalanceBed();
    } catch { /* no theme written for this idea yet — the environment carries it */ }
  }

  /** The environment recording sits under the music, not beside it. */
  rebalanceBed() {
    if (!this.bed || !this.ctx) return;
    const level = (this.bedLevel ?? 0.3) * (this.themeLayer ? 0.4 : 1);
    this.bed.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.6);
  }

  /** Pull the environment recording down under the sting, then bring it back. */
  duckBed(to, seconds) {
    const bed = this.bed; if (!bed || !this.ctx) return;
    const now = this.ctx.currentTime;
    const level = (this.bedLevel ?? 0.3) * (this.themeLayer ? 0.4 : 1);
    bed.gain.gain.cancelScheduledValues(now);
    bed.gain.gain.setTargetAtTime(level * to, now, 0.08);
    bed.gain.gain.setTargetAtTime(level, now + seconds * 0.55, seconds * 0.35);
  }

  /** A stack of detuned saws through a filter sweep: orchestral weight without samples. */
  brass(freq, { at = 0, peak = 0.05, attack = 0.035, decay = 3.4, open = 2600 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 1.1;
    f.frequency.setValueAtTime(320, t); f.frequency.linearRampToValueAtTime(open, t + 0.5); f.frequency.exponentialRampToValueAtTime(420, t + decay);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(peak * 0.45, t + attack + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    f.connect(g).connect(this.fx);
    const oscs = [-7, -3, 0, 4, 7].map(cents => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq * Math.pow(2, cents / 1200);
      const og = c.createGain(); og.gain.value = 0.2; o.connect(og).connect(f); o.start(t); o.stop(t + attack + decay + 0.2);
      o.onended = () => { o.disconnect(); og.disconnect(); };
      return o;
    });
    setTimeout(() => { f.disconnect(); g.disconnect(); }, (at + attack + decay + 0.4) * 1000);
    return oscs;
  }

  /** A riser: noise climbing in pitch and volume into the hit. */
  riser({ at = 0, length = 1.7, peak = 0.11, from = 260, to = 5200 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const src = c.createBufferSource(); src.buffer = this.noise.pink; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.4;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + length);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + length * 0.92); g.gain.linearRampToValueAtTime(0.0001, t + length + 0.12);
    src.connect(f).connect(g).connect(this.fx); src.start(t); src.stop(t + length + 0.2);
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
  }

  /** A tone climbing with the riser — the pull before the hit. */
  sweep({ at = 0, length = 1.6, from = 110, to = 440, peak = 0.04 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + length);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + length * 0.9); g.gain.linearRampToValueAtTime(0.0001, t + length + 0.1);
    o.connect(g).connect(this.fx); o.start(t); o.stop(t + length + 0.2);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  /** The hit: a sub that drops in pitch, a filtered noise body and a short crack. */
  boom({ at = 0, peak = 1, from = 58, to = 27 } = {}) {
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), og = c.createGain();
    o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + 0.6);
    og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(peak, t + 0.012); og.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(og).connect(this.fx); o.start(t); o.stop(t + 2.4);
    o.onended = () => { o.disconnect(); og.disconnect(); };
    const body = c.createBufferSource(); body.buffer = this.noise.brown;
    const bf = c.createBiquadFilter(); bf.type = 'lowpass'; bf.frequency.setValueAtTime(900, t); bf.frequency.exponentialRampToValueAtTime(90, t + 1.1);
    const bg = c.createGain();
    bg.gain.setValueAtTime(0.0001, t); bg.gain.linearRampToValueAtTime(peak * 0.8, t + 0.008); bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    body.connect(bf).connect(bg).connect(this.fx); body.start(t); body.stop(t + 1.6);
    body.onended = () => { body.disconnect(); bf.disconnect(); bg.disconnect(); };
  }

  /** The tail: high partials ringing away inside the reverb. */
  shimmer(freqs, { at = 0, peak = 0.012, decay = 4.5 } = {}) {
    freqs.forEach((f, i) => this.tone(f, { at: at + i * 0.09, peak: peak * (1 - i * 0.12), attack: 0.9, decay }));
  }

  /**
   * Each idea has its own key and colour. Minor and open for SILENCE and
   * ROOTS, wide and bright for LIGHT and FUTURE.
   */
  synthSting(id) {
    const HIT = 1.55;
    const S = {
      LIGHT:   { root: 130.8, chord: [261.6, 392, 523.3], shimmer: [1046.5, 1568, 2093], open: 3200, bright: 6200 },
      AIR:     { root: 110, chord: [220, 329.6, 493.9], shimmer: [880, 1318.5, 1760], open: 2400, bright: 5200 },
      ART:     { root: 123.5, chord: [246.9, 370, 587.3], shimmer: [987.8, 1480, 1975], open: 2800, bright: 5600 },
      ROOTS:   { root: 98, chord: [196, 233.1, 293.7], shimmer: [587.3, 880, 1174.7], open: 1800, bright: 3600 },
      EARTH:   { root: 87.3, chord: [174.6, 261.6, 349.2], shimmer: [523.3, 698.5, 1046.5], open: 1600, bright: 3200 },
      SILENCE: { root: 73.4, chord: [146.8, 220], shimmer: [440], open: 1200, bright: 2600, quiet: true },
      FUTURE:  { root: 110, chord: [220, 277.2, 415.3, 554.4], shimmer: [1108.7, 1661.2, 2217], open: 3400, bright: 7000 },
    }[id] || { root: 110, chord: [220, 330], shimmer: [880], open: 2400, bright: 5000 };

    // 0.0 – 1.55  the room lifts
    this.riser({ length: HIT, to: S.bright, peak: S.quiet ? 0.1 : 0.17 });
    this.tone(S.root / 2, { peak: 0.05, attack: HIT, decay: 2.2 });
    this.sweep({ length: HIT, from: S.root, to: S.root * 4, peak: S.quiet ? 0.02 : 0.045 });

    if (S.quiet) {
      // SILENCE opens the other way: the lift is taken away, and nothing arrives.
      this.boom({ at: HIT, peak: 0.42, from: 44, to: 24 });
      this.tone(S.chord[0], { at: HIT + 0.1, peak: 0.012, attack: 0.9, decay: 3.4 });
      this.duckBed(0.02, 5);
      return;
    }

    // 1.55  the hit
    this.boom({ at: HIT, peak: 0.95 });
    this.swell('white', { at: HIT, attack: 0.01, hold: 0.02, release: 1.3, peak: 0.1, freq: 3000, filter: 'highpass' });

    // 1.57 – 5.0  the chord blooms, then rings out
    this.brass(S.root, { at: HIT + 0.02, peak: 0.075, decay: 3.8, open: S.open });
    S.chord.forEach((f, i) => this.brass(f, { at: HIT + 0.02 + i * 0.05, peak: 0.05 - i * 0.008, decay: 3.4, open: S.open }));
    this.shimmer(S.shimmer, { at: HIT + 0.35 });
    this.swell('pink', { at: HIT + 0.2, attack: 1.2, hold: 0.4, release: 2.6, peak: 0.05, freq: S.bright * 0.6, filter: 'bandpass', q: 0.7 });
  }

  volume(v) { if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.15); }

  load(name) {
    if (!this.cache.has(name)) {
      this.cache.set(name, fetch(`/audio/${name}.mp3`)
        .then(r => { if (!r.ok) throw new Error(`Audio unavailable: ${name}`); return r.arrayBuffer(); })
        .then(b => this.ctx.decodeAudioData(b))
        .then(buffer => { // short fades at both ends so loops and accents never click
          const fade = Math.min(Math.floor(buffer.sampleRate * 0.08), Math.floor(buffer.length / 2));
          for (let ch = 0; ch < buffer.numberOfChannels; ch++) { const a = buffer.getChannelData(ch); for (let i = 0; i < fade; i++) { a[i] *= i / fade; a[a.length - 1 - i] *= i / fade; } }
          return buffer;
        })
        .catch(e => { this.cache.delete(name); throw e; }));
    }
    return this.cache.get(name);
  }

  // quick fade (about a tenth of a second) so a switch sounds like a cut, not a click
  fadeOut(layer, now) {
    if (!layer) return;
    layer.gain.gain.cancelScheduledValues(now); layer.gain.gain.setTargetAtTime(0, now, 0.05);
    try { layer.source.stop(now + 0.4); } catch {}
  }

  // load this idea's sounds, and the next idea's first one, in the background
  preload(id) {
    if (!IDEA_FILMS[id]) return;
    const next = ORDER[(ORDER.indexOf(id) + 1) % ORDER.length];
    const films = [...IDEA_FILMS[id], IDEA_FILMS[next][0]];
    for (const film of films) {
      const spec = SCENES[film] || {};
      for (const part of [spec.bed, spec.accent]) if (part) this.load(part[0]).catch(() => {});
    }
  }

  async scene(id, sceneId = '') {
    if (!this.ctx) return;
    const token = ++this.generation;
    // One soundtrack for the whole site: the philosophy films no longer carry their own
    // recordings, so the website score simply continues underneath every film.
    const spec = HOME; id = 'HOME';
    const c = this.ctx;
    try {
      const now = c.currentTime;
      for (const accent of this.accents) this.fadeOut(accent, now);
      this.accents.clear();
      const [bedName, bedLevel] = spec.bed || [];
      this.bedLevel = bedLevel;
      const mix = this.themeLayer ? 0.4 : 1;
      if (bedName && this.bed && this.bed.name === bedName && this.bed.idea === id) {
        // next film of the same idea shares this recording: keep it running
        this.bed.gain.gain.cancelScheduledValues(now); this.bed.gain.gain.setTargetAtTime(bedLevel * mix, now, 0.3);
      } else {
        // stop what was playing right away, before the new sound has loaded
        this.fadeOut(this.bed, now); this.bed = null;
        if (!bedName) return;
        const buffer = await this.load(bedName);
        if (token !== this.generation || c.state === 'closed') return;
        const start = c.currentTime;
        const source = c.createBufferSource(), gain = c.createGain();
        source.buffer = buffer; source.loop = true; gain.gain.value = 0;
        source.connect(gain); gain.connect(this.master); gain.gain.setTargetAtTime(bedLevel * mix, start, 0.25);
        source.onended = () => { source.disconnect(); gain.disconnect(); };
        source.start();
        this.bed = { name: bedName, idea: id, source, gain };
      }
      if (spec.accent) {
        const [name, level, delay = 0] = spec.accent;
        const buffer = await this.load(name);
        if (token !== this.generation || c.state === 'closed') return;
        const source = c.createBufferSource(), gain = c.createGain();
        source.buffer = buffer; gain.gain.value = level; source.connect(gain); gain.connect(this.master);
        const layer = { source, gain }; this.accents.add(layer);
        source.onended = () => { source.disconnect(); gain.disconnect(); this.accents.delete(layer); };
        source.start(c.currentTime + delay);
      }
    } catch (e) { console.warn('Environmental audio could not load', e); }
  }

  suspend() { return this.ctx?.suspend(); }
  dispose() { this.generation++; try { this.themeLayer?.source.stop(); } catch { /* */ } this.themeLayer = null; this.ctx?.close(); this.cache.clear(); }
}
