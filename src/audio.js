// =====================================================================
//  Procedural WebAudio sound effects (no asset files)
// =====================================================================
export class Audio {
  constructor() {
    this.ctx = null; this.enabled = localStorage.getItem('rsl_sound') !== '0'; this.master = null; this.lastPlay = {}; this.ambient = null;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = this.enabled ? 0.5 : 0; this.master.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise();
    } catch (e) { this.ctx = null; }
  }
  setEnabled(on) { this.enabled = on; localStorage.setItem('rsl_sound', on ? '1' : '0'); if (this.master) this.master.gain.value = on ? 0.5 : 0; }
  makeNoise() { const len = this.ctx.sampleRate * 1; const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; return b; }
  // throttle identical sounds
  can(name, ms) { const t = performance.now(); if (this.lastPlay[name] && t - this.lastPlay[name] < ms) return false; this.lastPlay[name] = t; return true; }
  tone(freq, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0) {
    const c = this.ctx; const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(freq, c.currentTime + delay);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), c.currentTime + delay + dur);
    g.gain.setValueAtTime(0.0001, c.currentTime + delay); g.gain.exponentialRampToValueAtTime(vol, c.currentTime + delay + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur);
    o.connect(g); g.connect(this.master); o.start(c.currentTime + delay); o.stop(c.currentTime + delay + dur + 0.05);
  }
  noise(dur, vol = 0.3, freq = 1000, q = 1, delay = 0, type = 'bandpass') {
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.noiseBuf; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, c.currentTime + delay); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(c.currentTime + delay); s.stop(c.currentTime + delay + dur + 0.05);
  }
  play(name, vol = 1) {
    if (!this.ctx || !this.enabled) return;
    const v = vol;
    switch (name) {
      case 'click': if (this.can(name, 60)) this.tone(900, 0.05, 'square', 0.08 * v, -300); break;
      case 'select': if (this.can(name, 80)) { this.tone(660, 0.06, 'triangle', 0.12 * v); this.tone(990, 0.08, 'triangle', 0.08 * v, 0, 0.05); } break;
      case 'move': if (this.can(name, 150)) this.tone(420, 0.07, 'triangle', 0.1 * v, 120); break;
      case 'attack': if (this.can(name, 200)) { this.tone(300, 0.12, 'sawtooth', 0.08 * v, -80); this.noise(0.12, 0.08 * v, 2500, 2); } break;
      case 'place': if (this.can(name, 150)) { this.noise(0.15, 0.2 * v, 400, 1); this.tone(180, 0.15, 'triangle', 0.15 * v, -60); } break;
      case 'hammer': if (this.can(name, 120)) { this.noise(0.06, 0.15 * v, 3000, 1.5); this.tone(700 + Math.random() * 300, 0.04, 'square', 0.05 * v, -200); } break;
      case 'chop': if (this.can(name, 120)) { this.noise(0.08, 0.2 * v, 1200, 2); this.tone(220, 0.06, 'triangle', 0.1 * v, -100); } break;
      case 'mine': if (this.can(name, 120)) { this.noise(0.05, 0.15 * v, 4000, 3); this.tone(1800 + Math.random() * 600, 0.05, 'sine', 0.08 * v, -400); } break;
      case 'gather': if (this.can(name, 200)) this.noise(0.1, 0.08 * v, 800, 1); break;
      case 'deposit': if (this.can(name, 100)) { this.tone(880, 0.05, 'sine', 0.07 * v); this.tone(1320, 0.07, 'sine', 0.06 * v, 0, 0.04); } break;
      case 'hit': if (this.can(name, 70)) { this.noise(0.08, 0.22 * v, 1800, 1.2); this.tone(140 + Math.random() * 60, 0.08, 'square', 0.06 * v, -60); } break;
      case 'hitWood': if (this.can(name, 90)) { this.noise(0.1, 0.2 * v, 500, 1.5); } break;
      case 'arrow': if (this.can(name, 60)) this.noise(0.12, 0.09 * v, 3500, 1, 0, 'highpass'); break;
      case 'arrowHit': if (this.can(name, 60)) this.noise(0.05, 0.1 * v, 2500, 2); break;
      case 'die': if (this.can(name, 150)) { this.tone(240, 0.3, 'sawtooth', 0.09 * v, -140); this.noise(0.25, 0.12 * v, 600, 1); } break;
      case 'animalDie': if (this.can(name, 150)) this.tone(500, 0.25, 'triangle', 0.1 * v, -300); break;
      case 'collapse': { this.noise(0.9, 0.4 * v, 250, 0.8, 0, 'lowpass'); this.noise(0.5, 0.25 * v, 900, 1, 0.1); this.tone(60, 0.8, 'sine', 0.3 * v, -30); break; }
      case 'horn': { for (let i = 0; i < 3; i++) { this.tone(196 * (i === 2 ? 1.5 : 1), 0.5, 'sawtooth', 0.12 * v, 4, i * 0.3); this.tone(196 * (i === 2 ? 1.5 : 1) * 1.005, 0.5, 'square', 0.05 * v, 0, i * 0.3); } break; }
      case 'alarm': { this.tone(880, 0.12, 'square', 0.12 * v, 0, 0); this.tone(660, 0.12, 'square', 0.12 * v, 0, 0.15); this.tone(880, 0.12, 'square', 0.12 * v, 0, 0.3); break; }
      case 'done': { this.tone(523, 0.12, 'triangle', 0.15 * v); this.tone(659, 0.12, 'triangle', 0.15 * v, 0, 0.1); this.tone(784, 0.25, 'triangle', 0.15 * v, 0, 0.2); break; }
      case 'age': { [262, 330, 392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.14 * v, 0, i * 0.12)); this.tone(131, 1.4, 'sawtooth', 0.08 * v, 0, 0.2); break; }
      case 'tech': { this.tone(660, 0.1, 'sine', 0.12 * v); this.tone(880, 0.1, 'sine', 0.12 * v, 0, 0.1); this.tone(1320, 0.3, 'sine', 0.1 * v, 0, 0.2); break; }
      case 'victory': { [392, 523, 659, 784, 1046].forEach((f, i) => { this.tone(f, 0.6, 'triangle', 0.16 * v, 0, i * 0.18); this.tone(f / 2, 0.6, 'sawtooth', 0.06 * v, 0, i * 0.18); }); break; }
      case 'defeat': { [392, 349, 311, 261].forEach((f, i) => this.tone(f, 0.9, 'sawtooth', 0.12 * v, -20, i * 0.4)); break; }
      case 'error': if (this.can(name, 200)) this.tone(200, 0.15, 'square', 0.08 * v, -60); break;
    }
  }
  startAmbient(faction) {
    if (!this.ctx || this.ambient) return;
    const c = this.ctx; const g = c.createGain(); g.gain.value = 0.0; g.connect(this.master);
    const o1 = c.createOscillator(), o2 = c.createOscillator(); o1.type = 'sine'; o2.type = 'triangle';
    o1.frequency.value = faction === 'elves' ? 110 : 55; o2.frequency.value = faction === 'elves' ? 165 : 82.5;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.08; const lg = c.createGain(); lg.gain.value = 0.02; lfo.connect(lg); lg.connect(g.gain);
    o1.connect(f); o2.connect(f); f.connect(g); o1.start(); o2.start(); lfo.start();
    g.gain.linearRampToValueAtTime(0.05, c.currentTime + 3);
    // wind/forest noise
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; const nf = c.createBiquadFilter(); nf.type = faction === 'elves' ? 'highpass' : 'lowpass'; nf.frequency.value = faction === 'elves' ? 3000 : 200; const ng = c.createGain(); ng.gain.value = faction === 'elves' ? 0.012 : 0.03; s.connect(nf); nf.connect(ng); ng.connect(this.master); s.start();
    this.ambient = { g, o1, o2, lfo, s, ng };
  }
  stopAmbient() { if (!this.ambient) return; const a = this.ambient; try { a.g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5); a.ng.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5); setTimeout(() => { a.o1.stop(); a.o2.stop(); a.lfo.stop(); a.s.stop(); }, 700); } catch (e) {} this.ambient = null; }
}
